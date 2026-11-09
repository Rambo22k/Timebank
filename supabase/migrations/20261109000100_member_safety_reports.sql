begin;

-- Report creation is validated against the actual target and reporter's access.
create or replace function public.create_report(
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter uuid := auth.uid();
  v_target_user uuid;
  v_message_sender uuid;
  v_conversation_id uuid;
  v_report_id uuid;
begin
  if v_reporter is null then raise exception 'Authentication required'; end if;
  if not private.is_active_user(v_reporter) then raise exception 'Active account required'; end if;
  if p_target_id is null or char_length(trim(coalesce(p_reason, ''))) < 5 or char_length(trim(p_reason)) > 2000 then
    raise exception 'A valid target and report reason are required';
  end if;

  case p_target_type
    when 'user' then
      select p.id into v_target_user from public.profiles p
        where p.id = p_target_id and private.is_active_user(p.id);
      if not found or v_target_user = v_reporter then raise exception 'Invalid user report target'; end if;
    when 'skill' then
      select s.user_id into v_target_user from public.skills s where s.id = p_target_id;
      if not found or v_target_user = v_reporter then raise exception 'Invalid skill report target'; end if;
    when 'message' then
      select m.sender_id, m.conversation_id into v_message_sender, v_conversation_id
        from public.messages m where m.id = p_target_id;
      if not found or v_message_sender = v_reporter
        or not private.is_conversation_member(v_conversation_id, v_reporter) then
        raise exception 'Invalid message report target';
      end if;
    when 'session' then
      select case when r.requester_id = v_reporter then r.provider_id else r.requester_id end
        into v_target_user
        from public.sessions s join public.session_requests r on r.id = s.request_id
        where s.id = p_target_id and v_reporter in (r.requester_id, r.provider_id);
      if not found then raise exception 'Invalid session report target'; end if;
    else
      raise exception 'Unsupported report target';
  end case;

  if exists (
    select 1 from public.reports r
      where r.reporter_id = v_reporter and r.target_type = p_target_type
        and r.target_id = p_target_id and r.status in ('open', 'under_review')
  ) then raise exception 'An open report already exists for this target'; end if;

  insert into public.reports(reporter_id, target_type, target_id, reason)
    values (v_reporter, p_target_type, p_target_id, trim(p_reason)) returning id into v_report_id;
  return v_report_id;
end;
$$;

revoke all on function public.create_report(public.report_target_type, uuid, text) from public, anon;
grant execute on function public.create_report(public.report_target_type, uuid, text) to authenticated;

drop policy if exists reports_reporter_insert on public.reports;
revoke insert on public.reports from anon, authenticated;

-- Blocks also apply to new direct database writes, not only the chat UI.
drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and private.is_active_user(auth.uid())
  and private.is_conversation_member(conversation_id)
  and not exists (
    select 1 from public.conversation_members peer
    where peer.conversation_id = messages.conversation_id
      and peer.user_id <> auth.uid()
      and private.are_blocked(auth.uid(), peer.user_id)
  )
);

commit;
