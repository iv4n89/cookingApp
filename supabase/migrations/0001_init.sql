-- RecetasApp — esquema inicial.
-- Postgres + pgvector. Portable a Supabase o Postgres autogestionado.

create extension if not exists vector;
create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);
-- Con Supabase Auth, id referencia auth.users(id) y esta tabla actúa de perfil.

create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  source text not null check (source in ('web', 'generated')),
  source_url text,
  image_url text,
  servings int not null default 2,
  prep_time_min int not null default 0,
  cook_time_min int not null default 0,
  calories int,
  tags text[] not null default '{}',
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  -- Dimensión pendiente de confirmar contra el modelo de embeddings de MiniMax.
  embedding vector(1536),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index recipes_embedding_idx on recipes
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index recipes_tags_idx on recipes using gin (tags);

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  updated_at timestamptz not null default now()
);
create index pantry_items_user_idx on pantry_items (user_id);

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  checked boolean not null default false,
  recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shopping_list_items_user_idx on shopping_list_items (user_id);

create table subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  plan text check (plan in ('monthly', 'annual')),
  renews_at timestamptz,
  rc_app_user_id text,
  updated_at timestamptz not null default now()
);
