begin;

create type public.user_contact_status as enum ('pending', 'accepted', 'rejected');

create table public.user_contacts (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status public.user_contact_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  check (requester_id <> recipient_id),
  unique (requester_id, recipient_id)
);

create unique index user_contacts_one_pair_idx
  on public.user_contacts (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index user_contacts_recipient_pending_idx
  on public.user_contacts (recipient_id, created_at desc) where status = 'pending';
create index user_contacts_requester_status_idx
  on public.user_contacts (requester_id, status, created_at desc);

alter table public.user_contacts enable row level security;
create policy user_contacts_participant_read on public.user_contacts
  for select to authenticated using (requester_id = auth.uid() or recipient_id = auth.uid());
grant select on public.user_contacts to authenticated;
revoke insert, update, delete on public.user_contacts from anon, authenticated;

create or replace function public.get_public_members(p_search text default null, p_limit integer default 50)
returns table (
  id uuid, display_name text, headline text, bio text, avatar_path text, location text,
  country_code text, reputation_average numeric, reputation_count integer,
  offered_hours numeric, received_hours numeric, completed_sessions integer,
  created_at timestamptz, is_verified boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.headline, p.bio, p.avatar_path, p.location, p.country_code,
         p.reputation_average, p.reputation_count, p.offered_hours, p.received_hours,
         p.completed_sessions, p.created_at, p.is_verified
  from public.profiles p
  join public.profile_private pp on pp.user_id = p.id
  where auth.uid() is not null
    and pp.account_status = 'active'
    and p.id <> auth.uid()
    and (nullif(trim(p_search), '') is null or p.display_name ilike '%' || trim(p_search) || '%'
         or coalesce(p.headline, '') ilike '%' || trim(p_search) || '%'
         or coalesce(p.location, p.country_code, '') ilike '%' || trim(p_search) || '%'
         or exists (
           select 1 from public.skills s
           where s.user_id = p.id and s.status = 'active'
             and (s.title ilike '%' || trim(p_search) || '%' or s.description ilike '%' || trim(p_search) || '%')
         ))
  order by p.is_verified desc, p.reputation_average desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.send_user_contact_request(p_recipient_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_contact public.user_contacts%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_recipient_id is null or p_recipient_id = v_actor then raise exception 'Invalid contact recipient'; end if;
  if not private.is_active_user(v_actor) or not private.is_active_user(p_recipient_id) then raise exception 'Both accounts must be active'; end if;
  if private.are_blocked(v_actor, p_recipient_id) then raise exception 'Contacts are blocked'; end if;

  select * into v_contact from public.user_contacts c
    where (c.requester_id = v_actor and c.recipient_id = p_recipient_id)
       or (c.requester_id = p_recipient_id and c.recipient_id = v_actor)
    for update;

  if found then
    if v_contact.status = 'accepted' then raise exception 'Already contacts'; end if;
    if v_contact.status = 'pending' and v_contact.recipient_id = v_actor then
      update public.user_contacts set status = 'accepted', updated_at = now(), decided_at = now()
        where id = v_contact.id returning * into v_contact;
      insert into public.notifications(user_id, notification_type, title, body, data)
        values (p_recipient_id, 'system', 'Contact request accepted', 'You are now contacts.', jsonb_build_object('contact_id', v_contact.id));
    elsif v_contact.status = 'rejected' then
      update public.user_contacts set requester_id = v_actor, recipient_id = p_recipient_id,
        status = 'pending', created_at = now(), updated_at = now(), decided_at = null
        where id = v_contact.id returning * into v_contact;
      insert into public.notifications(user_id, notification_type, title, body, data)
        values (p_recipient_id, 'system', 'New contact request', 'Someone wants to connect with you.', jsonb_build_object('contact_id', v_contact.id));
    else
      return v_contact.id;
    end if;
    return v_contact.id;
  end if;

  insert into public.user_contacts(requester_id, recipient_id)
    values (v_actor, p_recipient_id) returning * into v_contact;
  insert into public.notifications(user_id, notification_type, title, body, data)
    values (p_recipient_id, 'system', 'New contact request', 'Someone wants to connect with you.', jsonb_build_object('contact_id', v_contact.id));
  return v_contact.id;
end;
$$;

create or replace function public.respond_user_contact_request(p_contact_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_contact public.user_contacts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_contact from public.user_contacts where id = p_contact_id for update;
  if not found or v_contact.recipient_id <> auth.uid() or v_contact.status <> 'pending' then
    raise exception 'Contact request is unavailable';
  end if;
  update public.user_contacts set status = case when p_accept then 'accepted'::public.user_contact_status else 'rejected'::public.user_contact_status end,
    updated_at = now(), decided_at = now() where id = p_contact_id;
  insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_contact.requester_id, 'system',
      case when p_accept then 'Contact request accepted' else 'Contact request declined' end,
      case when p_accept then 'You are now contacts.' else 'Your contact request was declined.' end,
      jsonb_build_object('contact_id', p_contact_id));
end;
$$;

create or replace function public.remove_user_contact(p_contact_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.user_contacts
    where id = p_contact_id and auth.uid() in (requester_id, recipient_id) and status = 'accepted';
  if not found then raise exception 'Accepted contact was not found'; end if;
end;
$$;

revoke execute on function public.get_public_members(text, integer) from public, anon;
revoke execute on function public.send_user_contact_request(uuid) from public, anon;
revoke execute on function public.respond_user_contact_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_user_contact(uuid) from public, anon;
grant execute on function public.get_public_members(text, integer) to authenticated;
grant execute on function public.send_user_contact_request(uuid) to authenticated;
grant execute on function public.respond_user_contact_request(uuid, boolean) to authenticated;
grant execute on function public.remove_user_contact(uuid) to authenticated;

commit;
