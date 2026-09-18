#!/usr/bin/env python3
"""
Gate /ylopo-events and /ylopo-events/aggregate behind admin auth.

Both return per-contact records including names and emails. /ylopo-events was
already public, but it was harmlessly returning {} because groupEventsByContact
never matched an association. Fixing that association turns the same public
endpoint into a 3.7MB dump of contact PII, so the guard has to land in the same
change - fixing the bug without it would CREATE an exposure.

Accepts either a dashboard session (the routes are admin diagnostics reached
from the dashboard) or an x-admin-pass header matching PIPELINE_ADMIN_PASS,
which is the pattern the pipeline admin routes in this worker already use.
"""
import sys

W = "worker.js"
src = open(W, encoding="utf-8").read()
orig = src

# ------------------------------------------------------------------ 1. helper
ANCHOR = "function ylopoEventContactId(rec) {"
if src.count(ANCHOR) != 1:
    sys.exit(f"FAIL: helper anchor matched {src.count(ANCHOR)} times")

GUARD = '''async function ylopoAdminDenied(request, env) {
  try {
    var sess = await getSession(request, env);
    if (sess && (sess.uid || sess.email || sess.role === "admin")) return null;
  } catch (e) {
  }
  var given = request.headers.get("x-admin-pass") || "";
  if (env.PIPELINE_ADMIN_PASS && given === env.PIPELINE_ADMIN_PASS) return null;
  return err("Unauthorized: admin session or x-admin-pass required.", 401);
}
__name(ylopoAdminDenied, "ylopoAdminDenied");
'''
src = src.replace(ANCHOR, GUARD + ANCHOR, 1)

# --------------------------------------------------- 2. guard the two routes
AGG_ROUTE = '''    if (method === "GET" && path === "/ylopo-events/aggregate") {
      try {'''
AGG_NEW = '''    if (method === "GET" && path === "/ylopo-events/aggregate") {
      const aggDenied = await ylopoAdminDenied(request, env);
      if (aggDenied) return aggDenied;
      try {'''
if src.count(AGG_ROUTE) != 1:
    sys.exit(f"FAIL: aggregate route matched {src.count(AGG_ROUTE)} times")
src = src.replace(AGG_ROUTE, AGG_NEW, 1)

EV_ROUTE = '''    if (method === "GET" && path === "/ylopo-events") {
      try {
        const allEvents = await fetchAllYlopoEvents(env);'''
EV_NEW = '''    if (method === "GET" && path === "/ylopo-events") {
      const evDenied = await ylopoAdminDenied(request, env);
      if (evDenied) return evDenied;
      try {
        const allEvents = await fetchAllYlopoEvents(env);'''
if src.count(EV_ROUTE) != 1:
    sys.exit(f"FAIL: /ylopo-events route matched {src.count(EV_ROUTE)} times")
src = src.replace(EV_ROUTE, EV_NEW, 1)

if src == orig:
    sys.exit("FAIL: no changes applied")
open(W, "w", encoding="utf-8").write(src)
print(f"OK: worker.js {len(orig)} -> {len(src)} bytes (+{len(src)-len(orig)})")
