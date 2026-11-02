-- Align the initial credit grant and skill metadata with the existing client model.
insert into public.app_settings (key, value, description)
values ('welcome_credits', '5'::jsonb, 'Credits awarded to a new account after sign-up.')
on conflict (key) do update
set value = excluded.value, description = excluded.description, updated_at = now();

alter table public.skills
  add column if not exists modality text not null default 'online',
  add column if not exists tags text[] not null default '{}',
  add column if not exists availability_note text not null default '',
  add column if not exists location text not null default '',
  add column if not exists is_featured boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'skills_modality_check') then
    alter table public.skills add constraint skills_modality_check
      check (modality in ('online', 'in_person', 'hybrid'));
  end if;
end $$;
