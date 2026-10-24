-- TimeBank complete Supabase schema
-- Apply with: supabase db push (recommended) or paste into the Supabase SQL Editor.
-- All application-facing identifiers and comments are in English.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.account_status as enum ('active', 'suspended', 'deactivated');
create type public.app_role as enum ('user', 'admin');
create type public.skill_type as enum ('offered', 'wanted');
create type public.skill_level as enum ('beginner', 'intermediate', 'advanced', 'expert', 'any');
create type public.skill_status as enum ('active', 'hidden', 'pending_review', 'rejected', 'removed');
create type public.request_status as enum ('pending', 'accepted', 'rejected', 'rescheduled', 'cancelled', 'expired', 'disputed', 'completed');
create type public.session_status as enum ('scheduled', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed');
create type public.transaction_type as enum ('welcome', 'session_reservation', 'session_payment', 'session_refund', 'solidarity_donation', 'solidarity_award', 'admin_adjustment');
create type public.verification_status as enum ('pending', 'approved', 'rejected');
create type public.solidarity_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.report_status as enum ('open', 'under_review', 'resolved', 'dismissed');
create type public.report_target_type as enum ('user', 'skill', 'message', 'session');
create type public.notification_type as enum ('session_request', 'request_update', 'session_reminder', 'session_completed', 'credit_activity', 'review_received', 'verification_update', 'solidarity_update', 'report_update', 'system');
create type public.credit_account_type as enum ('user', 'solidarity_fund');

-- Public profile data only. Sensitive/private fields live in profile_private.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  avatar_path text,
  bio text not null default '' check (char_length(bio) <= 2000),
  country_code char(2),
  timezone text not null default 'UTC',
  reputation_average numeric(3,2) not null default 0 check (reputation_average between 0 and 5),
  reputation_count integer not null default 0 check (reputation_count >= 0),
  is_verified boolean not null default false,
  offered_hours numeric(12,2) not null default 0 check (offered_hours >= 0),
  received_hours numeric(12,2) not null default 0 check (received_hours >= 0),
  completed_sessions integer not null default 0 check (completed_sessions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'es')),
  accepted_terms_at timestamptz,
  accepted_privacy_at timestamptz,
  account_status public.account_status not null default 'active',
  suspension_reason text,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'user',
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.profile_languages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  language_code text not null check (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  primary key (user_id, language_code)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null unique check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon text,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.categories(name,slug,icon,description) values
 ('Education','education','book','Teaching, tutoring and academic support.'),
 ('Technology','technology','laptop','Digital skills, software and technical help.'),
 ('Languages','languages','globe','Language lessons, practice and translation.'),
 ('Arts and Crafts','arts-and-crafts','palette','Creative arts, crafts and design.'),
 ('Health and Wellness','health-and-wellness','heart','Wellness, healthy habits and non-clinical support.'),
 ('Home and Everyday Help','home-and-everyday-help','home','Practical daily-life skills and assistance.'),
 ('Career and Business','career-and-business','briefcase','Career development, business and professional skills.'),
 ('Music and Performance','music-and-performance','musical-note','Music, performance and creative practice.'),
 ('Sports and Fitness','sports-and-fitness','fitness','Sports coaching and fitness activities.'),
 ('Other','other','ellipsis-horizontal','Skills that do not fit another category.')
on conflict (slug) do nothing;

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  skill_type public.skill_type not null,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  skill_level public.skill_level not null default 'any',
  language_code text,
  status public.skill_status not null default 'active',
  moderation_note text,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type public.credit_account_type not null,
  user_id uuid unique references public.profiles(id) on delete restrict,
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  reserved_balance numeric(12,2) not null default 0 check (reserved_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((account_type = 'user' and user_id is not null) or (account_type = 'solidarity_fund' and user_id is null))
);
create unique index credit_accounts_single_fund on public.credit_accounts(account_type) where account_type = 'solidarity_fund';

create table public.session_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  skill_id uuid not null references public.skills(id) on delete restrict,
  message text not null default '' check (char_length(message) <= 3000),
  proposed_start_at timestamptz not null,
  requested_hours numeric(5,2) not null check (requested_hours > 0 and requested_hours <= 24),
  status public.request_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '72 hours'),
  responded_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> provider_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.session_requests(id) on delete restrict,
  scheduled_start_at timestamptz not null,
  duration_hours numeric(5,2) not null check (duration_hours > 0 and duration_hours <= 24),
  meeting_url text not null,
  status public.session_status not null default 'scheduled',
  requester_confirmed_at timestamptz,
  provider_confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  dispute_opened_at timestamptz,
  dispute_reason text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- GiST exclusion prevents overlapping accepted sessions for either participant, even under concurrency.
create table public.session_participant_slots (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  time_slot tstzrange not null,
  is_active boolean not null default true,
  primary key (session_id, user_id),
  exclude using gist (user_id extensions.gist_uuid_ops with =, time_slot with &&) where (is_active)
);

-- Immutable transaction batches and per-account balance snapshots.
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type public.transaction_type not null,
  amount numeric(12,2) not null check (amount > 0),
  requester_id uuid references public.profiles(id) on delete restrict,
  provider_id uuid references public.profiles(id) on delete restrict,
  session_id uuid references public.sessions(id) on delete restrict,
  solidarity_request_id uuid,
  reference_id uuid,
  description text not null default '',
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.credit_ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.credit_transactions(id) on delete restrict,
  account_id uuid not null references public.credit_accounts(id) on delete restrict,
  available_delta numeric(12,2) not null default 0,
  reserved_delta numeric(12,2) not null default 0,
  available_before numeric(12,2) not null,
  available_after numeric(12,2) not null,
  reserved_before numeric(12,2) not null,
  reserved_after numeric(12,2) not null,
  created_at timestamptz not null default now(),
  check (available_after = available_before + available_delta),
  check (reserved_after = reserved_before + reserved_delta)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  unique (session_id, author_id),
  check (author_id <> recipient_id)
);

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_path text not null,
  status public.verification_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  check ((status = 'pending' and reviewed_at is null) or status <> 'pending')
);
create unique index one_pending_verification_per_user on public.identity_verifications(user_id) where status='pending';

create table public.solidarity_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(reason) between 10 and 3000),
  hours_requested numeric(8,2) not null check (hours_requested > 0),
  status public.solidarity_request_status not null default 'pending',
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_pending_solidarity_request_per_user on public.solidarity_requests(user_id) where status='pending';

alter table public.credit_transactions
  add constraint credit_transactions_solidarity_request_fk
  foreign key (solidarity_request_id) references public.solidarity_requests(id) on delete restrict;

create table public.solidarity_donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  solidarity_request_id uuid references public.solidarity_requests(id) on delete set null,
  transaction_id uuid not null unique references public.credit_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (category_id is null or solidarity_request_id is null)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  session_request_id uuid references public.session_requests(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 5000),
  attachment_path text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 2000),
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null check (char_length(title) <= 200),
  body text not null check (char_length(body) <= 2000),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.abuse_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  other_user_id uuid references public.profiles(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  flag_type text not null,
  details jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create view public.solidarity_fund_summary as
select coalesce((select a.available_balance from public.credit_accounts a where a.account_type='solidarity_fund'),0)::numeric(12,2) as available_credits,
       coalesce((select sum(d.amount) from public.solidarity_donations d),0)::numeric(12,2) as lifetime_donated_credits,
       (select count(*) from public.solidarity_requests r where r.status='approved')::bigint as approved_requests,
       (select count(distinct r.user_id) from public.solidarity_requests r where r.status='approved')::bigint as people_helped;

insert into public.credit_accounts (account_type) values ('solidarity_fund') on conflict do nothing;
insert into public.app_settings (key, value, description) values
 ('welcome_credits', '2'::jsonb, 'Credits awarded to a new account after sign-up.'),
 ('daily_credit_limit', '24'::jsonb, 'Maximum credits moved from a user account per day.'),
 ('request_expiry_hours', '72'::jsonb, 'Hours before an unanswered session request expires.'),
 ('confirmation_dispute_hours', '48'::jsonb, 'Hours before a one-sided session confirmation becomes disputed.'),
 ('minimum_age', '18'::jsonb, 'Minimum permitted account age in years.'),
 ('monthly_solidarity_limit', '8'::jsonb, 'Maximum solidarity credits awarded to one user per calendar month.')
on conflict (key) do nothing;

-- Shared helpers. SECURITY DEFINER routines use a fixed search_path and verify the caller.
create or replace function private.is_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'admin')
$$;

create or replace function private.is_active_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profile_private p where p.user_id = p_user_id and p.account_status = 'active')
$$;

create or replace function private.are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks b where (b.blocker_id = p_user_a and b.blocked_id = p_user_b) or (b.blocker_id = p_user_b and b.blocked_id = p_user_a))
$$;

create or replace function private.is_conversation_member(p_conversation_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.conversation_members m where m.conversation_id=p_conversation_id and m.user_id=p_user_id)
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function private.write_audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function private.prevent_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'This record is immutable'; end;
$$;

create or replace function private.validate_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is distinct from old.sender_id or new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id or new.created_at is distinct from old.created_at then
    raise exception 'Messages can only be edited by their original sender';
  end if;
  if new.body is distinct from old.body then new.edited_at:=now(); end if;
  return new;
end;
$$;

create or replace function private.audit_report_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.write_audit('report_created','report',new.id::text,jsonb_build_object('target_type',new.target_type,'target_id',new.target_id));
  return new;
end;
$$;

create or replace function private.prevent_profile_privilege_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) and (
    new.suspension_reason is distinct from old.suspension_reason or
    ((new.account_status is distinct from old.account_status or new.deactivated_at is distinct from old.deactivated_at)
      and not (old.account_status='active' and new.account_status='deactivated' and new.deactivated_at is not null))
  ) then
    raise exception 'Only an administrator may change account controls';
  end if;
  return new;
end;
$$;

create or replace function private.validate_private_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_min_age integer;
begin
  v_min_age:=coalesce((select (value #>> '{}')::integer from public.app_settings where key='minimum_age'),18);
  if new.birth_date is not null and new.birth_date > (current_date - make_interval(years => v_min_age))::date then
    raise exception 'You must be at least % years old to use TimeBank',v_min_age;
  end if;
  return new;
end;
$$;

create or replace function private.bootstrap_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_tx uuid; v_welcome numeric(12,2);
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)));
  insert into public.profile_private(user_id, birth_date, accepted_terms_at, accepted_privacy_at)
  values (new.id, nullif(new.raw_user_meta_data->>'birth_date','')::date, nullif(new.raw_user_meta_data->>'accepted_terms_at', '')::timestamptz, nullif(new.raw_user_meta_data->>'accepted_privacy_at', '')::timestamptz);
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  insert into public.credit_accounts(account_type, user_id) values ('user', new.id) returning id into v_account;
  v_welcome := coalesce((select (s.value #>> '{}')::numeric from public.app_settings s where s.key = 'welcome_credits'), 2);
  if v_welcome > 0 then
    update public.credit_accounts set available_balance = v_welcome where id = v_account;
    insert into public.credit_transactions(transaction_type, amount, requester_id, description)
    values ('welcome', v_welcome, new.id, 'Welcome credits') returning id into v_tx;
    insert into public.credit_ledger_entries(transaction_id, account_id, available_delta, reserved_delta, available_before, available_after, reserved_before, reserved_after)
    values (v_tx, v_account, v_welcome, 0, 0, v_welcome, 0, 0);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.bootstrap_new_user();

create or replace function public.create_session_request(
  p_provider_id uuid, p_skill_id uuid, p_message text, p_proposed_start_at timestamptz, p_requested_hours numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_requester uuid := auth.uid(); v_request_id uuid; v_conversation_id uuid; v_expiry numeric;
begin
  if v_requester is null then raise exception 'Authentication required'; end if;
  if p_provider_id = v_requester then raise exception 'You cannot request a session from yourself'; end if;
  if not private.is_active_user(v_requester) or not private.is_active_user(p_provider_id) then raise exception 'Both accounts must be active'; end if;
  if private.are_blocked(v_requester, p_provider_id) then raise exception 'A block exists between these users'; end if;
  if not exists (select 1 from auth.users u where u.id = v_requester and u.email_confirmed_at is not null) then raise exception 'Confirm your email before requesting a session'; end if;
  if not exists (select 1 from public.profile_private p where p.user_id=v_requester and p.birth_date is not null and p.birth_date <= (current_date - make_interval(years => coalesce((select (value #>> '{}')::integer from public.app_settings where key='minimum_age'),18)))::date and p.accepted_terms_at is not null and p.accepted_privacy_at is not null) then raise exception 'Complete your age and policy acceptance before requesting a session'; end if;
  if not exists (select 1 from public.skills s where s.id = p_skill_id and s.user_id = p_provider_id and s.skill_type = 'offered' and s.status = 'active') then raise exception 'The selected skill is not available from this provider'; end if;
  if p_proposed_start_at <= now() or p_requested_hours <= 0 then raise exception 'A future date and positive duration are required'; end if;
  if p_requested_hours<>round(p_requested_hours,2) or p_requested_hours*4<>round(p_requested_hours*4) then raise exception 'Duration must use quarter-hour increments'; end if;
  if not exists (select 1 from public.credit_accounts a where a.user_id = v_requester and a.available_balance >= p_requested_hours) then raise exception 'Insufficient available credits'; end if;
  v_expiry := coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'request_expiry_hours'), 72);
  insert into public.session_requests(requester_id, provider_id, skill_id, message, proposed_start_at, requested_hours, expires_at)
  values (v_requester, p_provider_id, p_skill_id, coalesce(p_message, ''), p_proposed_start_at, p_requested_hours, now() + make_interval(hours => v_expiry::int))
  returning id into v_request_id;
  insert into public.conversations(session_request_id, created_by) values (v_request_id, v_requester) returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id,user_id) values (v_conversation_id,v_requester),(v_conversation_id,p_provider_id);
  insert into public.notifications(user_id, notification_type, title, body, data)
  values (p_provider_id, 'session_request', 'New session request', 'You received a new session request.', jsonb_build_object('request_id', v_request_id));
  return v_request_id;
end;
$$;

create or replace function public.respond_to_session_request(p_request_id uuid, p_action text, p_new_start_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_req public.session_requests%rowtype; v_request_id uuid; v_account public.credit_accounts%rowtype; v_session_id uuid; v_tx uuid;
begin
  select * into v_req from public.session_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status='rescheduled' and p_action='accept' then
    if v_user<>v_req.requester_id then raise exception 'Only the requester can accept the proposed time'; end if;
    update public.session_requests set status='pending',responded_at=null where id=p_request_id;
  else
    if v_user <> v_req.provider_id then raise exception 'Request not found or not yours to answer'; end if;
    if v_req.status <> 'pending' then raise exception 'Request is no longer pending'; end if;
  end if;
  if v_req.expires_at <= now() then update public.session_requests set status='expired' where id=p_request_id; return null; end if;
  if p_action = 'reject' then
    update public.session_requests set status='rejected', responded_at=now() where id=p_request_id;
    return null;
  elsif p_action = 'reschedule' then
    if p_new_start_at is null or p_new_start_at <= now() then raise exception 'A future proposed date is required'; end if;
    update public.session_requests set status='rescheduled', proposed_start_at=p_new_start_at, responded_at=now() where id=p_request_id;
    insert into public.notifications(user_id,notification_type,title,body,data)
    values(v_req.requester_id,'request_update','New proposed session time','The provider proposed another time.',jsonb_build_object('request_id',p_request_id));
    return null;
  elsif p_action <> 'accept' then raise exception 'Action must be accept, reject, or reschedule';
  end if;
  if not private.is_active_user(v_req.requester_id) or not private.is_active_user(v_req.provider_id) or private.are_blocked(v_req.requester_id,v_req.provider_id) then raise exception 'These users cannot create a session'; end if;
  select * into v_account from public.credit_accounts where user_id=v_req.requester_id for update;
  if v_account.available_balance < v_req.requested_hours then raise exception 'Insufficient available credits'; end if;
  update public.credit_accounts set available_balance=available_balance-v_req.requested_hours, reserved_balance=reserved_balance+v_req.requested_hours where id=v_account.id;
  insert into public.credit_transactions(transaction_type, amount, requester_id, provider_id, description)
  values ('session_reservation', v_req.requested_hours, v_req.requester_id, v_req.provider_id, 'Reserve credits for session') returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,reserved_delta,available_before,available_after,reserved_before,reserved_after)
  values (v_tx,v_account.id,-v_req.requested_hours,v_req.requested_hours,v_account.available_balance,v_account.available_balance-v_req.requested_hours,v_account.reserved_balance,v_account.reserved_balance+v_req.requested_hours);
  update public.session_requests set status='accepted', responded_at=now() where id=p_request_id;
  insert into public.sessions(request_id,scheduled_start_at,duration_hours,meeting_url)
  values (p_request_id,v_req.proposed_start_at,v_req.requested_hours,'https://meet.jit.si/timebank-' || encode(extensions.gen_random_bytes(18),'hex')) returning id into v_session_id;
  if exists (select 1 from public.credit_transactions where requester_id=v_req.requester_id and transaction_type='session_reservation' and created_at >= date_trunc('day',now()) and id<>v_tx group by requester_id having sum(amount)+v_req.requested_hours > coalesce((select (value #>> '{}')::numeric from public.app_settings where key='daily_credit_limit'),24)) then
    raise exception 'Daily credit limit exceeded';
  end if;
  insert into public.session_participant_slots(session_id,user_id,time_slot)
  values (v_session_id,v_req.requester_id,tstzrange(v_req.proposed_start_at,v_req.proposed_start_at+make_interval(mins=>(v_req.requested_hours*60)::int),'[)')),
         (v_session_id,v_req.provider_id,tstzrange(v_req.proposed_start_at,v_req.proposed_start_at+make_interval(mins=>(v_req.requested_hours*60)::int),'[)'));
  if (select count(*) from public.sessions old_s join public.session_requests old_r on old_r.id=old_s.request_id
      where old_s.id<>v_session_id and old_s.status in ('completed','scheduled','awaiting_confirmation','disputed')
      and least(old_r.requester_id,old_r.provider_id)=least(v_req.requester_id,v_req.provider_id)
      and greatest(old_r.requester_id,old_r.provider_id)=greatest(v_req.requester_id,v_req.provider_id)
      and old_s.created_at>=now()-interval '30 days') >= 3 then
    insert into public.abuse_flags(user_id,other_user_id,session_id,flag_type,details)
    values(v_req.requester_id,v_req.provider_id,v_session_id,'repeated_pair_sessions',jsonb_build_object('window_days',30,'previous_sessions_at_least',3));
  end if;
  return v_session_id;
end;
$$;

create or replace function public.cancel_session_request(p_request_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_req public.session_requests%rowtype; v_session public.sessions%rowtype; v_account public.credit_accounts%rowtype; v_tx uuid;
begin
  select * into v_req from public.session_requests where id=p_request_id for update;
  if not found or v_user not in (v_req.requester_id,v_req.provider_id) then raise exception 'Request not found or not yours to cancel'; end if;
  if v_req.status in ('completed','cancelled','expired','rejected','disputed') then raise exception 'This request cannot be cancelled'; end if;
  select * into v_session from public.sessions where request_id=p_request_id for update;
  if v_session.id is not null then
    if v_session.scheduled_start_at <= now() then raise exception 'A session cannot be cancelled after it starts'; end if;
    select * into v_account from public.credit_accounts where user_id=v_req.requester_id for update;
    if v_account.reserved_balance < v_req.requested_hours then raise exception 'Reserved balance is inconsistent'; end if;
    update public.credit_accounts set available_balance=available_balance+v_req.requested_hours,reserved_balance=reserved_balance-v_req.requested_hours where id=v_account.id;
    insert into public.credit_transactions(transaction_type,amount,requester_id,provider_id,session_id,description)
    values ('session_refund',v_req.requested_hours,v_req.requester_id,v_req.provider_id,v_session.id,'Release credits after cancellation') returning id into v_tx;
    insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,reserved_delta,available_before,available_after,reserved_before,reserved_after)
    values(v_tx,v_account.id,v_req.requested_hours,-v_req.requested_hours,v_account.available_balance,v_account.available_balance+v_req.requested_hours,v_account.reserved_balance,v_account.reserved_balance-v_req.requested_hours);
    update public.sessions set status='cancelled',cancelled_at=now() where id=v_session.id;
    update public.session_participant_slots set is_active=false where session_id=v_session.id;
  end if;
  update public.session_requests set status='cancelled', cancellation_reason=p_reason where id=p_request_id;
end;
$$;

create or replace function public.confirm_session(p_session_id uuid)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_session public.sessions%rowtype; v_req public.session_requests%rowtype; v_account public.credit_accounts%rowtype; v_provider public.credit_accounts%rowtype; v_tx uuid;
begin
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  select * into v_req from public.session_requests where id=v_session.request_id for update;
  if v_user not in(v_req.requester_id,v_req.provider_id) then raise exception 'Only session participants can confirm'; end if;
  if v_session.status not in ('scheduled','awaiting_confirmation') then raise exception 'Session is not awaiting confirmation'; end if;
  if now()<v_session.scheduled_start_at+make_interval(mins=>(v_session.duration_hours*60)::int) then raise exception 'The scheduled session time has not ended yet'; end if;
  if v_user=v_req.requester_id then update public.sessions set requester_confirmed_at=coalesce(requester_confirmed_at,now()) where id=p_session_id;
  else update public.sessions set provider_confirmed_at=coalesce(provider_confirmed_at,now()) where id=p_session_id; end if;
  select * into v_session from public.sessions where id=p_session_id;
  if v_session.requester_confirmed_at is null or v_session.provider_confirmed_at is null then
    update public.sessions set status='awaiting_confirmation' where id=p_session_id;
    return 'awaiting_confirmation';
  end if;
  select * into v_account from public.credit_accounts where user_id=v_req.requester_id for update;
  select * into v_provider from public.credit_accounts where user_id=v_req.provider_id for update;
  if v_account.reserved_balance < v_session.duration_hours then raise exception 'Reserved balance is inconsistent'; end if;
  update public.credit_accounts set reserved_balance=reserved_balance-v_session.duration_hours where id=v_account.id;
  update public.credit_accounts set available_balance=available_balance+v_session.duration_hours where id=v_provider.id;
  insert into public.credit_transactions(transaction_type,amount,requester_id,provider_id,session_id,description)
  values('session_payment',v_session.duration_hours,v_req.requester_id,v_req.provider_id,p_session_id,'Completed session credit transfer') returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,reserved_delta,available_before,available_after,reserved_before,reserved_after)
  values(v_tx,v_account.id,0,-v_session.duration_hours,v_account.available_balance,v_account.available_balance,v_account.reserved_balance,v_account.reserved_balance-v_session.duration_hours),
        (v_tx,v_provider.id,v_session.duration_hours,0,v_provider.available_balance,v_provider.available_balance+v_session.duration_hours,v_provider.reserved_balance,v_provider.reserved_balance);
  update public.sessions set status='completed',completed_at=now() where id=p_session_id;
  update public.session_participant_slots set is_active=false where session_id=p_session_id;
  update public.session_requests set status='completed' where id=v_req.id;
  update public.profiles set completed_sessions=completed_sessions+1 where id in(v_req.requester_id,v_req.provider_id);
  update public.profiles set offered_hours=offered_hours+v_session.duration_hours where id=v_req.provider_id;
  update public.profiles set received_hours=received_hours+v_session.duration_hours where id=v_req.requester_id;
  return 'completed';
end;
$$;

create or replace function public.resolve_session_dispute(p_session_id uuid,p_outcome text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_session public.sessions%rowtype; v_req public.session_requests%rowtype; v_account public.credit_accounts%rowtype; v_provider public.credit_accounts%rowtype; v_tx uuid;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_outcome not in ('refund_requester','pay_provider') or length(trim(coalesce(p_note,''))) < 5 then raise exception 'A valid outcome and resolution note are required'; end if;
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found or v_session.status <> 'disputed' then raise exception 'Session is not in dispute'; end if;
  select * into v_req from public.session_requests where id=v_session.request_id for update;
  select * into v_account from public.credit_accounts where user_id=v_req.requester_id for update;
  select * into v_provider from public.credit_accounts where user_id=v_req.provider_id for update;
  if v_account.reserved_balance < v_session.duration_hours then raise exception 'Reserved balance is inconsistent'; end if;
  if p_outcome='refund_requester' then
    update public.credit_accounts set available_balance=available_balance+v_session.duration_hours,reserved_balance=reserved_balance-v_session.duration_hours where id=v_account.id;
    insert into public.credit_transactions(transaction_type,amount,requester_id,provider_id,session_id,description,performed_by)
    values('session_refund',v_session.duration_hours,v_req.requester_id,v_req.provider_id,p_session_id,p_note,auth.uid()) returning id into v_tx;
    insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,reserved_delta,available_before,available_after,reserved_before,reserved_after)
    values(v_tx,v_account.id,v_session.duration_hours,-v_session.duration_hours,v_account.available_balance,v_account.available_balance+v_session.duration_hours,v_account.reserved_balance,v_account.reserved_balance-v_session.duration_hours);
  else
    update public.credit_accounts set reserved_balance=reserved_balance-v_session.duration_hours where id=v_account.id;
    update public.credit_accounts set available_balance=available_balance+v_session.duration_hours where id=v_provider.id;
    insert into public.credit_transactions(transaction_type,amount,requester_id,provider_id,session_id,description,performed_by)
    values('session_payment',v_session.duration_hours,v_req.requester_id,v_req.provider_id,p_session_id,p_note,auth.uid()) returning id into v_tx;
    insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,reserved_delta,available_before,available_after,reserved_before,reserved_after)
    values(v_tx,v_account.id,0,-v_session.duration_hours,v_account.available_balance,v_account.available_balance,v_account.reserved_balance,v_account.reserved_balance-v_session.duration_hours),
          (v_tx,v_provider.id,v_session.duration_hours,0,v_provider.available_balance,v_provider.available_balance+v_session.duration_hours,v_provider.reserved_balance,v_provider.reserved_balance);
    update public.sessions set completed_at=now() where id=p_session_id;
    update public.session_requests set status='completed' where id=v_req.id;
  end if;
  update public.sessions set status=case when p_outcome='pay_provider' then 'completed'::public.session_status else 'cancelled'::public.session_status end,
    completed_at=case when p_outcome='pay_provider' then now() else null end,cancelled_at=case when p_outcome='refund_requester' then now() else null end,
    resolved_by=auth.uid(),resolution=p_outcome || ': ' || p_note where id=p_session_id;
  update public.session_requests set status=case when p_outcome='pay_provider' then 'completed'::public.request_status else 'cancelled'::public.request_status end where id=v_req.id;
  if p_outcome='pay_provider' then
    update public.profiles set completed_sessions=completed_sessions+1 where id in(v_req.requester_id,v_req.provider_id);
    update public.profiles set offered_hours=offered_hours+v_session.duration_hours where id=v_req.provider_id;
    update public.profiles set received_hours=received_hours+v_session.duration_hours where id=v_req.requester_id;
  end if;
  update public.session_participant_slots set is_active=false where session_id=p_session_id;
  perform private.write_audit('resolve_session_dispute','session',p_session_id::text,jsonb_build_object('outcome',p_outcome,'note',p_note));
end;
$$;

create or replace function public.donate_credits(p_amount numeric,p_category_id uuid default null,p_solidarity_request_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_account public.credit_accounts%rowtype; v_fund public.credit_accounts%rowtype; v_tx uuid; v_donation uuid; v_limit numeric;
begin
  if v_user is null or not private.is_active_user(v_user) then raise exception 'An active account is required'; end if;
  if p_amount <= 0 then raise exception 'Donation must be positive'; end if;
  if p_amount<>round(p_amount,2) then raise exception 'Credits support at most two decimal places'; end if;
  if p_category_id is not null and p_solidarity_request_id is not null then raise exception 'Choose a category or a request, not both'; end if;
  if p_category_id is not null and not exists(select 1 from public.categories where id=p_category_id and is_active) then raise exception 'Donation category is unavailable'; end if;
  if p_solidarity_request_id is not null and not exists(select 1 from public.solidarity_requests where id=p_solidarity_request_id and status='pending') then raise exception 'Target solidarity request is unavailable'; end if;
  v_limit:=coalesce((select (value #>> '{}')::numeric from public.app_settings where key='daily_credit_limit'),24);
  if (select coalesce(sum(amount),0) from public.credit_transactions where requester_id=v_user and transaction_type='solidarity_donation' and created_at >= date_trunc('day',now()))+p_amount>v_limit then raise exception 'Daily credit limit exceeded'; end if;
  select * into v_account from public.credit_accounts where user_id=v_user for update;
  select * into v_fund from public.credit_accounts where account_type='solidarity_fund' for update;
  if v_account.available_balance<p_amount then raise exception 'Insufficient available credits'; end if;
  update public.credit_accounts set available_balance=available_balance-p_amount where id=v_account.id;
  update public.credit_accounts set available_balance=available_balance+p_amount where id=v_fund.id;
  insert into public.credit_transactions(transaction_type,amount,requester_id,description)
  values('solidarity_donation',p_amount,v_user,'Donation to the solidarity fund') returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,available_before,available_after,reserved_before,reserved_after)
  values(v_tx,v_account.id,-p_amount,v_account.available_balance,v_account.available_balance-p_amount,v_account.reserved_balance,v_account.reserved_balance),
        (v_tx,v_fund.id,p_amount,v_fund.available_balance,v_fund.available_balance+p_amount,v_fund.reserved_balance,v_fund.reserved_balance);
  insert into public.solidarity_donations(donor_id,amount,category_id,solidarity_request_id,transaction_id)
  values(v_user,p_amount,p_category_id,p_solidarity_request_id,v_tx) returning id into v_donation;
  return v_donation;
end;
$$;

create or replace function public.resolve_solidarity_request(p_request_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.solidarity_requests%rowtype; v_fund public.credit_accounts%rowtype; v_user_account public.credit_accounts%rowtype; v_tx uuid; v_month_limit numeric; v_awarded numeric;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select * into v_req from public.solidarity_requests where id=p_request_id for update;
  if not found or v_req.status<>'pending' then raise exception 'Request is not pending'; end if;
  if not p_approve then
    update public.solidarity_requests set status='rejected',resolved_by=auth.uid(),resolved_at=now(),resolution_note=p_note where id=p_request_id;
    return;
  end if;
  if not private.is_active_user(v_req.user_id) then raise exception 'Solidarity credits cannot be awarded to an inactive account'; end if;
  v_month_limit:=coalesce((select (value #>> '{}')::numeric from public.app_settings where key='monthly_solidarity_limit'),8);
  select coalesce(sum(hours_requested),0) into v_awarded from public.solidarity_requests where user_id=v_req.user_id and status='approved' and resolved_at>=date_trunc('month',now());
  if v_awarded+v_req.hours_requested>v_month_limit then raise exception 'Monthly solidarity limit exceeded'; end if;
  select * into v_fund from public.credit_accounts where account_type='solidarity_fund' for update;
  select * into v_user_account from public.credit_accounts where user_id=v_req.user_id for update;
  if v_fund.available_balance<v_req.hours_requested then raise exception 'Solidarity fund has insufficient credits'; end if;
  update public.credit_accounts set available_balance=available_balance-v_req.hours_requested where id=v_fund.id;
  update public.credit_accounts set available_balance=available_balance+v_req.hours_requested where id=v_user_account.id;
  insert into public.credit_transactions(transaction_type,amount,provider_id,solidarity_request_id,description,performed_by)
  values('solidarity_award',v_req.hours_requested,v_req.user_id,p_request_id,coalesce(p_note,'Approved solidarity request'),auth.uid()) returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,available_before,available_after,reserved_before,reserved_after)
  values(v_tx,v_fund.id,-v_req.hours_requested,v_fund.available_balance,v_fund.available_balance-v_req.hours_requested,v_fund.reserved_balance,v_fund.reserved_balance),
        (v_tx,v_user_account.id,v_req.hours_requested,v_user_account.available_balance,v_user_account.available_balance+v_req.hours_requested,v_user_account.reserved_balance,v_user_account.reserved_balance);
  update public.solidarity_requests set status='approved',resolved_by=auth.uid(),resolved_at=now(),resolution_note=p_note where id=p_request_id;
  perform private.write_audit('approve_solidarity_request','solidarity_request',p_request_id::text,jsonb_build_object('hours',v_req.hours_requested));
end;
$$;

create or replace function public.cancel_solidarity_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.solidarity_requests set status='cancelled' where id=p_request_id and user_id=auth.uid() and status='pending';
  if not found then raise exception 'Pending solidarity request not found'; end if;
end;
$$;

create or replace function public.adjust_credits(p_user_id uuid,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_tx uuid;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_amount=0 or p_amount<>round(p_amount,2) or length(trim(coalesce(p_reason,'')))<5 then raise exception 'A non-zero adjustment with at most two decimal places and a reason is required'; end if;
  select * into v_account from public.credit_accounts where user_id=p_user_id for update;
  if not found then raise exception 'User credit account not found'; end if;
  if v_account.available_balance+p_amount<0 then raise exception 'Adjustment would create a negative balance'; end if;
  update public.credit_accounts set available_balance=available_balance+p_amount where id=v_account.id;
  insert into public.credit_transactions(transaction_type,amount,provider_id,description,performed_by)
  values('admin_adjustment',abs(p_amount),p_user_id,p_reason,auth.uid()) returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id,account_id,available_delta,available_before,available_after,reserved_before,reserved_after)
  values(v_tx,v_account.id,p_amount,v_account.available_balance,v_account.available_balance+p_amount,v_account.reserved_balance,v_account.reserved_balance);
  perform private.write_audit('adjust_credits','credit_account',p_user_id::text,jsonb_build_object('amount',p_amount,'reason',p_reason));
  return v_tx;
end;
$$;

create or replace function public.set_user_status(p_user_id uuid,p_status public.account_status,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status='suspended' and length(trim(coalesce(p_reason,'')))<5 then raise exception 'Suspension reason is required'; end if;
  update public.profile_private set account_status=p_status,suspension_reason=case when p_status='suspended' then p_reason else null end,deactivated_at=case when p_status='deactivated' then now() else null end where user_id=p_user_id;
  if not found then raise exception 'User not found'; end if;
  perform private.write_audit('set_user_status','user',p_user_id::text,jsonb_build_object('status',p_status,'reason',p_reason));
end;
$$;

create or replace function public.set_user_role(p_user_id uuid,p_role public.app_role,p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_grant then
    insert into public.user_roles(user_id,role,granted_by) values(p_user_id,p_role,auth.uid()) on conflict(user_id,role) do nothing;
  else
    if p_user_id=auth.uid() and p_role='admin' then raise exception 'You cannot remove your own administrator role'; end if;
    delete from public.user_roles where user_id=p_user_id and role=p_role;
  end if;
  perform private.write_audit(case when p_grant then 'grant_user_role' else 'revoke_user_role' end,'user',p_user_id::text,jsonb_build_object('role',p_role));
end;
$$;

create or replace function public.deactivate_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.session_requests r left join public.sessions s on s.request_id=r.id
    where v_user in(r.requester_id,r.provider_id) and (r.status in('pending','rescheduled','accepted','disputed') or s.status in('scheduled','awaiting_confirmation','disputed'))) then
    raise exception 'Finish or cancel your open sessions and requests before deactivating your account';
  end if;
  update public.profile_private set account_status='deactivated',deactivated_at=now() where user_id=v_user and account_status='active';
  if not found then raise exception 'Account is already inactive'; end if;
end;
$$;

create or replace function public.review_identity_verification(p_verification_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_record public.identity_verifications%rowtype;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select * into v_record from public.identity_verifications where id=p_verification_id for update;
  if not found or v_record.status<>'pending' then raise exception 'Verification is not pending'; end if;
  update public.identity_verifications set status=case when p_approve then 'approved'::public.verification_status else 'rejected'::public.verification_status end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=p_verification_id;
  if p_approve then
    update public.profiles set is_verified=true where id=v_record.user_id;
  elsif not exists(select 1 from public.identity_verifications where user_id=v_record.user_id and status='approved' and id<>p_verification_id) then
    update public.profiles set is_verified=false where id=v_record.user_id;
  end if;
  perform private.write_audit('review_identity_verification','identity_verification',p_verification_id::text,jsonb_build_object('approved',p_approve,'note',p_note));
end;
$$;

create or replace function public.accept_rescheduled_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_req public.session_requests%rowtype;
begin
  select * into v_req from public.session_requests where id=p_request_id for update;
  if not found or v_user<>v_req.requester_id or v_req.status<>'rescheduled' then raise exception 'No proposed time is awaiting your response'; end if;
  if not private.is_active_user(v_req.requester_id) or not private.is_active_user(v_req.provider_id) or private.are_blocked(v_req.requester_id,v_req.provider_id) then raise exception 'These users cannot create a session'; end if;
  return public.respond_to_session_request(p_request_id,'accept',null);
end;
$$;

create or replace function public.submit_review(p_session_id uuid,p_rating smallint,p_comment text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_session public.sessions%rowtype; v_req public.session_requests%rowtype; v_recipient uuid; v_review uuid;
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select * into v_session from public.sessions where id=p_session_id;
  select * into v_req from public.session_requests where id=v_session.request_id;
  if v_session.status<>'completed' or v_user not in(v_req.requester_id,v_req.provider_id) then raise exception 'Only participants of completed sessions can review'; end if;
  v_recipient:=case when v_user=v_req.requester_id then v_req.provider_id else v_req.requester_id end;
  insert into public.reviews(session_id,author_id,recipient_id,rating,comment) values(p_session_id,v_user,v_recipient,p_rating,coalesce(p_comment,'')) returning id into v_review;
  update public.profiles set reputation_average=(select avg(rating)::numeric(3,2) from public.reviews where recipient_id=v_recipient),reputation_count=(select count(*) from public.reviews where recipient_id=v_recipient) where id=v_recipient;
  return v_review;
end;
$$;

create or replace function public.expire_session_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.session_requests set status='expired' where status in ('pending','rescheduled') and expires_at<=now();
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.mark_unconfirmed_sessions_disputed()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_hours integer; v_count integer;
begin
  v_hours:=coalesce((select (value #>> '{}')::integer from public.app_settings where key='confirmation_dispute_hours'),48);
  update public.sessions set status='disputed',dispute_opened_at=now(),dispute_reason='Only one participant confirmed within the confirmation window'
  where status='awaiting_confirmation'
    and coalesce(requester_confirmed_at,provider_confirmed_at,scheduled_start_at+make_interval(mins=>(duration_hours*60)::int)) <= now()-make_interval(hours=>v_hours)
    and (requester_confirmed_at is null or provider_confirmed_at is null);
  get diagnostics v_count=row_count;
  update public.session_requests r set status='disputed' from public.sessions s where s.request_id=r.id and s.status='disputed' and r.status='accepted';
  return v_count;
end;
$$;

create or replace function public.open_session_dispute(p_session_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_req public.session_requests%rowtype; v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  select * into v_req from public.session_requests where id=v_session.request_id;
  if v_user not in(v_req.requester_id,v_req.provider_id) or v_session.status not in('scheduled','awaiting_confirmation') then raise exception 'You cannot dispute this session'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Please explain the dispute'; end if;
  update public.sessions set status='disputed',dispute_opened_at=now(),dispute_reason=p_reason where id=p_session_id;
  update public.session_requests set status='disputed' where id=v_req.id;
end;
$$;

create or replace function public.update_app_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_key not in ('welcome_credits','daily_credit_limit','request_expiry_hours','confirmation_dispute_hours','minimum_age','monthly_solidarity_limit') then raise exception 'Unknown setting'; end if;
  if jsonb_typeof(p_value)<>'number' or (p_value #>> '{}')::numeric<0 then raise exception 'Setting must be a non-negative number'; end if;
  update public.app_settings set value=p_value,updated_by=auth.uid(),updated_at=now() where key=p_key;
  perform private.write_audit('update_app_setting','app_setting',p_key,jsonb_build_object('value',p_value));
end;
$$;

create or replace function public.update_report(p_report_id uuid,p_status public.report_status,p_note text,p_assigned_to uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status in ('resolved','dismissed') and length(trim(coalesce(p_note,'')))<5 then raise exception 'A resolution note is required'; end if;
  update public.reports set status=p_status,assigned_to=p_assigned_to,resolution_note=p_note,
    resolved_at=case when p_status in ('resolved','dismissed') then now() else null end where id=p_report_id;
  if not found then raise exception 'Report not found'; end if;
  perform private.write_audit('update_report','report',p_report_id::text,jsonb_build_object('status',p_status,'note',p_note,'assigned_to',p_assigned_to));
end;
$$;

create or replace function public.get_admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'users_total',(select count(*) from public.profiles),
    'users_active',(select count(*) from public.profile_private where account_status='active'),
    'completed_sessions',(select count(*) from public.sessions where status='completed'),
    'hours_exchanged',(select coalesce(sum(duration_hours),0) from public.sessions where status='completed'),
    'hours_donated',(select coalesce(sum(amount),0) from public.solidarity_donations),
    'people_helped',(select count(distinct user_id) from public.solidarity_requests where status='approved'),
    'open_reports',(select count(*) from public.reports where status in ('open','under_review')),
    'pending_verifications',(select count(*) from public.identity_verifications where status='pending'),
    'disputed_sessions',(select count(*) from public.sessions where status='disputed'),
    'popular_categories',(select coalesce(jsonb_agg(jsonb_build_object('category',x.name,'skill_count',x.skill_count) order by x.skill_count desc),'[]'::jsonb) from (select c.name,count(s.id) skill_count from public.categories c left join public.skills s on s.category_id=c.id and s.status='active' group by c.id,c.name order by count(s.id) desc limit 10) x),
    'active_countries',(select coalesce(jsonb_agg(jsonb_build_object('country_code',x.country_code,'sessions',x.session_count) order by x.session_count desc),'[]'::jsonb) from (select p.country_code,count(*) session_count from public.sessions s join public.session_requests r on r.id=s.request_id join public.profiles p on p.id in(r.requester_id,r.provider_id) where s.status='completed' and p.country_code is not null group by p.country_code order by count(*) desc limit 10) x)
  );
end;
$$;

-- Indexes for search, dashboards, moderation and time-based queries.
create index skills_owner_status_idx on public.skills(user_id,status);
create index skills_search_idx on public.skills using gin (to_tsvector('simple', title || ' ' || description));
create index skills_category_type_idx on public.skills(category_id,skill_type,status);
create index availability_user_weekday_idx on public.availability(user_id,weekday) where is_active;
create index requests_requester_status_idx on public.session_requests(requester_id,status,created_at desc);
create index requests_provider_status_idx on public.session_requests(provider_id,status,created_at desc);
create index requests_expiry_idx on public.session_requests(expires_at) where status in ('pending','rescheduled');
create index sessions_start_idx on public.sessions(scheduled_start_at,status);
create index transactions_user_time_idx on public.credit_transactions(requester_id,created_at desc);
create index transactions_provider_time_idx on public.credit_transactions(provider_id,created_at desc);
create index ledger_account_time_idx on public.credit_ledger_entries(account_id,created_at desc);
create index reviews_recipient_time_idx on public.reviews(recipient_id,created_at desc);
create index solidarity_status_time_idx on public.solidarity_requests(status,created_at desc);
create index messages_conversation_time_idx on public.messages(conversation_id,created_at desc);
create index reports_status_time_idx on public.reports(status,created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;
create index audit_created_at_idx on public.admin_audit_log(created_at desc);

-- Keep profile totals/reputation derived from completed sessions and reviews.
create or replace function private.refresh_reputation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set reputation_average=coalesce((select avg(rating)::numeric(3,2) from public.reviews where recipient_id=new.recipient_id),0),reputation_count=(select count(*) from public.reviews where recipient_id=new.recipient_id) where id=new.recipient_id;
  return new;
end;
$$;
create trigger review_refresh_reputation after insert on public.reviews for each row execute function private.refresh_reputation();

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger profile_private_touch before update on public.profile_private for each row execute function private.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function private.touch_updated_at();
create trigger skills_touch before update on public.skills for each row execute function private.touch_updated_at();
create trigger requests_touch before update on public.session_requests for each row execute function private.touch_updated_at();
create trigger sessions_touch before update on public.sessions for each row execute function private.touch_updated_at();
create trigger credit_accounts_touch before update on public.credit_accounts for each row execute function private.touch_updated_at();
create trigger solidarity_requests_touch before update on public.solidarity_requests for each row execute function private.touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function private.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function private.touch_updated_at();
create trigger profile_private_controls before update on public.profile_private for each row execute function private.prevent_profile_privilege_changes();
create trigger profile_private_age_check before insert or update of birth_date on public.profile_private for each row execute function private.validate_private_profile();

create trigger transactions_immutable before update or delete on public.credit_transactions for each row execute function private.prevent_mutation();
create trigger ledger_immutable before update or delete on public.credit_ledger_entries for each row execute function private.prevent_mutation();
create trigger reviews_immutable before update or delete on public.reviews for each row execute function private.prevent_mutation();
create trigger audit_immutable before update or delete on public.admin_audit_log for each row execute function private.prevent_mutation();
create trigger message_update_guard before update on public.messages for each row execute function private.validate_message_update();
create trigger audit_report_created after insert on public.reports for each row execute function private.audit_report_creation();

-- RLS is enabled on every application table, including private data and ledger tables.
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_roles enable row level security;
alter table public.profile_languages enable row level security;
alter table public.categories enable row level security;
alter table public.skills enable row level security;
alter table public.availability enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.session_requests enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participant_slots enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_ledger_entries enable row level security;
alter table public.reviews enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.solidarity_requests enable row level security;
alter table public.solidarity_donations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.push_devices enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.abuse_flags enable row level security;
alter table public.app_settings enable row level security;

create policy profiles_public_read on public.profiles for select to anon,authenticated using (true);
create policy profiles_owner_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy profiles_admin_update on public.profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy profile_private_owner_read on public.profile_private for select to authenticated using (user_id=auth.uid() or private.is_admin());
create policy profile_private_owner_update on public.profile_private for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy profile_private_admin_update on public.profile_private for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy user_roles_read_self_admin on public.user_roles for select to authenticated using (user_id=auth.uid() or private.is_admin());
create policy profile_languages_read on public.profile_languages for select to anon,authenticated using (true);
create policy profile_languages_owner_manage on public.profile_languages for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy categories_active_read on public.categories for select to anon,authenticated using (is_active or private.is_admin());
create policy categories_admin_manage on public.categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy skills_public_read on public.skills for select to anon,authenticated using (status='active' or user_id=auth.uid() or private.is_admin());
create policy skills_owner_manage on public.skills for all to authenticated using (user_id=auth.uid() and private.is_active_user(auth.uid())) with check (user_id=auth.uid() and private.is_active_user(auth.uid()));
create policy skills_admin_manage on public.skills for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy availability_public_read on public.availability for select to anon,authenticated using (is_active or user_id=auth.uid() or private.is_admin());
create policy availability_owner_manage on public.availability for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy credit_accounts_owner_admin_read on public.credit_accounts for select to authenticated using (user_id=auth.uid() or account_type='solidarity_fund' or private.is_admin());
create policy requests_participant_read on public.session_requests for select to authenticated using (requester_id=auth.uid() or provider_id=auth.uid() or private.is_admin());
create policy requests_admin_read on public.session_requests for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy sessions_participant_read on public.sessions for select to authenticated using (exists(select 1 from public.session_requests r where r.id=request_id and auth.uid() in(r.requester_id,r.provider_id)) or private.is_admin());
create policy sessions_admin_read on public.sessions for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy session_slots_participant_read on public.session_participant_slots for select to authenticated using (user_id=auth.uid() or private.is_admin());
create policy transactions_owner_admin_read on public.credit_transactions for select to authenticated using (requester_id=auth.uid() or provider_id=auth.uid() or performed_by=auth.uid() or private.is_admin());
create policy ledger_owner_admin_read on public.credit_ledger_entries for select to authenticated using (exists(select 1 from public.credit_accounts a where a.id=account_id and a.user_id=auth.uid()) or private.is_admin());
create policy reviews_public_read on public.reviews for select to anon,authenticated using (true);
create policy verifications_owner_admin_read on public.identity_verifications for select to authenticated using (user_id=auth.uid() or private.is_admin());
create policy verifications_owner_insert on public.identity_verifications for insert to authenticated with check (user_id=auth.uid() and document_path like auth.uid()::text || '/%' and status='pending' and reviewed_by is null and reviewed_at is null and private.is_active_user(auth.uid()));
create policy verifications_admin_update on public.identity_verifications for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy solidarity_requests_owner_admin_read on public.solidarity_requests for select to authenticated using (user_id=auth.uid() or private.is_admin());
create policy solidarity_requests_owner_insert on public.solidarity_requests for insert to authenticated with check (user_id=auth.uid() and status='pending' and resolved_by is null and resolved_at is null and private.is_active_user(auth.uid()));
create policy solidarity_requests_admin_update on public.solidarity_requests for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy donations_owner_admin_read on public.solidarity_donations for select to authenticated using (donor_id=auth.uid() or private.is_admin());
create policy conversations_member_read on public.conversations for select to authenticated using (private.is_conversation_member(id) or private.is_admin());
create policy conversation_members_read on public.conversation_members for select to authenticated using (private.is_conversation_member(conversation_id) or private.is_admin());
create policy messages_member_read on public.messages for select to authenticated using (private.is_conversation_member(conversation_id) or private.is_admin());
create policy messages_member_insert on public.messages for insert to authenticated with check (sender_id=auth.uid() and private.is_active_user(auth.uid()) and private.is_conversation_member(conversation_id));
create policy messages_sender_update on public.messages for update to authenticated using (sender_id=auth.uid()) with check (sender_id=auth.uid());
create policy blocks_owner_read on public.user_blocks for select to authenticated using (blocker_id=auth.uid() or blocked_id=auth.uid() or private.is_admin());
create policy blocks_owner_insert on public.user_blocks for insert to authenticated with check (blocker_id=auth.uid());
create policy blocks_owner_delete on public.user_blocks for delete to authenticated using (blocker_id=auth.uid());
create policy reports_reporter_admin_read on public.reports for select to authenticated using (reporter_id=auth.uid() or private.is_admin());
create policy reports_reporter_insert on public.reports for insert to authenticated with check (reporter_id=auth.uid() and private.is_active_user(auth.uid()));
create policy reports_admin_update on public.reports for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy notifications_owner_read on public.notifications for select to authenticated using (user_id=auth.uid() or private.is_admin());
create policy notifications_owner_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy push_devices_owner_manage on public.push_devices for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy audit_admin_read on public.admin_audit_log for select to authenticated using (private.is_admin());
create policy abuse_flags_admin_read on public.abuse_flags for select to authenticated using (private.is_admin());
create policy abuse_flags_admin_update on public.abuse_flags for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin_manage on public.app_settings for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- No direct client-side writes to balances, requests/sessions state, reviews, identity decisions,
-- solidarity fund, credit ledger, or audit trail. Use the SECURITY DEFINER RPCs above.
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin(uuid), private.is_active_user(uuid), private.are_blocked(uuid,uuid), private.is_conversation_member(uuid,uuid) to anon, authenticated;
grant select on public.profiles,public.profile_languages,public.categories,public.skills,public.availability,public.reviews to anon,authenticated;
grant select on public.solidarity_fund_summary to anon,authenticated;
grant select on public.profile_private,public.user_roles,public.credit_accounts,public.credit_transactions,public.credit_ledger_entries,
  public.session_requests,public.sessions,public.identity_verifications,public.solidarity_requests,public.solidarity_donations,
  public.conversations,public.conversation_members,public.messages,public.user_blocks,public.reports,public.notifications,
  public.push_devices,public.admin_audit_log,public.app_settings to authenticated;
grant select on public.abuse_flags to authenticated;
grant update(reviewed_by,reviewed_at) on public.abuse_flags to authenticated;
grant insert,update,delete on public.categories,public.skills,public.profile_languages,public.availability,public.user_blocks,public.push_devices to authenticated;
revoke insert,delete on public.profiles from anon,authenticated;
grant insert,update on public.messages to authenticated;
grant insert on public.reports,public.identity_verifications,public.solidarity_requests to authenticated;
grant update(read_at) on public.notifications to authenticated;
revoke all on public.credit_accounts, public.credit_transactions, public.credit_ledger_entries, public.session_participant_slots from anon, authenticated;
grant select on public.credit_accounts, public.credit_transactions, public.credit_ledger_entries to authenticated;
revoke insert,update,delete on public.user_roles,public.session_requests,public.sessions,public.session_participant_slots,
  public.credit_accounts,public.credit_transactions,public.credit_ledger_entries,public.solidarity_donations,
  public.conversations,public.conversation_members,public.admin_audit_log from anon,authenticated;
revoke insert,delete on public.abuse_flags from anon,authenticated;
revoke insert, update, delete on public.session_requests, public.sessions, public.reviews, public.identity_verifications,
  public.solidarity_requests, public.solidarity_donations, public.conversations, public.conversation_members,
  public.admin_audit_log from anon, authenticated;
revoke update,delete on public.reports from anon,authenticated;
revoke update on public.profile_private from authenticated;
revoke insert,update,delete on public.app_settings from anon,authenticated;
grant insert on public.reviews to authenticated;
grant insert on public.solidarity_requests to authenticated;
grant insert on public.identity_verifications to authenticated;
grant insert on public.reports to authenticated;
grant insert, update on public.messages to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant insert, update, delete on public.profiles, public.profile_languages, public.skills, public.availability,
  public.user_blocks, public.push_devices to authenticated;
revoke update on public.profiles from authenticated;
grant update(display_name,avatar_path,bio,country_code,timezone) on public.profiles to authenticated;
grant update(birth_date,preferred_language,accepted_terms_at,accepted_privacy_at) on public.profile_private to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

revoke execute on function public.respond_to_session_request(uuid,text,timestamptz) from public,anon;
revoke execute on function public.cancel_session_request(uuid,text) from public,anon;
revoke execute on function public.confirm_session(uuid) from public,anon;
revoke execute on function public.resolve_session_dispute(uuid,text,text) from public,anon;
revoke execute on function public.donate_credits(numeric,uuid,uuid) from public,anon;
revoke execute on function public.resolve_solidarity_request(uuid,boolean,text) from public,anon;
revoke execute on function public.cancel_solidarity_request(uuid) from public,anon;
revoke execute on function public.adjust_credits(uuid,numeric,text) from public,anon;
revoke execute on function public.set_user_status(uuid,public.account_status,text) from public,anon;
revoke execute on function public.set_user_role(uuid,public.app_role,boolean) from public,anon;
revoke execute on function public.deactivate_my_account() from public,anon;
revoke execute on function public.submit_review(uuid,smallint,text) from public,anon;
revoke execute on function public.review_identity_verification(uuid,boolean,text) from public,anon;
revoke execute on function public.accept_rescheduled_request(uuid) from public,anon;
revoke execute on function public.open_session_dispute(uuid,text) from public,anon;
revoke execute on function public.update_app_setting(text,jsonb) from public,anon;
revoke execute on function public.update_report(uuid,public.report_status,text,uuid) from public,anon;
revoke execute on function public.get_admin_dashboard_stats() from public,anon;
revoke execute on function public.create_session_request(uuid,uuid,text,timestamptz,numeric) from public, anon;
grant execute on function public.create_session_request(uuid,uuid,text,timestamptz,numeric) to authenticated;
grant execute on function public.respond_to_session_request(uuid,text,timestamptz) to authenticated;
grant execute on function public.cancel_session_request(uuid,text) to authenticated;
grant execute on function public.confirm_session(uuid) to authenticated;
grant execute on function public.resolve_session_dispute(uuid,text,text) to authenticated;
grant execute on function public.donate_credits(numeric,uuid,uuid) to authenticated;
grant execute on function public.resolve_solidarity_request(uuid,boolean,text) to authenticated;
grant execute on function public.cancel_solidarity_request(uuid) to authenticated;
grant execute on function public.adjust_credits(uuid,numeric,text) to authenticated;
grant execute on function public.set_user_status(uuid,public.account_status,text) to authenticated;
grant execute on function public.set_user_role(uuid,public.app_role,boolean) to authenticated;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.submit_review(uuid,smallint,text) to authenticated;
grant execute on function public.review_identity_verification(uuid,boolean,text) to authenticated;
grant execute on function public.accept_rescheduled_request(uuid) to authenticated;
grant execute on function public.open_session_dispute(uuid,text) to authenticated;
grant execute on function public.update_app_setting(text,jsonb) to authenticated;
grant execute on function public.update_report(uuid,public.report_status,text,uuid) to authenticated;
grant execute on function public.get_admin_dashboard_stats() to authenticated;
revoke execute on function public.mark_unconfirmed_sessions_disputed() from public,anon,authenticated;
revoke execute on function public.expire_session_requests() from public, anon, authenticated;
grant execute on function public.expire_session_requests(),public.mark_unconfirmed_sessions_disputed() to service_role;

-- Supabase Storage setup: profile images are public; identity documents stay private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
       ('identity-documents','identity-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy avatar_public_read on storage.objects for select to anon,authenticated using (bucket_id='profile-avatars');
create policy avatar_owner_upload on storage.objects for insert to authenticated with check (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_owner_update on storage.objects for update to authenticated using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_owner_delete on storage.objects for delete to authenticated using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy identity_owner_read on storage.objects for select to authenticated using (bucket_id='identity-documents' and ((storage.foldername(name))[1]=auth.uid()::text or private.is_admin()));
create policy identity_owner_upload on storage.objects for insert to authenticated with check (bucket_id='identity-documents' and (storage.foldername(name))[1]=auth.uid()::text and private.is_active_user(auth.uid()));
create policy identity_owner_delete on storage.objects for delete to authenticated using (bucket_id='identity-documents' and ((storage.foldername(name))[1]=auth.uid()::text or private.is_admin()));

-- Private schema is not exposed by the Supabase API.
revoke all on all tables in schema private from public, anon, authenticated;

commit;
