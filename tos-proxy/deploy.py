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
import secrets as pysecrets
import sys
import time
import urllib.error
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "tos-proxy-staging"
UA = "Mozilla/5.0 (compatible; tos-deploy/1.0)"
WORKER_URL = "https://tos-proxy-staging.lehr007.workers.dev"
SECRET_TYPES = ("secret_text", "secret_key")
REQUIRED_SECRETS = (
    "ANTHROPIC_API_KEY",
    "TOS_PORTAL_SIGNING_SECRET",
    "TOS_NOTIFY_GHL_WEBHOOK_URL",
    # The handoff calls this TOS_REVIEW_WEBHOOK_URL, but the worker code
    # reads TOS_REVIEW_REQUEST_GHL_WEBHOOK_URL.
    "TOS_REVIEW_REQUEST_GHL_WEBHOOK_URL",
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

    golive = os.environ.get("GOLIVE") == "1"
    golive_token = pysecrets.token_hex(32) if golive else None

    settings = call("GET", base + "/settings")["result"]
    bindings = settings.get("bindings") or []
    # TOS_GOLIVE_TOKEN is a transient per-run binding; never carry a stale one
    nonsecret = [
        b for b in bindings
        if b["type"] not in SECRET_TYPES and b["name"] != "TOS_GOLIVE_TOKEN"
    ]
    if golive:
        print(f"::add-mask::{golive_token}")
        nonsecret.append({"type": "plain_text", "name": "TOS_GOLIVE_TOKEN", "text": golive_token})
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
    transient = {("plain_text", "TOS_GOLIVE_TOKEN")}
    before_names = {(b["type"], b["name"]) for b in bindings} - transient
    after_names = {(b["type"], b["name"]) for b in (after.get("bindings") or [])} - transient
    if before_names != after_names:
        sys.exit(f"BINDINGS CHANGED!\nbefore: {sorted(before_names)}\nafter:  {sorted(after_names)}")
    print("bindings verified unchanged:", sorted(after_names))

    smoke = urllib.request.Request(WORKER_URL + "/tos/admin/stats")
    # workers.dev sits behind Browser Integrity Check, which 403s (error
    # 1010) the default Python-urllib User-Agent
    smoke.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(smoke) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    # Unauthenticated admin call must be rejected, not 5xx
    if status >= 500:
        sys.exit(f"smoke check failed: GET /tos/admin/stats -> {status}")
    print(f"smoke check: GET /tos/admin/stats -> {status} (worker is serving)")

    if golive:
        run_golive(golive_token)


def golive_call(token, payload, timeout=240):
    req = urllib.request.Request(
        WORKER_URL + "/tos/admin/golive",
        data=json.dumps(payload).encode(),
        method="POST",
    )
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.load(r)


def run_golive(token):
    """Post-deploy go-live checks via the transient /tos/admin/golive endpoint."""
    # New code/binding can take a few seconds to propagate to the edge
    for attempt in range(10):
        try:
            status, body = golive_call(token, {"action": "inspect"})
            break
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404) and attempt < 9:
                time.sleep(3)
                continue
            print(f"golive inspect failed: HTTP {e.code} {e.read().decode()[:500]}")
            return
    print("=== golive: inspect tos_party_role field ===")
    print(json.dumps(body, indent=2)[:9000])

    for action, extra, limit in (
        ("apply", {}, 4000),
        ("probe", {}, 6000),
        ("locktest", {"transactionId": "GOLIVE_LOCKTEST"}, 4000),
    ):
        try:
            status, body = golive_call(token, {"action": action, **extra})
            print(f"=== golive: {action} ===")
            print(json.dumps(body, indent=2)[:limit])
        except urllib.error.HTTPError as e:
            print(f"=== golive: {action} -> HTTP {e.code} ===")
            print(e.read().decode()[:limit])
        except Exception as e:
            print(f"golive {action} failed: {str(e)[:300]}")


if __name__ == "__main__":
    main()
