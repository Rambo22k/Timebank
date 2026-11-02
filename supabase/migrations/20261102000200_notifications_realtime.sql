begin;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace function private.notify_session_request_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_recipient uuid;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'accepted' then
    if v_actor = new.requester_id then v_recipient := new.provider_id;
    else v_recipient := new.requester_id;
    end if;
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_recipient, 'request_update', 'Request accepted', 'The request was accepted and the session is scheduled.', jsonb_build_object('request_id', new.id));
  elsif new.status = 'rejected' then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (new.requester_id, 'request_update', 'Request declined', 'The other person is unable to complete this exchange.', jsonb_build_object('request_id', new.id));
  elsif new.status = 'expired' then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (new.requester_id, 'request_update', 'Request expired', 'The request expired before it received a response.', jsonb_build_object('request_id', new.id));
  elsif new.status = 'cancelled' or new.status = 'disputed' then
    if v_actor = new.requester_id then v_recipient := new.provider_id;
    elsif v_actor = new.provider_id then v_recipient := new.requester_id;
    else v_recipient := null;
    end if;
    if v_recipient is not null then
      insert into public.notifications(user_id, notification_type, title, body, data)
      values (
        v_recipient,
        'request_update',
        case when new.status = 'cancelled' then 'Request cancelled' else 'Exchange under review' end,
        case when new.status = 'cancelled' then 'The other person cancelled the request or session.' else 'A problem was reported with this exchange.' end,
        jsonb_build_object('request_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_request_notification on public.session_requests;
create trigger session_request_notification
after update of status on public.session_requests
for each row execute function private.notify_session_request_update();

create or replace function private.notify_session_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_request public.session_requests%rowtype;
begin
  if new.requester_confirmed_at is distinct from old.requester_confirmed_at
    and new.requester_confirmed_at is not null then
    select * into v_request from public.session_requests where id = new.request_id;
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_request.provider_id, 'request_update', 'Session confirmed', 'The other person confirmed that the session took place.', jsonb_build_object('session_id', new.id, 'request_id', new.request_id));
  end if;
  if new.provider_confirmed_at is distinct from old.provider_confirmed_at
    and new.provider_confirmed_at is not null then
    select * into v_request from public.session_requests where id = new.request_id;
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_request.requester_id, 'request_update', 'Session confirmed', 'The other person confirmed that the session took place.', jsonb_build_object('session_id', new.id, 'request_id', new.request_id));
  end if;
  return new;
end;
$$;

drop trigger if exists session_confirmation_notification on public.sessions;
create trigger session_confirmation_notification
after update of requester_confirmed_at, provider_confirmed_at on public.sessions
for each row execute function private.notify_session_confirmation();

create or replace function private.notify_review_received()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id, notification_type, title, body, data)
  values (new.recipient_id, 'review_received', 'New review', 'You received a review after an exchange.', jsonb_build_object('session_id', new.session_id, 'review_id', new.id));
  return new;
end;
$$;

drop trigger if exists review_notification on public.reviews;
create trigger review_notification
after insert on public.reviews
for each row execute function private.notify_review_received();

create or replace function private.notify_credit_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_title text; v_body text; v_target uuid;
begin
  if new.transaction_type = 'welcome' then
    v_title := 'Welcome credits';
    v_body := 'Credits were added to your wallet.';
    v_target := new.requester_id;
  elsif new.transaction_type = 'session_payment' then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values
      (new.requester_id, 'session_completed', 'Exchange completed', 'The session was completed and your credits were updated.', jsonb_build_object('session_id', new.session_id, 'transaction_id', new.id)),
      (new.provider_id, 'session_completed', 'Exchange completed', 'The session was completed and your credits were updated.', jsonb_build_object('session_id', new.session_id, 'transaction_id', new.id));
    return new;
  elsif new.transaction_type = 'session_refund' then
    v_title := 'Credits refunded';
    v_body := 'Reserved credits were returned to your wallet.';
    v_target := new.requester_id;
  elsif new.transaction_type = 'solidarity_donation' then
    v_title := 'Donation recorded';
    v_body := 'Your contribution to the solidarity fund was recorded.';
    v_target := new.requester_id;
  elsif new.transaction_type = 'solidarity_award' then
    v_title := 'Solidarity support received';
    v_body := 'Support credits were added to your wallet.';
    v_target := new.provider_id;
  elsif new.transaction_type = 'admin_adjustment' then
    v_title := 'Credit balance updated';
    v_body := 'Your wallet balance was updated.';
    v_target := new.provider_id;
  else
    return new;
  end if;

  if v_target is not null then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (v_target, 'credit_activity', v_title, v_body, jsonb_build_object('session_id', new.session_id, 'transaction_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists credit_activity_notification on public.credit_transactions;
create trigger credit_activity_notification
after insert on public.credit_transactions
for each row execute function private.notify_credit_activity();

commit;
