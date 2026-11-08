begin;

-- A request is always stored with the learner as requester and the teacher as provider.
-- This column records who initiated it, so an offer to teach can use the same
-- credit reservation, session, chat, cancellation, and review workflows.
alter table public.session_requests
  add column if not exists initiator_id uuid references public.profiles(id) on delete restrict;

update public.session_requests set initiator_id = requester_id where initiator_id is null;

alter table public.session_requests
  alter column initiator_id set not null;

alter table public.session_requests
  drop constraint if exists session_requests_initiator_is_participant;
alter table public.session_requests
  add constraint session_requests_initiator_is_participant
  check (initiator_id in (requester_id, provider_id));

create index if not exists requests_initiator_status_idx
  on public.session_requests(initiator_id, status, created_at desc);

create or replace function public.create_session_request(
  p_provider_id uuid, p_skill_id uuid, p_message text, p_proposed_start_at timestamptz, p_requested_hours numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_requester uuid := auth.uid();
  v_request_id uuid;
  v_conversation_id uuid;
  v_expiry numeric;
begin
  if v_requester is null then raise exception 'Authentication required'; end if;
  if p_provider_id = v_requester then raise exception 'You cannot request a session from yourself'; end if;
  if not private.is_active_user(v_requester) or not private.is_active_user(p_provider_id) then raise exception 'Both accounts must be active'; end if;
  if private.are_blocked(v_requester, p_provider_id) then raise exception 'A block exists between these users'; end if;
  if not exists (select 1 from auth.users u where u.id = v_requester and u.email_confirmed_at is not null) then raise exception 'Confirm your email before requesting a session'; end if;
  if not exists (
    select 1 from public.profile_private p where p.user_id = v_requester
      and p.birth_date is not null
      and p.birth_date <= (current_date - make_interval(years => coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'minimum_age'), 18)))::date
      and p.accepted_terms_at is not null and p.accepted_privacy_at is not null
  ) then raise exception 'Complete your age and policy acceptance before requesting a session'; end if;
  if not exists (select 1 from public.skills s where s.id = p_skill_id and s.user_id = p_provider_id and s.skill_type = 'offered' and s.status = 'active') then raise exception 'The selected skill is not available from this provider'; end if;
  if p_proposed_start_at is null or p_proposed_start_at <= now() or p_requested_hours is null or p_requested_hours <= 0 or p_requested_hours > 24 then raise exception 'A future date and positive duration are required'; end if;
  if p_requested_hours <> round(p_requested_hours, 2) or p_requested_hours * 4 <> round(p_requested_hours * 4) then raise exception 'Duration must use quarter-hour increments'; end if;
  if char_length(coalesce(p_message, '')) > 3000 then raise exception 'Message is too long'; end if;
  if not exists (select 1 from public.credit_accounts a where a.user_id = v_requester and a.available_balance >= p_requested_hours) then raise exception 'Insufficient available credits'; end if;
  perform 1 from public.profiles p where p.id = v_requester for update;
  if exists (
    select 1 from public.session_requests r
    where r.requester_id = v_requester and r.provider_id = p_provider_id and r.skill_id = p_skill_id
      and r.status in ('pending', 'rescheduled', 'accepted') and r.expires_at > now()
  ) then raise exception 'An active request already exists for this member and skill'; end if;

  v_expiry := coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'request_expiry_hours'), 72);
  insert into public.session_requests(requester_id, provider_id, skill_id, initiator_id, message, proposed_start_at, requested_hours, expires_at)
  values (v_requester, p_provider_id, p_skill_id, v_requester, coalesce(p_message, ''), p_proposed_start_at, p_requested_hours, now() + make_interval(hours => v_expiry::int))
  returning id into v_request_id;
  insert into public.conversations(session_request_id, created_by) values (v_request_id, v_requester) returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id, user_id) values (v_conversation_id, v_requester), (v_conversation_id, p_provider_id);
  insert into public.notifications(user_id, notification_type, title, body, data)
  values (p_provider_id, 'session_request', 'New session request', 'You received a new session request.', jsonb_build_object('request_id', v_request_id));
  return v_request_id;
end;
$$;

create or replace function public.create_teaching_offer(
  p_recipient_id uuid,
  p_wanted_skill_id uuid,
  p_provider_skill_id uuid,
  p_message text,
  p_proposed_start_at timestamptz,
  p_requested_hours numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_provider uuid := auth.uid();
  v_request_id uuid;
  v_conversation_id uuid;
  v_expiry numeric;
begin
  if v_provider is null then raise exception 'Authentication required'; end if;
  if p_recipient_id is null or p_recipient_id = v_provider then raise exception 'You cannot offer a session to yourself'; end if;
  if not private.is_active_user(v_provider) or not private.is_active_user(p_recipient_id) then raise exception 'Both accounts must be active'; end if;
  if private.are_blocked(v_provider, p_recipient_id) then raise exception 'A block exists between these users'; end if;
  if not exists (select 1 from auth.users u where u.id = p_recipient_id and u.email_confirmed_at is not null) then raise exception 'The learner must confirm their email before receiving a session offer'; end if;
  if not exists (
    select 1 from public.profile_private p where p.user_id = p_recipient_id
      and p.birth_date is not null
      and p.birth_date <= (current_date - make_interval(years => coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'minimum_age'), 18)))::date
      and p.accepted_terms_at is not null and p.accepted_privacy_at is not null
  ) then raise exception 'The learner must complete age and policy acceptance before receiving a session offer'; end if;
  if not exists (
    select 1 from public.skills wanted
    join public.skills offered on offered.id = p_provider_skill_id
    where wanted.id = p_wanted_skill_id and wanted.user_id = p_recipient_id
      and wanted.skill_type = 'wanted' and wanted.status = 'active'
      and offered.user_id = v_provider and offered.skill_type = 'offered' and offered.status = 'active'
      and offered.category_id = wanted.category_id
  ) then raise exception 'Choose an active offered skill in the same category as the learner skill'; end if;
  perform 1 from public.profiles p where p.id = p_recipient_id for update;
  if p_proposed_start_at is null or p_proposed_start_at <= now() or p_requested_hours is null or p_requested_hours <= 0 or p_requested_hours > 24 then raise exception 'A future date and positive duration are required'; end if;
  if p_requested_hours <> round(p_requested_hours, 2) or p_requested_hours * 4 <> round(p_requested_hours * 4) then raise exception 'Duration must use quarter-hour increments'; end if;
  if char_length(coalesce(p_message, '')) > 3000 then raise exception 'Message is too long'; end if;
  if not exists (select 1 from public.credit_accounts a where a.user_id = p_recipient_id and a.available_balance >= p_requested_hours) then raise exception 'Insufficient available credits'; end if;
  if exists (
    select 1 from public.session_requests r
    where r.requester_id = p_recipient_id and r.provider_id = v_provider and r.skill_id = p_provider_skill_id
      and r.status in ('pending', 'rescheduled', 'accepted') and r.expires_at > now()
  ) then raise exception 'An active request already exists for this member and skill'; end if;

  v_expiry := coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'request_expiry_hours'), 72);
  insert into public.session_requests(requester_id, provider_id, skill_id, initiator_id, message, proposed_start_at, requested_hours, expires_at)
  values (p_recipient_id, v_provider, p_provider_skill_id, v_provider, coalesce(p_message, ''), p_proposed_start_at, p_requested_hours, now() + make_interval(hours => v_expiry::int))
  returning id into v_request_id;
  insert into public.conversations(session_request_id, created_by) values (v_request_id, v_provider) returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id, user_id) values (v_conversation_id, p_recipient_id), (v_conversation_id, v_provider);
  insert into public.notifications(user_id, notification_type, title, body, data)
  values (p_recipient_id, 'session_request', 'Teaching offer received', 'A member offered to teach a skill you want to learn.', jsonb_build_object('request_id', v_request_id));
  return v_request_id;
end;
$$;

create or replace function public.respond_to_session_request(p_request_id uuid, p_action text, p_new_start_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    if v_user <> v_req.initiator_id then raise exception 'Only the person who started the exchange can accept the rescheduled time'; end if;
  else
    if v_req.status <> 'pending' then raise exception 'Request is no longer pending'; end if;
    if v_user is null or v_user = v_req.initiator_id or v_user not in (v_req.requester_id, v_req.provider_id) then raise exception 'Only the recipient can answer this request'; end if;
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
  elsif p_action <> 'accept' then raise exception 'Action must be accept, reject, or reschedule';
  end if;

  if not private.is_active_user(v_req.requester_id) or not private.is_active_user(v_req.provider_id) or private.are_blocked(v_req.requester_id, v_req.provider_id) then raise exception 'These users cannot create a session'; end if;
  select * into v_account from public.credit_accounts where user_id = v_req.requester_id for update;
  if v_account.available_balance < v_req.requested_hours then raise exception 'Insufficient available credits'; end if;
  update public.credit_accounts set available_balance = available_balance - v_req.requested_hours, reserved_balance = reserved_balance + v_req.requested_hours where id = v_account.id;
  insert into public.credit_transactions(transaction_type, amount, requester_id, provider_id, description)
  values ('session_reservation', v_req.requested_hours, v_req.requester_id, v_req.provider_id, 'Reserve credits for session') returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id, account_id, available_delta, reserved_delta, available_before, available_after, reserved_before, reserved_after)
  values (v_tx, v_account.id, -v_req.requested_hours, v_req.requested_hours, v_account.available_balance, v_account.available_balance - v_req.requested_hours, v_account.reserved_balance, v_account.reserved_balance + v_req.requested_hours);
  insert into public.sessions(request_id, scheduled_start_at, duration_hours, meeting_url)
  values (p_request_id, v_req.proposed_start_at, v_req.requested_hours, 'https://meet.jit.si/timebank-' || encode(extensions.gen_random_bytes(18), 'hex')) returning id into v_session_id;
  if exists (
    select 1 from public.credit_transactions where requester_id = v_req.requester_id and transaction_type = 'session_reservation'
      and created_at >= date_trunc('day', now()) and id <> v_tx group by requester_id
      having sum(amount) + v_req.requested_hours > coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'daily_credit_limit'), 24)
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

create or replace function public.accept_rescheduled_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.respond_to_session_request(p_request_id, 'accept', null);
end;
$$;

-- Route decline/expiry notifications to the person who started the exchange,
-- independent of whether they were the learner or the teacher.
create or replace function private.notify_session_request_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_recipient uuid;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'accepted' then
    if v_actor = new.requester_id then v_recipient := new.provider_id;
    else v_recipient := new.requester_id;
    end if;
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_recipient, 'request_update', 'Request accepted', 'The request was accepted and the session is scheduled.', jsonb_build_object('request_id', new.id));
  elsif new.status = 'rejected' then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (new.initiator_id, 'request_update', 'Request declined', 'The other person is unable to complete this exchange.', jsonb_build_object('request_id', new.id));
  elsif new.status = 'expired' then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (new.initiator_id, 'request_update', 'Request expired', 'The request expired before it received a response.', jsonb_build_object('request_id', new.id));
  elsif new.status = 'cancelled' or new.status = 'disputed' then
    if v_actor = new.requester_id then v_recipient := new.provider_id;
    elsif v_actor = new.provider_id then v_recipient := new.requester_id;
    else v_recipient := null;
    end if;
    if v_recipient is not null then
      insert into public.notifications(user_id, notification_type, title, body, data)
      values (
        v_recipient,
        'request_update',
        case when new.status = 'cancelled' then 'Request cancelled' else 'Exchange under review' end,
        case when new.status = 'cancelled' then 'The other person cancelled the request or session.' else 'A problem was reported with this exchange.' end,
        jsonb_build_object('request_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.create_teaching_offer(uuid, uuid, uuid, text, timestamptz, numeric) from public, anon;
grant execute on function public.create_teaching_offer(uuid, uuid, uuid, text, timestamptz, numeric) to authenticated;

commit;
