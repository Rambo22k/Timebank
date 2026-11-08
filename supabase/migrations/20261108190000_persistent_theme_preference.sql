begin;

alter table public.profile_private
  add column if not exists preferred_theme text not null default 'system';

alter table public.profile_private
  drop constraint if exists profile_private_preferred_theme_check,
  add constraint profile_private_preferred_theme_check
    check (preferred_theme in ('system', 'light', 'dark'));

-- Preserve account appearance preferences chosen before email confirmation.
create or replace function private.bootstrap_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_account uuid;
  v_tx uuid;
  v_welcome numeric(12,2);
begin
  insert into public.profiles(id, display_name, country_code, timezone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    nullif(upper(new.raw_user_meta_data->>'country_code'), ''),
    case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.raw_user_meta_data->>'timezone')
      then new.raw_user_meta_data->>'timezone' else 'UTC' end
  );
  insert into public.profile_private(user_id, birth_date, accepted_terms_at, accepted_privacy_at, preferred_language, preferred_theme)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    nullif(new.raw_user_meta_data->>'accepted_terms_at', '')::timestamptz,
    nullif(new.raw_user_meta_data->>'accepted_privacy_at', '')::timestamptz,
    case when new.raw_user_meta_data->>'preferred_language' in ('es', 'en') then new.raw_user_meta_data->>'preferred_language' else 'es' end,
    case when new.raw_user_meta_data->>'preferred_theme' in ('system', 'light', 'dark') then new.raw_user_meta_data->>'preferred_theme' else 'system' end
  );
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

create or replace function public.update_my_theme_preference(p_preferred_theme text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_user(v_user_id) then
    raise exception 'Active account required';
  end if;
  if p_preferred_theme is null or p_preferred_theme not in ('system', 'light', 'dark') then
    raise exception 'Theme preference is invalid';
  end if;
  update public.profile_private set preferred_theme = p_preferred_theme where user_id = v_user_id;
  if not found then raise exception 'Private profile not found'; end if;
end;
$$;

revoke execute on function public.update_my_theme_preference(text) from public, anon;
grant execute on function public.update_my_theme_preference(text) to authenticated;

commit;
