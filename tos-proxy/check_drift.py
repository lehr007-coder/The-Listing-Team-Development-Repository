#!/usr/bin/env python3
"""Fail if the live tos-proxy-staging worker no longer contains the go-live
fixes — i.e. someone deployed from the Mac TS workspace without porting them
(see tos-proxy/PORTING-TO-TS.md).

Markers are string literals that survive recompilation from TS source:
  - "parse-lock:" and the 409 message  -> Item 4 lock present
  - "tos_doc_uploaded_at" absent       -> Item 2 invented keys removed

Required env: CF_API_TOKEN.
"""

import json
import os
import sys
import urllib.request

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "tos-proxy-staging"


def get(path, accept="application/json"):
    req = urllib.request.Request(API + path)
    req.add_header("Authorization", "Bearer " + os.environ["CF_API_TOKEN"])
    req.add_header("Accept", accept)
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8", "replace")


def main():
    account_id = json.loads(get("/accounts"))["result"][0]["id"]
    code = get(f"/accounts/{account_id}/workers/scripts/{SCRIPT}", accept="*/*")
    problems = []
    if "parse-lock:" not in code or "parse already in progress" not in code:
        problems.append("Item 4 parse lock is MISSING from the live worker")
    if "tos_doc_uploaded_at" in code:
        problems.append("Item 2 invented packet keys are BACK in the live worker")
    if problems:
        for p in problems:
            print(f"::error::{p}")
        print("::error::The live worker has drifted — a deploy likely ran from the "
              "TS workspace without porting the fixes. See tos-proxy/PORTING-TO-TS.md.")
        sys.exit(1)
    print("drift check passed: live worker still contains the go-live fixes")


if __name__ == "__main__":
    main()
