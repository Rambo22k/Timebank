begin;

create or replace function public.add_availability_slot(
  p_weekday smallint,
  p_start_time time,
  p_end_time time,
  p_timezone text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_slot_id uuid;
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Active account required';
  end if;
  if p_weekday is null or p_weekday not between 0 and 6 then
    raise exception 'Weekday must be between 0 and 6';
  end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'End time must be later than start time';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    raise exception 'A valid time zone is required';
  end if;

  -- Serialize edits for this account so two simultaneous requests cannot create overlapping slots.
  perform 1 from public.profiles p where p.id = auth.uid() for update;
  if exists (
    select 1 from public.availability a
    where a.user_id = auth.uid() and a.weekday = p_weekday and a.is_active
      and a.start_time < p_end_time and a.end_time > p_start_time
  ) then
    raise exception 'Availability slot overlaps an existing slot';
  end if;

  insert into public.availability(user_id, weekday, start_time, end_time, timezone)
  values (auth.uid(), p_weekday, p_start_time, p_end_time, p_timezone)
  returning id into v_slot_id;
  return v_slot_id;
end;
$$;

create or replace function public.remove_availability_slot(p_slot_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Active account required';
  end if;
  delete from public.availability where id = p_slot_id and user_id = auth.uid();
  if not found then raise exception 'Availability slot not found'; end if;
end;
$$;

-- Prevent clients from bypassing overlap and ownership checks through direct table writes.
revoke insert, update, delete on public.availability from anon, authenticated;
grant select on public.availability to anon, authenticated;
revoke execute on function public.add_availability_slot(smallint, time, time, text) from public, anon;
revoke execute on function public.remove_availability_slot(uuid) from public, anon;
grant execute on function public.add_availability_slot(smallint, time, time, text) to authenticated;
grant execute on function public.remove_availability_slot(uuid) to authenticated;

commit;
