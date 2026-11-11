begin;

-- Retain an anonymized profile as the stable actor referenced by the immutable
-- credit ledger, completed sessions, reviews, messages, reports, and audit data.
-- The Auth identity itself is permanently removed by the admin-delete-user Edge Function.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists auth_deleted_at timestamptz;
create index if not exists profiles_deleted_at_idx on public.profiles(deleted_at) where deleted_at is not null;

create table public.user_deletion_storage_cleanup (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bucket_id text not null,
  object_path text not null,
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);
alter table public.user_deletion_storage_cleanup enable row level security;
revoke all on public.user_deletion_storage_cleanup from public, anon, authenticated;
grant all on public.user_deletion_storage_cleanup to service_role;

create or replace function private.validate_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_admin(auth.uid()) and new.body = '[Message removed]'
     and new.deleted_at is not null and new.attachment_path is null
     and new.sender_id is not distinct from old.sender_id
     and new.conversation_id is not distinct from old.conversation_id
     and new.created_at is not distinct from old.created_at then
    new.edited_at := now();
    return new;
  end if;
  if auth.uid() is distinct from old.sender_id or new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id or new.created_at is distinct from old.created_at then
    raise exception 'Messages can only be edited by their original sender';
  end if;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$$;

-- Preserve financial/review history while allowing one narrowly scoped
-- administrator-only privacy scrub during permanent account deletion.
create or replace function private.validate_review_anonymization()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.is_admin(auth.uid()) and new.comment = ''
     and (to_jsonb(new) - 'comment') is not distinct from (to_jsonb(old) - 'comment') then
    return new;
  end if;
  raise exception 'Review history is immutable';
end;
$$;
drop trigger if exists reviews_immutable on public.reviews;
create trigger reviews_immutable before update or delete on public.reviews
  for each row execute function private.validate_review_anonymization();

create or replace function private.validate_transaction_anonymization()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and private.is_admin(auth.uid())
     and new.description = 'Transaction retained for financial audit; member identity removed.'
     and (to_jsonb(new) - 'description') is not distinct from (to_jsonb(old) - 'description') then
    return new;
  end if;
  raise exception 'Financial transaction history is immutable';
end;
$$;
drop trigger if exists transactions_immutable on public.credit_transactions;
create trigger transactions_immutable before update or delete on public.credit_transactions
  for each row execute function private.validate_transaction_anonymization();

-- Serialize administrator grants with account deletion so an in-flight role
-- change cannot turn a normal member into an admin during the deletion flow.
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_deleted_at timestamptz;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select deleted_at into v_deleted_at from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_deleted_at is not null then raise exception 'Deleted accounts cannot receive roles'; end if;
  if p_grant then
    insert into public.user_roles(user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
      on conflict (user_id, role) do nothing;
  else
    if p_user_id = auth.uid() and p_role = 'admin' then raise exception 'You cannot remove your own administrator role'; end if;
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
  perform private.write_audit(case when p_grant then 'grant_user_role' else 'revoke_user_role' end,
    'user', p_user_id::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.set_user_status(
  p_user_id uuid, p_status public.account_status, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_deleted_at timestamptz;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select deleted_at into v_deleted_at from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_deleted_at is not null then raise exception 'Deleted accounts cannot change status'; end if;
  if p_status = 'suspended' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Suspension reason is required';
  end if;
  update public.profile_private set account_status = p_status,
    suspension_reason = case when p_status = 'suspended' then p_reason else null end,
    deactivated_at = case when p_status = 'deactivated' then now() else null end
    where user_id = p_user_id;
  if not found then raise exception 'User status not found'; end if;
  perform private.write_audit('set_user_status', 'user', p_user_id::text,
    jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.adjust_credits(p_user_id uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_account public.credit_accounts%rowtype;
  v_tx uuid;
  v_deleted_at timestamptz;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_amount = 0 or p_amount <> round(p_amount, 2) or length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A non-zero adjustment with at most two decimal places and a reason is required';
  end if;
  select deleted_at into v_deleted_at from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_deleted_at is not null then raise exception 'Deleted accounts cannot receive credit adjustments'; end if;
  select * into v_account from public.credit_accounts where user_id = p_user_id and account_type = 'user' for update;
  if not found then raise exception 'User credit account not found'; end if;
  if v_account.available_balance + p_amount < 0 then raise exception 'Adjustment would create a negative balance'; end if;
  update public.credit_accounts set available_balance = available_balance + p_amount where id = v_account.id;
  insert into public.credit_transactions(transaction_type, amount, provider_id, description, performed_by)
    values ('admin_adjustment', abs(p_amount), p_user_id, p_reason, auth.uid()) returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id, account_id, available_delta, available_before,
      available_after, reserved_before, reserved_after)
    values (v_tx, v_account.id, p_amount, v_account.available_balance,
      v_account.available_balance + p_amount, v_account.reserved_balance, v_account.reserved_balance);
  perform private.write_audit('adjust_credits', 'credit_account', p_user_id::text,
    jsonb_build_object('amount', p_amount, 'reason', p_reason));
  return v_tx;
end;
$$;

create or replace function public.prepare_admin_user_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_account public.credit_accounts%rowtype;
  v_document_paths text[];
  v_avatar_path text;
begin
  if v_actor is null or not private.is_admin(v_actor) then
    raise exception 'Administrator access required';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'You cannot permanently delete your own administrator account';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User account not found'; end if;
  if v_profile.deleted_at is not null then
    return jsonb_build_object('already_prepared', true);
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') then
    raise exception 'Remove administrator access before deleting this account';
  end if;

  perform 1 from public.profile_private where user_id = p_user_id for update;
  if not found then raise exception 'User account state not found'; end if;
  select * into v_account from public.credit_accounts where user_id = p_user_id and account_type = 'user' for update;
  if found and (v_account.available_balance <> 0 or v_account.reserved_balance <> 0) then
    raise exception 'Resolve the user balance first. Available and reserved credits must both be zero.';
  end if;
  if exists (
    select 1 from public.session_requests r
    where p_user_id in (r.requester_id, r.provider_id)
      and r.status in ('pending', 'rescheduled', 'disputed')
  ) or exists (
    select 1 from public.sessions s join public.session_requests r on r.id = s.request_id
    where p_user_id in (r.requester_id, r.provider_id)
      and s.status in ('scheduled', 'awaiting_confirmation', 'disputed')
  ) then
    raise exception 'Resolve or cancel this user’s open exchanges and sessions first.';
  end if;

  select coalesce(array_agg(document_path), '{}'::text[]) into v_document_paths
    from public.identity_verifications where user_id = p_user_id;

  v_avatar_path := v_profile.avatar_path;
  if v_avatar_path ~ '^https?://' then
    if v_avatar_path ~ '/storage/v1/object/(public/)?profile-avatars/' then
      v_avatar_path := regexp_replace(split_part(v_avatar_path, '?', 1), '^.*?/storage/v1/object/(public/)?profile-avatars/', '');
    else
      v_avatar_path := null;
    end if;
  end if;
  if v_avatar_path is not null and v_avatar_path <> '' then
    insert into public.user_deletion_storage_cleanup(user_id, bucket_id, object_path)
    values (p_user_id, 'profile-avatars', v_avatar_path) on conflict (bucket_id, object_path) do nothing;
  end if;
  insert into public.user_deletion_storage_cleanup(user_id, bucket_id, object_path)
  select p_user_id, 'identity-documents', path
    from unnest(v_document_paths) as path where path is not null
  on conflict (bucket_id, object_path) do nothing;

  delete from public.user_roles where user_id = p_user_id;
  delete from public.user_contacts where requester_id = p_user_id or recipient_id = p_user_id;
  delete from public.user_blocks where blocker_id = p_user_id or blocked_id = p_user_id;
  delete from public.availability where user_id = p_user_id;
  delete from public.profile_languages where user_id = p_user_id;
  delete from public.identity_verifications where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.push_devices where user_id = p_user_id;

  update public.skills
    set status = 'removed', title = 'Deleted skill', description = '', language_code = null,
        moderation_note = 'Removed because the account was permanently deleted',
        moderated_by = v_actor, moderated_at = now(), updated_at = now()
    where user_id = p_user_id;

  update public.messages
    set body = '[Message removed]', attachment_path = null, edited_at = now(), deleted_at = coalesce(deleted_at, now())
    where sender_id = p_user_id;
  delete from public.conversation_members where user_id = p_user_id;
  update public.session_requests set message = '[Message removed]', cancellation_reason = null
    where p_user_id in (requester_id, provider_id);
  update public.sessions s set dispute_reason = null, resolution = null
    from public.session_requests r
    where s.request_id = r.id and p_user_id in (r.requester_id, r.provider_id);
  update public.credit_transactions set description = 'Transaction retained for financial audit; member identity removed.'
    where p_user_id in (requester_id, provider_id);
  update public.reviews set comment = '' where author_id = p_user_id;
  update public.solidarity_requests set reason = 'Request details removed after account deletion.', resolution_note = null
    where user_id = p_user_id;
  update public.reports set reason = 'Details removed after account deletion.', resolution_note = null
    where reporter_id = p_user_id;

  update public.profiles set
    display_name = 'Deleted member', avatar_path = null, bio = '', headline = 'Former TimeBank member',
    location = null, country_code = null, timezone = 'UTC', is_verified = false,
    reputation_average = 0, reputation_count = 0, offered_hours = 0, received_hours = 0,
    completed_sessions = 0, deleted_at = now(), updated_at = now()
    where id = p_user_id;

  update public.profile_private set
    birth_date = null, preferred_language = 'es', accepted_terms_at = null, accepted_privacy_at = null,
    account_status = 'deactivated', suspension_reason = 'Permanently deleted by an administrator',
    deactivated_at = now(), updated_at = now()
    where user_id = p_user_id;

  perform private.write_audit(
    'prepare_user_account_deletion', 'user', p_user_id::text,
    jsonb_build_object('auth_identity_removal_pending', true, 'financial_history_retained', true)
  );

  return jsonb_build_object('already_prepared', false);
end;
$$;

revoke all on function public.prepare_admin_user_deletion(uuid) from public, anon;
grant execute on function public.prepare_admin_user_deletion(uuid) to authenticated;

create or replace function public.complete_admin_user_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_pending boolean;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then
    raise exception 'Administrator access required';
  end if;
  select auth_deleted_at is null into v_was_pending from public.profiles
    where id = p_user_id and deleted_at is not null for update;
  if not found then raise exception 'Prepared deletion not found'; end if;
  update public.profiles set auth_deleted_at = coalesce(auth_deleted_at, now())
    where id = p_user_id and deleted_at is not null;
  if v_was_pending then
    perform private.write_audit(
      'delete_user_account', 'user', p_user_id::text,
      jsonb_build_object('auth_identity_removed', true, 'financial_history_retained', true)
    );
  end if;
end;
$$;
revoke all on function public.complete_admin_user_deletion(uuid) from public, anon;
grant execute on function public.complete_admin_user_deletion(uuid) to authenticated;

commit;
