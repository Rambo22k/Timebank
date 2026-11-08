begin;

-- Spanish is the application's initial language. Existing English values were
-- the database default only; the UI did not previously let users choose.
alter table public.profile_private
  alter column preferred_language set default 'es';
update public.profile_private set preferred_language = 'es' where preferred_language = 'en';

alter table public.profile_languages
  drop constraint profile_languages_language_code_check,
  add constraint profile_languages_language_code_check check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

-- Persist the country selected during sign-up in the public member profile.
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
    case when exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = new.raw_user_meta_data->>'timezone'
    ) then new.raw_user_meta_data->>'timezone' else 'UTC' end
  );
  insert into public.profile_private(user_id, birth_date, accepted_terms_at, accepted_privacy_at, preferred_language)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    nullif(new.raw_user_meta_data->>'accepted_terms_at', '')::timestamptz,
    nullif(new.raw_user_meta_data->>'accepted_privacy_at', '')::timestamptz,
    case when new.raw_user_meta_data->>'preferred_language' in ('es', 'en') then new.raw_user_meta_data->>'preferred_language' else 'es' end
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

create or replace function public.update_my_profile_settings(
  p_display_name text,
  p_headline text,
  p_location text,
  p_avatar_path text,
  p_bio text,
  p_country_code text,
  p_timezone text,
  p_preferred_language text,
  p_language_codes text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_languages text[] := coalesce(p_language_codes, '{}'::text[]);
begin
  if v_user_id is null or not private.is_active_user(v_user_id) then raise exception 'Active account required'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 3 and 100 then raise exception 'Display name must contain 3 to 100 characters'; end if;
  if p_headline is null or char_length(btrim(p_headline)) not between 1 and 100 then raise exception 'Headline must contain 1 to 100 characters'; end if;
  if p_location is null or char_length(btrim(p_location)) not between 1 and 120 then raise exception 'Location must contain 1 to 120 characters'; end if;
  if p_bio is null or char_length(p_bio) > 400 then raise exception 'Biography cannot exceed 400 characters'; end if;
  if p_country_code is null or upper(btrim(p_country_code)) !~ '^[A-Z]{2}$' then raise exception 'Choose a valid two-letter country code'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then raise exception 'Choose a valid time zone'; end if;
  if p_preferred_language is null or p_preferred_language not in ('es', 'en') then raise exception 'Choose Spanish or English as the preferred language'; end if;
  if cardinality(v_languages) > 12 then raise exception 'Choose no more than 12 spoken languages'; end if;
  if exists (select 1 from unnest(v_languages) as item(language_code) where item.language_code !~ '^[a-z]{2,3}(-[A-Z]{2})?$') then raise exception 'A spoken language code is invalid'; end if;

  update public.profiles set
    display_name = btrim(p_display_name),
    headline = btrim(p_headline),
    location = btrim(p_location),
    avatar_path = coalesce(p_avatar_path, avatar_path),
    bio = p_bio,
    country_code = upper(btrim(p_country_code)),
    timezone = p_timezone
  where id = v_user_id;

  update public.profile_private set preferred_language = p_preferred_language where user_id = v_user_id;
  if not found then raise exception 'Private profile not found'; end if;

  delete from public.profile_languages where user_id = v_user_id;
  insert into public.profile_languages(user_id, language_code)
  select v_user_id, item.language_code from unnest(v_languages) as item(language_code)
  on conflict (user_id, language_code) do nothing;
end;
$$;

revoke execute on function public.update_my_profile_settings(text, text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.update_my_profile_settings(text, text, text, text, text, text, text, text, text[]) to authenticated;

commit;
