begin;

create or replace function private.notify_solidarity_request_declined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status = 'rejected' then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (
      new.user_id,
      'solidarity_update',
      'Solidarity request declined',
      coalesce(nullif(trim(new.resolution_note), ''), 'Your solidarity request was not approved.'),
      jsonb_build_object('solidarity_request_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists solidarity_request_declined_notification on public.solidarity_requests;
create trigger solidarity_request_declined_notification
after update of status on public.solidarity_requests
for each row execute function private.notify_solidarity_request_declined();

commit;
