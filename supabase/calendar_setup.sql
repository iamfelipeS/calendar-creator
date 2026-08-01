create extension if not exists pgcrypto;

create table if not exists public.calendar_branding (
  id uuid primary key default gen_random_uuid(),
  page_name text not null,
  handle text not null,
  logo_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.calendar_team_assets (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  team_slug text not null,
  logo_url text not null,
  storage_path text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.calendar_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null default 'Calendário sem nome',
  month text not null,
  year text not null,
  matches_text text not null,
  matches jsonb not null default '[]'::jsonb,
  calendar_format text not null default 'feedPortrait',
  visual_settings jsonb not null default '{}'::jsonb,
  branding_id uuid references public.calendar_branding(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default now()
);

alter table public.calendar_team_assets
  add column if not exists storage_path text;

alter table public.calendar_projects
  add column if not exists project_name text not null default 'Calendário sem nome',
  add column if not exists matches jsonb not null default '[]'::jsonb,
  add column if not exists calendar_format text not null default 'feedPortrait',
  add column if not exists visual_settings jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from public.calendar_team_assets
    group by team_slug
    having count(*) > 1
  ) then
    raise notice 'calendar_team_assets possui team_slug duplicado; o índice único não foi criado. Execute a consulta de diagnóstico antes de corrigir os dados.';
  else
    execute 'create unique index if not exists calendar_team_assets_team_slug_key on public.calendar_team_assets (team_slug)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    execute $function$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$
    $function$;
  end if;
end $$;

drop trigger if exists calendar_projects_set_updated_at on public.calendar_projects;
create trigger calendar_projects_set_updated_at
  before update on public.calendar_projects
  for each row
  execute function public.set_updated_at();

alter table public.calendar_branding enable row level security;
alter table public.calendar_team_assets enable row level security;
alter table public.calendar_projects enable row level security;

drop policy if exists "calendar_branding_select" on public.calendar_branding;
create policy "calendar_branding_select"
  on public.calendar_branding
  for select
  to anon, authenticated
  using (true);

drop policy if exists "calendar_branding_insert" on public.calendar_branding;
create policy "calendar_branding_insert"
  on public.calendar_branding
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "calendar_branding_update" on public.calendar_branding;
create policy "calendar_branding_update"
  on public.calendar_branding
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "calendar_team_assets_select" on public.calendar_team_assets;
create policy "calendar_team_assets_select"
  on public.calendar_team_assets
  for select
  to anon, authenticated
  using (true);

drop policy if exists "calendar_team_assets_insert" on public.calendar_team_assets;
create policy "calendar_team_assets_insert"
  on public.calendar_team_assets
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "calendar_team_assets_update" on public.calendar_team_assets;
create policy "calendar_team_assets_update"
  on public.calendar_team_assets
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "calendar_team_assets_delete" on public.calendar_team_assets;
create policy "calendar_team_assets_delete"
  on public.calendar_team_assets
  for delete
  to anon, authenticated
  using (true);

drop policy if exists "calendar_projects_select" on public.calendar_projects;
create policy "calendar_projects_select"
  on public.calendar_projects
  for select
  to anon, authenticated
  using (true);

drop policy if exists "calendar_projects_insert" on public.calendar_projects;
create policy "calendar_projects_insert"
  on public.calendar_projects
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "calendar_projects_update" on public.calendar_projects;
create policy "calendar_projects_update"
  on public.calendar_projects
  for update
  to anon, authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'calendar-assets',
  'calendar-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "calendar_assets_public_read" on storage.objects;
create policy "calendar_assets_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'calendar-assets');

drop policy if exists "calendar_assets_public_insert" on storage.objects;
create policy "calendar_assets_public_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'calendar-assets');

drop policy if exists "calendar_assets_public_update" on storage.objects;
create policy "calendar_assets_public_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'calendar-assets')
  with check (bucket_id = 'calendar-assets');

drop policy if exists "calendar_assets_public_delete" on storage.objects;
create policy "calendar_assets_public_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'calendar-assets');
