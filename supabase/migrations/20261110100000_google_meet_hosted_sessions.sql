begin;

create table public.google_meet_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null,
  encrypted_refresh_token text not null,
  granted_scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index google_meet_connections_email_idx on public.google_meet_connections(lower(google_email));
alter table public.google_meet_connections enable row level security;
revoke all on public.google_meet_connections from public, anon, authenticated;
grant all on public.google_meet_connections to service_role;

create table public.google_meet_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.google_meet_oauth_states enable row level security;
revoke all on public.google_meet_oauth_states from public, anon, authenticated;
grant all on public.google_meet_oauth_states to service_role;

create table public.google_meet_spaces (
  request_id uuid primary key references public.session_requests(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  space_name text,
  meeting_url text,
  status text not null default 'creating' check (status in ('creating', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ready' and space_name is not null and meeting_url is not null) or status <> 'ready')
);
alter table public.google_meet_spaces enable row level security;
revoke all on public.google_meet_spaces from public, anon, authenticated;
grant all on public.google_meet_spaces to service_role;

create or replace function public.claim_google_meet_space(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.session_requests%rowtype;
  v_space public.google_meet_spaces%rowtype;
begin
  if v_actor is null or not private.is_active_user(v_actor) then raise exception 'Active account required'; end if;
  -- Serialize room creation per request. Locking only the existing room row
  -- would not protect the first insert, when no row exists yet.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_request from public.session_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;

  if v_request.status = 'pending' then
    if v_actor = v_request.initiator_id or v_actor not in (v_request.requester_id, v_request.provider_id) then
      raise exception 'Only the recipient can accept this request';
    end if;
  elsif v_request.status = 'rescheduled' then
    if v_actor <> v_request.initiator_id then raise exception 'Only the initiator can accept the proposed time'; end if;
  else
    raise exception 'Request is no longer available for acceptance';
  end if;
  if v_request.expires_at <= now() then raise exception 'Request has expired'; end if;
  if not exists (select 1 from public.google_meet_connections c where c.user_id = v_request.provider_id) then
    raise exception 'The skill provider must connect Google Meet before accepting';
  end if;

  select * into v_space from public.google_meet_spaces where request_id = p_request_id for update;
  if found and v_space.status = 'ready' then
    return jsonb_build_object('status', 'ready', 'meeting_url', v_space.meeting_url, 'space_name', v_space.space_name);
  end if;
  if found and v_space.status = 'creating' and v_space.updated_at > now() - interval '4 minutes' then
    raise exception 'Google Meet is being prepared for this request. Try again shortly.';
  end if;

  insert into public.google_meet_spaces(request_id, provider_id, status, updated_at)
    values (p_request_id, v_request.provider_id, 'creating', now())
  on conflict (request_id) do update set provider_id = excluded.provider_id, status = 'creating', updated_at = now();
  return jsonb_build_object('status', 'creating', 'provider_id', v_request.provider_id);
end;
$$;

create or replace function public.respond_to_session_request(
  p_request_id uuid,
  p_action text,
  p_new_start_at timestamptz,
  p_meeting_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_req public.session_requests%rowtype;
  v_account public.credit_accounts%rowtype;
  v_session_id uuid;
  v_tx uuid;
begin
  if p_action is null or p_action not in ('accept', 'reject', 'reschedule') then
    raise exception 'Action must be accept, reject, or reschedule';
  end if;
  select * into v_req from public.session_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_user is null then raise exception 'Authentication required'; end if;

  if v_req.status = 'rescheduled' and p_action = 'accept' then
    if v_user <> v_req.initiator_id then raise exception 'Only the person who started this exchange can accept the proposed time'; end if;
  else
    if v_req.status <> 'pending' then raise exception 'Request is no longer pending'; end if;
    if v_user = v_req.initiator_id or v_user not in (v_req.requester_id, v_req.provider_id) then raise exception 'Only the recipient can answer this request'; end if;
  end if;

  if v_req.expires_at <= now() then update public.session_requests set status = 'expired' where id = p_request_id; return null; end if;
  if p_action = 'reject' then
    update public.session_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return null;
  elsif p_action = 'reschedule' then
    if p_new_start_at is null or p_new_start_at <= now() then raise exception 'A future proposed date is required'; end if;
    update public.session_requests set status = 'rescheduled', proposed_start_at = p_new_start_at, responded_at = now() where id = p_request_id;
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_req.initiator_id, 'request_update', 'New proposed session time', 'The recipient proposed another time.', jsonb_build_object('request_id', p_request_id));
    return null;
  end if;

  if p_meeting_url is null or p_meeting_url !~ '^https://meet\.google\.com/[a-z0-9-]{6,}([?][^[:space:]]*)?$' then
    raise exception 'A valid Google Meet link is required. Accept through the application.';
  end if;
  if not private.is_active_user(v_req.requester_id) or not private.is_active_user(v_req.provider_id)
     or private.are_blocked(v_req.requester_id, v_req.provider_id) then
    raise exception 'These users cannot create a session';
  end if;
  if not exists (
    select 1 from public.google_meet_spaces g where g.request_id = p_request_id
      and g.provider_id = v_req.provider_id and g.status = 'ready' and g.meeting_url = p_meeting_url
  ) then raise exception 'The Google Meet link was not created for this request'; end if;

  select * into v_account from public.credit_accounts where user_id = v_req.requester_id for update;
  if v_account.available_balance < v_req.requested_hours then raise exception 'Insufficient available credits'; end if;
  update public.credit_accounts set available_balance = available_balance - v_req.requested_hours,
    reserved_balance = reserved_balance + v_req.requested_hours where id = v_account.id;
  insert into public.credit_transactions(transaction_type, amount, requester_id, provider_id, description)
    values ('session_reservation', v_req.requested_hours, v_req.requester_id, v_req.provider_id, 'Reserve credits for session') returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id, account_id, available_delta, reserved_delta, available_before, available_after, reserved_before, reserved_after)
    values (v_tx, v_account.id, -v_req.requested_hours, v_req.requested_hours, v_account.available_balance,
      v_account.available_balance - v_req.requested_hours, v_account.reserved_balance, v_account.reserved_balance + v_req.requested_hours);
  insert into public.sessions(request_id, scheduled_start_at, duration_hours, meeting_url)
    values (p_request_id, v_req.proposed_start_at, v_req.requested_hours, p_meeting_url) returning id into v_session_id;

  if exists (
    select 1 from public.credit_transactions where requester_id = v_req.requester_id
      and transaction_type = 'session_reservation' and created_at >= date_trunc('day', now()) and id <> v_tx
    group by requester_id having sum(amount) + v_req.requested_hours > coalesce(
      (select (value #>> '{}')::numeric from public.app_settings where key = 'daily_credit_limit'), 24)
  ) then raise exception 'Daily credit limit exceeded'; end if;

  insert into public.session_participant_slots(session_id, user_id, time_slot)
  values
    (v_session_id, v_req.requester_id, tstzrange(v_req.proposed_start_at, v_req.proposed_start_at + make_interval(mins => (v_req.requested_hours * 60)::int), '[)')),
    (v_session_id, v_req.provider_id, tstzrange(v_req.proposed_start_at, v_req.proposed_start_at + make_interval(mins => (v_req.requested_hours * 60)::int), '[)'));

  if (select count(*) from public.sessions old_s join public.session_requests old_r on old_r.id = old_s.request_id
      where old_s.id <> v_session_id and old_s.status in ('completed', 'scheduled', 'awaiting_confirmation', 'disputed')
      and least(old_r.requester_id, old_r.provider_id) = least(v_req.requester_id, v_req.provider_id)
      and greatest(old_r.requester_id, old_r.provider_id) = greatest(v_req.requester_id, v_req.provider_id)
      and old_s.created_at >= now() - interval '30 days') >= 3 then
    insert into public.abuse_flags(user_id, other_user_id, session_id, flag_type, details)
      values (v_req.requester_id, v_req.provider_id, v_session_id, 'repeated_pair_sessions', jsonb_build_object('window_days', 30, 'previous_sessions_at_least', 3));
  end if;

  update public.session_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  return v_session_id;
end;
$$;

-- Keep the previous RPC signatures during rollout so older clients can still
-- reject or reschedule. They cannot accept without using the Meet server flow.
create or replace function public.respond_to_session_request(
  p_request_id uuid, p_action text, p_new_start_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'accept' then
    raise exception 'Update TimeBank to accept sessions with a Google Meet link';
  end if;
  return public.respond_to_session_request(p_request_id, p_action, p_new_start_at, null);
end;
$$;

create or replace function public.accept_rescheduled_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Update TimeBank to accept sessions with a Google Meet link';
end;
$$;

revoke all on function public.respond_to_session_request(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.respond_to_session_request(uuid, text, timestamptz, text) to authenticated;

revoke all on function public.claim_google_meet_space(uuid) from public, anon;
grant execute on function public.claim_google_meet_space(uuid) to authenticated;

commit;
