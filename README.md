# The Listing Team — Development Repository

Monorepo for The Listing Team's Cloudflare Workers platform, plus the Supabase schema, GHL SSO integration, and admin tooling that runs on top.

## Repo layout

```
.
├── thelistingteamproxy/        Main proxy + dashboard (GHL wrapper, Ylopo, admin, pipeline)
├── support-tickets/            Standalone support-ticket worker (own Supabase writes)
├── ghl-brand-injector/         Multi-brand CSS/logo injector, backed by KV + R2
├── src/                        tlt-image-server — images.reallistingteam.com (D1 + R2, WIP — src currently empty)
├── migrations/                 D1 SQL for tlt-image-server
├── .github/workflows/          CI for staging (auto) and production (manual)
├── .agents/skills/             Claude agent skills (supabase, postgres best practices)
└── .claude/skills/             Symlinks to .agents/skills
```

## Workers at a glance

| Worker | Staging URL | Prod config | GHA in staging workflow |
|---|---|---|---|
| thelistingteamproxy | thelistingteamproxy-staging.lehr007.workers.dev | `wrangler.toml` → `thelistingteamproxy` | yes |
| support-tickets | tlt-support-tickets-staging.lehr007.workers.dev | `wrangler.toml` → `tlt-support-tickets` | yes |
| ghl-brand-injector | ghl-brand-injector-staging.lehr007.workers.dev | `wrangler.toml` → `ghl-brand-injector` | yes |
| tlt-image-server (root) | — not deployed | `wrangler.toml` → `tlt-image-server` | no (src empty) |

## Data layer (Supabase)

Two projects exist in the org:

- **`tglbjiehyfyrefxwgmzz` — ylopo-intelligence (LIVE).** This is the project the workers actually read/write. Tables: `pipeline_items`, `user_permissions`, `support_tickets`, `leads`, `events`, `listings`, `scoring_log`.
- **`xejjouzoskjgivuadiqa` — The Listing Team (unused so far).** Created Apr 20 2026, currently empty. Candidate for a future production/environment split, but nothing points at it today.

Worker secrets `SUPABASE_URL` and `SUPABASE_KEY` point at the live project.

### `user_permissions` schema

```sql
CREATE TABLE user_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_user_id TEXT UNIQUE NOT NULL,
  user_role TEXT DEFAULT 'user',
  can_contacts BOOLEAN DEFAULT true,
  can_analytics BOOLEAN DEFAULT true,
  can_pipeline BOOLEAN DEFAULT true,
  can_tickets BOOLEAN DEFAULT true,
  can_admin BOOLEAN DEFAULT false,
  can_brand_injector BOOLEAN DEFAULT false,
  can_social BOOLEAN DEFAULT false,
  can_blog BOOLEAN DEFAULT false,
  can_media BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

RLS enabled with `allow_all_perms` policy. Writes come through the worker using the service key.

## Auth (GHL SSO)

The proxy worker exposes `/dashboard/*` routes behind a cookie-based session.

- Session cookie `tlt_session` is an HMAC-signed payload (secret: `SESSION_SECRET`) containing `uid`, `email`, `name`, `role`, `loc`, `exp`.
- Admin role is determined by (a) the GHL user role fetched via `GHL_AGENCY_KEY`, falling back to "admin" if the lookup fails (fail-open during setup), and (b) the `can_admin` flag on `user_permissions`.
- Bootstrap admins (seeded in `user_permissions`): all three Scott Lehr GHL accounts — `UF54kjaNU4D1b9QTQokk`, `bnBo8T2gisOXvEGiuJTI`, `g6R0VbDaW5MEhmIHOefT`.

## Secrets (per worker, Cloudflare)

`thelistingteamproxy-staging` (plus `-production` when set up):

| Secret | Used for |
|---|---|
| `SUPABASE_URL` | Supabase project base URL |
| `SUPABASE_KEY` | Supabase service role key (anon key would also work for read-heavy paths) |
| `GHL_AGENCY_KEY` | GHL v1 agency key, used for role lookups |
| `GHL_API_KEY` | GHL v1 per-location key |
| `GHL_V2_TOKEN` | GHL v2 OAuth token |
| `ATTOM_KEY` | ATTOM property data |
| `PROXY_API_KEY` | Shared bearer for worker-to-worker calls |
| `SESSION_SECRET` | HMAC signing key for session cookies |

`ghl-brand-injector-staging`: `ADMIN_KEY`, `GHL_AGENCY_KEY`.
`tlt-support-tickets-staging`: its own `SUPABASE_URL` / `SUPABASE_KEY`.

## Deploying

### Staging (automatic)

Any push to `main` or a `claude/**` branch triggers `.github/workflows/deploy-staging.yml`. All three workers deploy in parallel. Watch runs at github.com/lehr007-coder/The-Listing-Team-Development-Repository/actions.

Manual fallback from the local Mac:

```sh
cd thelistingteamproxy && npx wrangler@latest deploy --config wrangler.staging.toml
cd ../support-tickets && npx wrangler@latest deploy --config wrangler.staging.toml
cd ../ghl-brand-injector && npx wrangler@latest deploy --config wrangler.staging.toml
```

### Production (manual)

Trigger `.github/workflows/deploy-production.yml` from the Actions tab ("Run workflow") or:

```sh
gh workflow run deploy-production.yml -f confirm=DEPLOY
```

The `confirm=DEPLOY` gate prevents accidental runs.

Before the first prod deploy:

1. Set every secret listed above against each prod worker (`wrangler secret put SECRET_NAME --config wrangler.toml` inside the worker directory).
2. If prod should use a separate Supabase project, point `SUPABASE_URL`/`SUPABASE_KEY` at it and apply the `user_permissions` migration there.
3. Add custom domains in the Cloudflare dashboard (Workers → worker → Settings → Triggers → Custom Domains).

## Local dev

Node >= 20 recommended.

```sh
cd thelistingteamproxy
npx wrangler dev --config wrangler.staging.toml
```

Secrets aren't pulled down by `wrangler dev` — use `.dev.vars` for local overrides (git-ignored).

## Applying Supabase migrations

Via MCP or the Supabase SQL Editor against `tglbjiehyfyrefxwgmzz` (the live project). There's no migration tool wired up — SQL is applied by hand from the snippets in this README or in `worker.js` inline setup SQL.

## Safety notes

- Staging workers show a red "STAGING ENVIRONMENT" banner injected by the worker itself when hostname contains `staging` or `workers.dev`.
- The worker's session layer fails **open** (treats unknown users as admin) if `GHL_AGENCY_KEY` is missing. Do not remove that key in prod unless you've also locked down the default.
- Branch `claude/reset-admin-password-UPmDQ` is the current active branch. `main` is the long-term integration branch — protect it before shipping to anyone.
