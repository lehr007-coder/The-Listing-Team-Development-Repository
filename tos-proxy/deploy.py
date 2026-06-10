#!/usr/bin/env python3
"""Deploy tos-proxy/worker.js to the tos-proxy-staging Cloudflare Worker.

Uses the raw Workers API instead of wrangler because this repo has no
wrangler config for this worker and the live binding set (TOS_KV, vars,
secrets) must survive the deploy: non-secret bindings are read from the
worker's current settings and sent back verbatim, secrets are preserved
via keep_bindings. The upload is atomic — on any error the live worker
is unchanged.

Required env: CF_API_TOKEN (Workers Scripts edit permission).
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "tos-proxy-staging"
WORKER_URL = "https://tos-proxy-staging.lehr007.workers.dev"
SECRET_TYPES = ("secret_text", "secret_key")
REQUIRED_SECRETS = (
    "ANTHROPIC_API_KEY",
    "TOS_PORTAL_SIGNING_SECRET",
    "TOS_NOTIFY_GHL_WEBHOOK_URL",
    "TOS_REVIEW_WEBHOOK_URL",
)


def call(method, path, body=None, content_type="application/json"):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", "Bearer " + os.environ["CF_API_TOKEN"])
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, data) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> HTTP {e.code}\n{e.read().decode()[:2000]}")


def main():
    accounts = call("GET", "/accounts")["result"]
    account = accounts[0]
    if len(accounts) > 1:
        print(f"note: token sees {len(accounts)} accounts, using first")
    print(f"account: {account['name']} ({account['id']})")
    base = f"/accounts/{account['id']}/workers/scripts/{SCRIPT}"

    settings = call("GET", base + "/settings")["result"]
    bindings = settings.get("bindings") or []
    nonsecret = [b for b in bindings if b["type"] not in SECRET_TYPES]
    secrets = sorted(b["name"] for b in bindings if b["type"] in SECRET_TYPES)
    print("bindings to re-send:", [(b["type"], b["name"]) for b in nonsecret])
    print("secrets preserved via keep_bindings:", secrets)
    missing = [s for s in REQUIRED_SECRETS if s not in secrets]
    if missing:
        print(f"::warning::required worker secrets missing: {', '.join(missing)}")

    metadata = {
        "main_module": "worker.js",
        "bindings": nonsecret,
        "keep_bindings": list(SECRET_TYPES),
        "compatibility_date": settings.get("compatibility_date") or "2024-09-23",
    }
    if settings.get("compatibility_flags"):
        metadata["compatibility_flags"] = settings["compatibility_flags"]

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

    after = call("GET", base + "/settings")["result"]
    before_names = {(b["type"], b["name"]) for b in bindings}
    after_names = {(b["type"], b["name"]) for b in (after.get("bindings") or [])}
    if before_names != after_names:
        sys.exit(f"BINDINGS CHANGED!\nbefore: {sorted(before_names)}\nafter:  {sorted(after_names)}")
    print("bindings verified unchanged:", sorted(after_names))

    smoke = urllib.request.Request(WORKER_URL + "/tos/admin/stats")
    try:
        with urllib.request.urlopen(smoke) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    # Unauthenticated admin call must be rejected, not 5xx
    if status >= 500:
        sys.exit(f"smoke check failed: GET /tos/admin/stats -> {status}")
    print(f"smoke check: GET /tos/admin/stats -> {status} (worker is serving)")


if __name__ == "__main__":
    main()
