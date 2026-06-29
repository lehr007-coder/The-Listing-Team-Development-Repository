#!/usr/bin/env python3
"""Deploy tos-proxy/worker.js to the tos-proxy (production) Cloudflare Worker.

First-deploy: creates the worker with the production TOS_KV namespace wired in.
Subsequent deploys: reads existing bindings and re-sends them, preserving secrets
via keep_bindings (same approach as the staging pipeline).

After the first deploy, set secrets once from the Mac workspace:
  npx wrangler secret put ANTHROPIC_API_KEY              --name tos-proxy
  npx wrangler secret put TOS_PORTAL_SIGNING_SECRET      --name tos-proxy
  npx wrangler secret put TOS_NOTIFY_GHL_WEBHOOK_URL     --name tos-proxy
  npx wrangler secret put TOS_REVIEW_REQUEST_GHL_WEBHOOK_URL --name tos-proxy

Required env: CF_API_TOKEN (Workers Scripts edit permission).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "tos-proxy"
UA = "Mozilla/5.0 (compatible; tos-deploy/1.0)"
WORKER_URL = "https://tos-proxy.lehr007.workers.dev"
SECRET_TYPES = ("secret_text", "secret_key")
REQUIRED_SECRETS = (
    "ANTHROPIC_API_KEY",
    "TOS_PORTAL_SIGNING_SECRET",
    "TOS_NOTIFY_GHL_WEBHOOK_URL",
    "TOS_REVIEW_REQUEST_GHL_WEBHOOK_URL",
)

# Production KV namespace — created 2026-06-14
PROD_TOS_KV_ID = "e1f66bdb4fe149a781bddab0ca94e9b0"

DEFAULT_BINDINGS = [
    {"type": "kv_namespace", "name": "TOS_KV", "namespace_id": PROD_TOS_KV_ID},
]

# Required for node:stream and other node: built-ins used by worker.js
DEFAULT_COMPAT_FLAGS = ["nodejs_compat"]

# Cloudflare occasionally returns 429/5xx or drops the connection under
# load; GET/PUT here are idempotent (PUT is a full replace), so retrying
# transient failures with exponential backoff is safe.
TRANSIENT_STATUS = {429, 500, 502, 503, 504}


def call(method, path, body=None, content_type="application/json"):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", "Bearer " + os.environ["CF_API_TOKEN"])
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        req.add_header("Content-Type", content_type)
    delay = 2
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, data) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in TRANSIENT_STATUS and attempt < 3:
                print(f"{method} {path} -> HTTP {e.code}, retrying in {delay}s")
                time.sleep(delay)
                delay *= 2
                continue
            sys.exit(f"{method} {path} -> HTTP {e.code}\n{e.read().decode()[:2000]}")
        except urllib.error.URLError as e:
            if attempt < 3:
                print(f"{method} {path} -> network error ({e.reason}), retrying in {delay}s")
                time.sleep(delay)
                delay *= 2
                continue
            sys.exit(f"{method} {path} -> network error: {e.reason}")


def main():
    accounts = call("GET", "/accounts")["result"]
    account = accounts[0]
    if len(accounts) > 1:
        print(f"note: token sees {len(accounts)} accounts, using first")
    print(f"account: {account['name']} ({account['id']})")
    base = f"/accounts/{account['id']}/workers/scripts/{SCRIPT}"

    settings_resp = call("GET", base + "/settings")
    first_deploy = settings_resp is None
    if first_deploy:
        print("worker does not exist yet — first deploy, using default bindings")
        bindings = list(DEFAULT_BINDINGS)
        compat_date = "2024-09-23"
        compat_flags = list(DEFAULT_COMPAT_FLAGS)
    else:
        settings = settings_resp["result"]
        bindings = settings.get("bindings") or []
        compat_date = settings.get("compatibility_date") or "2024-09-23"
        compat_flags = settings.get("compatibility_flags") or []

    nonsecret = [b for b in bindings if b["type"] not in SECRET_TYPES]
    secrets = sorted(b["name"] for b in bindings if b["type"] in SECRET_TYPES)
    print("bindings to re-send:", [(b["type"], b["name"]) for b in nonsecret])
    print("secrets preserved via keep_bindings:", secrets)
    missing = [s for s in REQUIRED_SECRETS if s not in secrets]
    if missing:
        msg = f"required worker secrets not yet set: {', '.join(missing)}"
        if first_deploy:
            print(f"::warning::{msg} — set via: npx wrangler secret put <NAME> --name {SCRIPT}")
        else:
            print(f"::warning::{msg}")

    metadata = {
        "main_module": "worker.js",
        "bindings": nonsecret,
        "keep_bindings": list(SECRET_TYPES),
        "compatibility_date": compat_date,
    }
    if compat_flags:
        metadata["compatibility_flags"] = compat_flags

    code = open(os.path.join(os.path.dirname(__file__), "worker.js"), "rb").read()
    boundary = uuid.uuid4().hex
    form = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n'
        f"Content-Type: application/json\r\n\r\n{json.dumps(metadata)}\r\n"
        f'--{boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n'
        f"Content-Type: application/javascript+module\r\n\r\n"
    ).encode() + code + f"\r\n--{boundary}--\r\n".encode()
    result = call("PUT", base, form, f"multipart/form-data; boundary={boundary}")["result"]
    print(f"deployed: id={result.get('id')} tag={result.get('etag', '')[:12]}")

    if not first_deploy:
        after = call("GET", base + "/settings")["result"]
        before_names = {(b["type"], b["name"]) for b in bindings}
        after_names = {(b["type"], b["name"]) for b in (after.get("bindings") or [])}
        if before_names != after_names:
            sys.exit(f"BINDINGS CHANGED!\nbefore: {sorted(before_names)}\nafter:  {sorted(after_names)}")
        print("bindings verified unchanged:", sorted(after_names))

    smoke = urllib.request.Request(WORKER_URL + "/tos/admin/stats")
    smoke.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(smoke) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    if status >= 500:
        sys.exit(f"smoke check failed: GET /tos/admin/stats -> {status}")
    print(f"smoke check: GET /tos/admin/stats -> {status} (worker is serving)")

    if first_deploy:
        print()
        print("=== FIRST DEPLOY COMPLETE — set secrets from the Mac workspace: ===")
        for s in REQUIRED_SECRETS:
            print(f"  npx wrangler secret put {s} --name {SCRIPT}")
        print("Then re-run this workflow to confirm secrets are bound.")


if __name__ == "__main__":
    main()
