alter table public.solidarity_requests
  add column if not exists public_summary text,
  add column if not exists accepts_direct_donations boolean not null default false;

create index if not exists solidarity_donations_request_idx
  on public.solidarity_donations(solidarity_request_id)
  where solidarity_request_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'solidarity_request_public_donation_consent_check'
      and conrelid = 'public.solidarity_requests'::regclass
  ) then
    alter table public.solidarity_requests
      add constraint solidarity_request_public_donation_consent_check
      check (
        (accepts_direct_donations and public_summary is not null and char_length(btrim(public_summary)) between 12 and 280)
        or (not accepts_direct_donations and public_summary is null)
      );
  end if;
end;
$$;

create or replace function public.list_solidarity_donation_targets()
returns table (
  request_id uuid,
  public_summary text,
  requested_credits numeric,
  received_credits numeric,
  remaining_credits numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.public_summary,
    r.hours_requested,
    coalesce(sum(d.amount), 0)::numeric,
    greatest(r.hours_requested - coalesce(sum(d.amount), 0), 0)::numeric,
    r.created_at
  from public.solidarity_requests r
  left join public.solidarity_donations d on d.solidarity_request_id = r.id
  where auth.uid() is not null
    and private.is_active_user(auth.uid())
    and r.user_id <> auth.uid()
    and r.status = 'pending'
    and r.accepts_direct_donations
  group by r.id
  having r.hours_requested > coalesce(sum(d.amount), 0)
  order by r.created_at asc
  limit 50;
$$;

create or replace function public.create_solidarity_request(
  p_reason text,
  p_hours_requested numeric,
  p_accepts_direct_donations boolean default false,
  p_public_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_request_id uuid;
begin
  if v_user is null or not private.is_active_user(v_user) then
    raise exception 'An active account is required';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 3000 then
    raise exception 'A request reason between 10 and 3000 characters is required';
  end if;
  if p_hours_requested is null or p_hours_requested <= 0 or p_hours_requested > 8
    or p_hours_requested <> round(p_hours_requested, 2)
    or p_hours_requested * 4 <> round(p_hours_requested * 4) then
    raise exception 'Requested credits must be between 0 and 8 in quarter-hour increments';
  end if;
  if p_accepts_direct_donations and char_length(btrim(coalesce(p_public_summary, ''))) not between 12 and 280 then
    raise exception 'A public summary between 12 and 280 characters is required to accept direct donations';
  end if;

  insert into public.solidarity_requests(user_id, reason, hours_requested, accepts_direct_donations, public_summary)
  values (
    v_user,
    btrim(p_reason),
    p_hours_requested,
    coalesce(p_accepts_direct_donations, false),
    case when coalesce(p_accepts_direct_donations, false) then btrim(p_public_summary) else null end
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.donate_credits(
  p_amount numeric,
  p_category_id uuid default null,
  p_solidarity_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_account public.credit_accounts%rowtype;
  v_fund public.credit_accounts%rowtype;
  v_target public.solidarity_requests%rowtype;
  v_received numeric;
  v_tx uuid;
  v_donation uuid;
  v_limit numeric;
begin
  if v_user is null or not private.is_active_user(v_user) then
    raise exception 'An active account is required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Donation must be positive'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Credits support at most two decimal places'; end if;
  if p_category_id is not null and p_solidarity_request_id is not null then
    raise exception 'Choose a category or a request, not both';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and is_active
  ) then raise exception 'Donation category is unavailable'; end if;

  if p_solidarity_request_id is not null then
    select * into v_target
    from public.solidarity_requests
    where id = p_solidarity_request_id
    for update;
    if not found
      or v_target.status <> 'pending'
      or not v_target.accepts_direct_donations
      or v_target.user_id = v_user then
      raise exception 'Target solidarity request is unavailable';
    end if;
    select coalesce(sum(amount), 0) into v_received
    from public.solidarity_donations
    where solidarity_request_id = p_solidarity_request_id;
    if p_amount > greatest(v_target.hours_requested - v_received, 0) then
      raise exception 'Donation exceeds the remaining requested credits';
    end if;
  end if;

  v_limit := coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'daily_credit_limit'), 24);
  if (select coalesce(sum(amount), 0) from public.credit_transactions
      where requester_id = v_user and transaction_type = 'solidarity_donation'
        and created_at >= date_trunc('day', now())) + p_amount > v_limit then
    raise exception 'Daily credit limit exceeded';
  end if;

  select * into v_account from public.credit_accounts where user_id = v_user for update;
  select * into v_fund from public.credit_accounts where account_type = 'solidarity_fund' for update;
  if v_account.available_balance < p_amount then raise exception 'Insufficient available credits'; end if;

  update public.credit_accounts set available_balance = available_balance - p_amount where id = v_account.id;
  update public.credit_accounts set available_balance = available_balance + p_amount where id = v_fund.id;
  insert into public.credit_transactions(transaction_type, amount, requester_id, description)
  values (
    'solidarity_donation',
    p_amount,
    v_user,
    case when p_solidarity_request_id is null then 'Donation to the solidarity fund' else 'Donation to a solidarity request' end
  ) returning id into v_tx;
  insert into public.credit_ledger_entries(transaction_id, account_id, available_delta, available_before, available_after, reserved_before, reserved_after)
  values
    (v_tx, v_account.id, -p_amount, v_account.available_balance, v_account.available_balance - p_amount, v_account.reserved_balance, v_account.reserved_balance),
    (v_tx, v_fund.id, p_amount, v_fund.available_balance, v_fund.available_balance + p_amount, v_fund.reserved_balance, v_fund.reserved_balance);
  insert into public.solidarity_donations(donor_id, amount, category_id, solidarity_request_id, transaction_id)
  values (v_user, p_amount, p_category_id, p_solidarity_request_id, v_tx)
  returning id into v_donation;

  if p_solidarity_request_id is not null then
    insert into public.notifications(user_id, notification_type, title, body, data)
    values (
      v_target.user_id,
      'solidarity_update',
      'Someone supported your solidarity request',
      'A community member directed a donation to your request.',
      jsonb_build_object('solidarity_request_id', p_solidarity_request_id)
    );
  end if;
  return v_donation;
end;
$$;

revoke all on function public.list_solidarity_donation_targets() from public, anon;
grant execute on function public.list_solidarity_donation_targets() to authenticated;
revoke all on function public.create_solidarity_request(text, numeric, boolean, text) from public, anon;
grant execute on function public.create_solidarity_request(text, numeric, boolean, text) to authenticated;
revoke all on function public.donate_credits(numeric, uuid, uuid) from public, anon;
grant execute on function public.donate_credits(numeric, uuid, uuid) to authenticated;
