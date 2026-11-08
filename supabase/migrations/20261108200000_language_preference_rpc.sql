begin;

create or replace function public.update_my_language_preference(p_preferred_language text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_user(v_user_id) then
    raise exception 'Active account required';
  end if;
  if p_preferred_language is null or p_preferred_language not in ('es', 'en') then
    raise exception 'Language preference is invalid';
  end if;
  update public.profile_private set preferred_language = p_preferred_language where user_id = v_user_id;
  if not found then raise exception 'Private profile not found'; end if;
end;
$$;

revoke execute on function public.update_my_language_preference(text) from public, anon;
grant execute on function public.update_my_language_preference(text) to authenticated;

commit;
