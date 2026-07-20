-- Registro de generaciones por usuario para limitar el coste (rate-limit).
create table generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index generation_events_user_time_idx on generation_events (user_id, created_at);

-- Solo el backend (service_role) escribe/lee estos eventos.
alter table generation_events enable row level security;
grant select, insert on generation_events to service_role;
