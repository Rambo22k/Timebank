begin;

-- Supabase Cron runs scheduled SQL in PostgreSQL and records execution history.
create extension if not exists pg_cron;

-- Expire unanswered requests hourly. The existing request-status trigger sends
-- the corresponding in-app notification to the requester.
select cron.schedule(
  'timebank-expire-session-requests',
  '0 * * * *',
  'select public.expire_session_requests();'
);

-- Move sessions with only one confirmation to the dispute queue shortly after
-- the expiry pass, keeping the two maintenance jobs from starting together.
select cron.schedule(
  'timebank-mark-unconfirmed-sessions-disputed',
  '15 * * * *',
  'select public.mark_unconfirmed_sessions_disputed();'
);

commit;
