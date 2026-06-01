-- Roles, users, contacts, assignments, and per-role page permissions.
-- RLS uses the request header `x-user-id` and `x-user-role`, set by the
-- Next.js server when calling Supabase via the service-role client. This
-- keeps RLS as defense-in-depth even though filtering also happens in
-- application code.

create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'agent');

create table users (
  id uuid primary key default gen_random_uuid(),
  ghl_user_id text not null unique,
  ghl_location_id text not null,
  email text not null,
  name text,
  role user_role not null default 'agent',
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  ghl_contact_id text unique,
  ghl_location_id text not null,
  name text,
  email text,
  phone text,
  status text,
  value_cents bigint default 0,
  created_at timestamptz not null default now()
);

-- Many-to-many: which agents own which contacts.
create table contact_assignments (
  user_id uuid not null references users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, contact_id)
);
create index on contact_assignments (user_id);
create index on contact_assignments (contact_id);

-- Per-page visibility rules editable by admins.
create table role_permissions (
  role user_role not null,
  page text not null,
  visible boolean not null default true,
  primary key (role, page)
);

insert into role_permissions (role, page, visible) values
  ('admin', 'analytics', true),
  ('admin', 'contacts', true),
  ('admin', 'leaderboard', true),
  ('admin', 'admin', true),
  ('agent', 'analytics', true),
  ('agent', 'contacts', true),
  ('agent', 'leaderboard', true),
  ('agent', 'admin', false);

-- RLS
alter table users enable row level security;
alter table contacts enable row level security;
alter table contact_assignments enable row level security;
alter table role_permissions enable row level security;

create or replace function current_user_id() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.headers', true)::json->>'x-user-id','')::uuid
$$;

create or replace function current_user_role() returns text
  language sql stable as $$
    select current_setting('request.headers', true)::json->>'x-user-role'
$$;

-- users: agents see only themselves; admins see all.
create policy users_self_or_admin on users for select
  using (current_user_role() = 'admin' or id = current_user_id());

-- contacts: agents see only contacts assigned to them; admins see all.
create policy contacts_assigned_or_admin on contacts for select
  using (
    current_user_role() = 'admin'
    or exists (
      select 1 from contact_assignments
      where contact_id = contacts.id and user_id = current_user_id()
    )
  );

create policy assignments_self_or_admin on contact_assignments for select
  using (current_user_role() = 'admin' or user_id = current_user_id());

-- role_permissions: everyone reads; only admins mutate.
create policy role_perms_read on role_permissions for select using (true);
create policy role_perms_admin_write on role_permissions for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');
