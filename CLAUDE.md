# CLAUDE.md — The Listing Team development repository

Instructions for any AI session working in this repo. Read this before deploying anything.

## STANDING RULE: STAGING IS THE DEFAULT

Set by Scott on 2026-08-14. No expiry. Applies to every workflow in this repo.

> **All new work deploys to STAGING. Production is touched only when Scott says so
> explicitly, in that specific request.**

```bash
# DEFAULT — staging
npx wrangler deploy -c wrangler.staging.toml

# PRODUCTION — only with an explicit, in-request go-ahead from Scott
npx wrangler deploy
```

The bare `npx wrangler deploy` reads `wrangler.toml`, which is **production**. Never run it
on autopilot. Before deploying any worker in this repo, check whether it has a
`wrangler.staging.toml` or a `[env.staging]` block and use that.

Rules of thumb:

- Change requested, no environment named -> staging, then send Scott the staging URL.
- "Ship it" / "deploy it" with no environment named -> **staging**, then ask about promoting.
- A production approval is spent when it is used. The next production deploy needs its own
  explicit go-ahead. Yesterday's "yes" is not today's.
- Unsure -> staging, then ask. Staging is always the safe default.

The same instinct applies to anything else with a live blast radius: GoHighLevel workflows
on the live location, Supabase migrations against canonical data, DNS/routes, cron and
scheduled tasks, and bulk data operations. Prefer the reversible path, and dry-run first.

## Verifying a deploy

Always use a cache-busting query string:

```
curl -s "https://<host>/dashboard/ylopo-contacts?v=$RANDOM" | grep -c 'app-shell'
```

The Cloudflare edge served a stale copy for roughly 30 seconds after a production deploy,
even though the response carries `cache-control: no-cache`. **Do not conclude a deploy
failed from a single request.**

## thelistingteamproxy — the main dashboard worker

Serves the Hub, Pipeline, Priority Leads, Ylopo Contacts and Ylopo Analytics dashboards.

```
thelistingteamproxy/
  worker.js               the entire worker, one ~1.3 MB file, ~23,400 lines
  wrangler.toml           PRODUCTION -> thelistingteamproxy.reallistingteam.com
  wrangler.staging.toml   STAGING    -> thelistingteamproxy-staging.lehr007.workers.dev
                                        + stagingproxy.reallistingteam.com
  .redesign/              build scripts for the Contacts UI (git-ignored)
```

Each dashboard page is a big template literal: `PRIORITY_LEADS_HTML`,
`YLOPO_CONTACTS_HTML`, `YLOPO_ANALYTICS_HTML`. Inside them, closing script tags are written
`<\/script>` — match that style. Do not put backticks or `${` in anything you splice into a
template literal.

### Editing the Ylopo Contacts page

Do not hand-edit `worker.js` for this page. Use the idempotent scripts:

```bash
cd thelistingteamproxy
python3 .redesign/splice.py    # swap the <style> block + body markup from .redesign/
python3 .redesign/jsfix.py     # apply the JS fixes (skips any already present)
node --check worker.js
npx wrangler deploy -c wrangler.staging.toml
```

`splice.py` aborts if any of the 64 element IDs the dashboard JS depends on would be lost.
`jsfix.py` and `prodfix.py` abort if a patch target no longer matches the expected count.
`prodfix.py` is the production-safe subset: it asserts it changes zero colour literals.

### Design tokens

The Contacts page uses three-layer tokens built from the brand colours
`#0D3B4F` / `#1E7A9C` / `#5DADE2`. Both themes redefine the *same* semantic variable names
(`--bg`, `--surface`, `--card`, `--card-border`, `--text`, `--green`, ...) that the inline
styles and the dashboard JS already reference. **Never hardcode a colour in generated
markup** — use the semantic variable, or it will break in one of the two themes. That is
exactly how `#00ff55` ended up at ~1.4:1 contrast when light mode landed.

## Git conventions

- Keep production-safe fixes and visual/behavioural changes on **separate branches**, so
  either can ship without dragging the other along.
- After anything ships to production, rebuild feature branches on top of `main` so they stay
  clean fast-forwards and the two never diverge.
- `main` is not automatically what is deployed. Check the live host before assuming.

## Known-good rollback points

| SHA | What it is |
|---|---|
| `57547f9` | before the 2026-08-14 score-history/init bug fixes |
| `e235c3d` | original design + those bug fixes — **what production ran as of 2026-08-14** |
| `4688798` | `e235c3d` + the Contacts design system v2 (staging) |

```bash
git checkout <sha> -- thelistingteamproxy/worker.js
npx wrangler deploy -c wrangler.staging.toml
npx wrangler versions list --name thelistingteamproxy
```

## Gotchas worth remembering

- `SCORE_HISTORY_KEY` used to be declared twice in `YLOPO_CONTACTS_HTML`; the later `var`
  won for the whole script and two subsystems collided on one localStorage key. If you add a
  `var` near the bottom of a template literal, check it is not already declared at the top.
- `loadData()` returns nothing. Do not chain `.then()` on it.
- `setFilter()` runs `document.querySelectorAll('.filter-tab')` and strips `.active` from
  every match — do not reuse that class for anything that is not a status filter.
