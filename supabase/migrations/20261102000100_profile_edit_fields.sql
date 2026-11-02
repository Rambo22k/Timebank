alter table public.profiles
  add column if not exists headline text not null default 'Miembro de la comunidad TimeBank'
    check (char_length(headline) between 1 and 100),
  add column if not exists location text not null default 'En línea'
    check (char_length(location) between 1 and 120);

grant update(headline, location) on public.profiles to authenticated;
