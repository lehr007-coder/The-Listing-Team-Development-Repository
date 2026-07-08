#!/usr/bin/env python3
"""Deploy social-post-importer.js to the social-post-importer-staging Cloudflare Worker.

Uses the raw Workers API instead of wrangler because this repo has no
wrangler config for this worker and the live binding set (BRANDS, SESSIONS
KV namespaces, GHL/Anthropic/image-server secrets and vars) must survive
the deploy: non-secret bindings are read from the worker's current
settings and sent back verbatim, secrets are preserved via keep_bindings.
The upload is atomic -- on any error the live worker is unchanged.

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
SCRIPT = "social-post-importer-staging"
UA = "Mozilla/5.0 (compatible; social-post-importer-deploy/1.0)"
WORKER_URL = "https://social-post-importer-staging.lehr007.workers.dev"
SECRET_TYPES = ("secret_text", "secret_key")
REQUIRED_SECRETS = (
    "ANTHROPIC_API_KEY",
    "AI_API_KEY",
    "GHL_API_KEY",
    "GHL_AGENCY_KEY",
    "GHL_BLOG_TOKEN",
    "GHL_LOCATION_ID",
    "IMAGE_SERVER_USERNAME",
    "IMAGE_SERVER_PASSWORD",
)

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
            if e.code in TRANSIENT_STATUS and attempt < 3:
                print(f"{method} {path} -> HTTP {e.code}, retrying in {delay}s")
                time.sleep(delay)
                delay *= 2
                continue
            detail = e.read().decode()[:2000]
            sys.exit(f"{method} {path} -> HTTP {e.code} :: {detail}")
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
        "main_module": "social-post-importer.js",
        "bindings": nonsecret,
        "keep_bindings": list(SECRET_TYPES),
        "compatibility_date": settings.get("compatibility_date") or "2024-09-23",
    }
    if settings.get("compatibility_flags"):
        metadata["compatibility_flags"] = settings["compatibility_flags"]

    code_path = os.path.join(os.path.dirname(__file__), "..", "social-post-importer.js")
    code = open(code_path, "rb").read()
    boundary = uuid.uuid4().hex
    CRLF = "\r\n"
    part1 = f"--{boundary}{CRLF}Content-Disposition: form-data; name=\"metadata\"{CRLF}Content-Type: application/json{CRLF}{CRLF}{json.dumps(metadata)}{CRLF}"
    part2 = f"--{boundary}{CRLF}Content-Disposition: form-data; name=\"social-post-importer.js\"; filename=\"social-post-importer.js\"{CRLF}Content-Type: application/javascript+module{CRLF}{CRLF}"
    tail = f"{CRLF}--{boundary}--{CRLF}"
    form = part1.encode() + part2.encode() + code + tail.encode()

    result = call("PUT", base, form, f"multipart/form-data; boundary={boundary}")["result"]
    print(f"deployed: id={result.get('id')} tag={result.get('etag', '')[:12]}")

    after = call("GET", base + "/settings")["result"]
    before_names = {(b["type"], b["name"]) for b in bindings}
    after_names = {(b["type"], b["name"]) for b in (after.get("bindings") or [])}
    if before_names != after_names:
        sys.exit(f"BINDINGS CHANGED! before={sorted(before_names)} after={sorted(after_names)}")
    print("bindings verified unchanged:", sorted(after_names))

    smoke = urllib.request.Request(WORKER_URL + "/api/health")
    smoke.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(smoke) as r:
            status = r.status
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode()
    if status >= 500:
        sys.exit(f"smoke check failed: GET /api/health -> {status} :: {body[:500]}")
    print(f"smoke check: GET /api/health -> {status} {body[:200]}")


if __name__ == "__main__":
    main()
