begin;

-- Keep notification email delivery separate from the in-app notification write.
-- The outbox is append-only from application clients and processed by a server
-- function using the service role.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_outbox_pending_idx on public.email_outbox(available_at, created_at)
  where status in ('pending', 'processing');

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;
grant all on public.email_outbox to service_role;

create or replace function private.enqueue_important_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Chat messages and low-priority system notices stay in-app to avoid email noise.
  if new.notification_type in (
    'session_request',
    'request_update',
    'session_completed',
    'credit_activity',
    'review_received',
    'verification_update',
    'solidarity_update',
    'report_update'
  ) or (
    new.notification_type = 'system'
    and new.title in ('New contact request', 'Contact request accepted', 'Contact request declined')
  ) then
    insert into public.email_outbox(notification_id, user_id)
    values (new.id, new.user_id)
    on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_email_outbox on public.notifications;
create trigger notification_email_outbox
after insert on public.notifications
for each row execute function private.enqueue_important_notification_email();

-- Only the service role may claim or update queued deliveries. Claiming uses
-- SKIP LOCKED so concurrent worker invocations cannot send the same row twice.
create or replace function public.claim_email_outbox_batch(p_batch_size integer default 20)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  notification_type public.notification_type,
  notification_title text,
  notification_body text,
  notification_data jsonb,
  notification_created_at timestamptz,
  recipient_email text,
  email_confirmed boolean,
  preferred_language text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select o.id
    from public.email_outbox as o
    where o.attempts < 6
      and (
        (o.status = 'pending' and o.available_at <= now())
        or (o.status = 'processing' and o.locked_at < now() - interval '10 minutes')
      )
    order by o.available_at, o.created_at
    limit greatest(1, least(coalesce(p_batch_size, 20), 100))
    for update skip locked
  ), claimed as (
    update public.email_outbox as o
    set status = 'processing', attempts = o.attempts + 1,
        locked_at = now(), updated_at = now()
    from picked
    where o.id = picked.id
    returning o.id, o.notification_id, o.user_id
  )
  select c.id, c.notification_id, c.user_id,
         n.notification_type, n.title, n.body, n.data, n.created_at,
         u.email::text, u.email_confirmed_at is not null,
         coalesce(pp.preferred_language, 'es')
  from claimed as c
  join public.notifications as n on n.id = c.notification_id
  join auth.users as u on u.id = c.user_id
  left join public.profile_private as pp on pp.user_id = c.user_id;
end;
$$;

create or replace function public.finish_email_outbox_delivery(
  p_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempts integer;
begin
  if p_outcome not in ('sent', 'skipped', 'retry', 'failed') then
    raise exception 'Invalid email delivery outcome';
  end if;

  select attempts into v_attempts from public.email_outbox where id = p_id for update;
  if not found then raise exception 'Email outbox item not found'; end if;

  update public.email_outbox
  set status = case
        when p_outcome = 'sent' then 'sent'
        when p_outcome = 'skipped' then 'skipped'
        when p_outcome = 'failed' or v_attempts >= 6 then 'failed'
        else 'pending'
      end,
      available_at = case
        when p_outcome = 'retry' and v_attempts < 6
          then now() + make_interval(mins => least(60, power(2::numeric, least(v_attempts, 6))::integer))
        else available_at
      end,
      locked_at = null,
      sent_at = case when p_outcome = 'sent' then now() else sent_at end,
      provider_message_id = case when p_outcome = 'sent' then left(p_provider_message_id, 200) else provider_message_id end,
      last_error = case when p_outcome in ('retry', 'failed') then left(coalesce(p_error, 'Email delivery failed'), 500) else null end,
      updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.claim_email_outbox_batch(integer) from public, anon, authenticated;
revoke all on function public.finish_email_outbox_delivery(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_email_outbox_batch(integer) to service_role;
grant execute on function public.finish_email_outbox_delivery(uuid, text, text, text) to service_role;

commit;
