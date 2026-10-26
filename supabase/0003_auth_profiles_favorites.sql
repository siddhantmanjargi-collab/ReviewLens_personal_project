-- ReviewLens Phase 3: Supabase Auth Profiles + Relational Favourites & Buyer Profile
-- Run this migration in your Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

-- 1. User Profiles linked 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  email text,
  display_name text,
  muted_categories text[] not null default '{}',
  strict_trust_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Relational User Favourites (Shortlist & Side-by-Side Compare)
create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  interaction_type text not null check (interaction_type in ('shortlist', 'compare')),
  created_at timestamptz not null default now(),
  unique (user_id, product_id, interaction_type)
);

create index if not exists idx_user_favorites_user_type_created
  on public.user_favorites (user_id, interaction_type, created_at desc);

-- 3. Row-Level Security (RLS) Policies
alter table public.profiles enable row level security;
alter table public.user_favorites enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can view own favorites" on public.user_favorites;
create policy "Users can view own favorites"
  on public.user_favorites for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own favorites" on public.user_favorites;
create policy "Users can insert own favorites"
  on public.user_favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own favorites" on public.user_favorites;
create policy "Users can delete own favorites"
  on public.user_favorites for delete
  using (auth.uid() = user_id);

-- 4. Auto-provision public.profiles row on Supabase Auth signup (Password, Magic Link, or OAuth)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_handle text;
  clean_handle text;
  candidate_handle text;
begin
  raw_handle := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(coalesce(new.email, 'buyer'), '@', 1)
  );
  clean_handle := regexp_replace(lower(raw_handle), '[^a-z0-9_]', '', 'g');
  if length(clean_handle) < 3 then
    clean_handle := 'buyer_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  clean_handle := substr(clean_handle, 1, 20);
  candidate_handle := clean_handle;

  if exists (select 1 from public.profiles where username = candidate_handle) then
    candidate_handle := substr(clean_handle, 1, 17) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  insert into public.profiles (id, username, email, display_name)
  values (
    new.id,
    candidate_handle,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', candidate_handle)
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 5. Atomic RPC to sync shortlist & compare arrays into relational user_favorites rows
create or replace function public.sync_user_favorites(
  p_shortlist_ids text[],
  p_compare_ids text[]
)
returns void
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  -- Prune removed shortlist rows while preserving original created_at timestamps for kept items
  delete from public.user_favorites
  where user_id = v_uid
    and interaction_type = 'shortlist'
    and not (product_id = any(coalesce(p_shortlist_ids, '{}')));

  insert into public.user_favorites (user_id, product_id, interaction_type)
  select v_uid, unnest(coalesce(p_shortlist_ids[1:50], '{}')), 'shortlist'
  on conflict (user_id, product_id, interaction_type) do nothing;

  -- Prune removed compare rows
  delete from public.user_favorites
  where user_id = v_uid
    and interaction_type = 'compare'
    and not (product_id = any(coalesce(p_compare_ids, '{}')));

  insert into public.user_favorites (user_id, product_id, interaction_type)
  select v_uid, unnest(coalesce(p_compare_ids[1:4], '{}')), 'compare'
  on conflict (user_id, product_id, interaction_type) do nothing;

  update public.profiles
  set updated_at = now()
  where id = v_uid;
end;
$$;

-- 6. Enable Realtime notifications on user_favorites for instant multi-tab sync
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.user_favorites;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
