begin;

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and private.is_active_user(auth.uid())
  and private.is_conversation_member(conversation_id)
  and not exists (
    select 1
    from public.conversation_members peer
    where peer.conversation_id = messages.conversation_id
      and peer.user_id <> auth.uid()
      and private.are_blocked(auth.uid(), peer.user_id)
  )
);

commit;
