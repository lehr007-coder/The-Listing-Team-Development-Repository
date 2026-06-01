-- One row per installed GHL location. company_id is set when the install
-- is at the agency level (chooselocation flow returns one of each).
create table ghl_oauth_tokens (
  location_id text primary key,
  company_id text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ghl_oauth_tokens enable row level security;
-- Tokens are server-only; no policies = no client access via anon key.
