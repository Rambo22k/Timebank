begin;

create or replace function public.replace_pending_identity_document(
  p_verification_id uuid,
  p_document_path text
)
returns text language plpgsql security definer set search_path = '' as $$
declare v_old_path text;
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Active account required';
  end if;
  if p_document_path is null or p_document_path not like auth.uid()::text || '/%' then
    raise exception 'Invalid document path';
  end if;

  select document_path into v_old_path
  from public.identity_verifications
  where id = p_verification_id and user_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'Pending verification not found'; end if;

  update public.identity_verifications
  set document_path = p_document_path, submitted_at = now(), review_note = null
  where id = p_verification_id;
  return v_old_path;
end;
$$;

revoke execute on function public.replace_pending_identity_document(uuid, text) from public, anon;
grant execute on function public.replace_pending_identity_document(uuid, text) to authenticated;

commit;
