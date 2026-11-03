begin;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

create or replace function public.list_conversation_summaries()
returns table (
  conversation_id uuid,
  session_request_id uuid,
  peer_id uuid,
  peer_name text,
  peer_avatar_path text,
  skill_title text,
  request_status public.request_status,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select
    c.id,
    c.session_request_id,
    peer.user_id,
    coalesce(p.display_name, 'TimeBank member'),
    p.avatar_path,
    coalesce(sk.title, 'Skill exchange'),
    r.status,
    coalesce(latest.body, ''),
    latest.created_at,
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> auth.uid()
        and unread.deleted_at is null
        and (me.last_read_at is null or unread.created_at > me.last_read_at)
    )::bigint
  from public.conversations c
  join public.conversation_members me
    on me.conversation_id = c.id and me.user_id = auth.uid()
  join public.conversation_members peer
    on peer.conversation_id = c.id and peer.user_id <> auth.uid()
  join public.session_requests r on r.id = c.session_request_id
  left join public.profiles p on p.id = peer.user_id
  left join public.skills sk on sk.id = r.skill_id
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  where private.is_conversation_member(c.id, auth.uid())
  order by coalesce(latest.created_at, c.created_at) desc;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_conversation_member(p_conversation_id, auth.uid()) then
    raise exception 'Conversation not found or not yours';
  end if;
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

create or replace function private.notify_message_received()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  insert into public.notifications(user_id, notification_type, title, body, data)
  select members.user_id, 'system', 'New message', 'You received a new message.',
    jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
  from public.conversation_members members
  where members.conversation_id = new.conversation_id
    and members.user_id <> new.sender_id;
  return new;
end;
$$;

drop trigger if exists message_received_notification on public.messages;
create trigger message_received_notification
after insert on public.messages
for each row execute function private.notify_message_received();

revoke execute on function public.list_conversation_summaries() from public, anon;
grant execute on function public.list_conversation_summaries() to authenticated;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

commit;
