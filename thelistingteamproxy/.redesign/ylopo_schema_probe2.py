#!/usr/bin/env python3
"""
Rewrite the raw_json probe. The first version had two flaws that could have
produced a false "no session data" conclusion:

  1. flattenNumeric only recorded values !== 0, so a session object present on
     every event with viewsCount: 0 would have been completely invisible.
  2. The full-range scan died on a GHL timeout, so the conclusion rested on the
     most recent 4,000 of 39,584 events. Older events were never inspected.

This version records KEY PRESENCE separately from non-zero values, reports the
payload's top-level keys, explicitly looks for session/additionalData/stats
containers, and takes a startPage so the whole range can be swept in chunks
that finish before GHL times out.
"""
import sys

W = "worker.js"
src = open(W, encoding="utf-8").read()
orig = src

# ---------------------------------------------- 1. startPage on scanYlopoEvents
OLD_SCAN = '''  var searchAfter = null, pages = 0, scanned = 0, total = null, hitCap = false;
  while (true) {
    if (pages >= maxPages) { hitCap = true; break; }
    var body = { locationId: locId, pageLimit: 100 };
    if (searchAfter) body.searchAfter = searchAfter; else body.page = 1;'''
NEW_SCAN = '''  var startPage = (opts && opts.startPage) || 1;
  var searchAfter = null, pages = 0, scanned = 0, total = null, hitCap = false;
  while (true) {
    if (pages >= maxPages) { hitCap = true; break; }
    var body = { locationId: locId, pageLimit: 100 };
    if (searchAfter) body.searchAfter = searchAfter; else body.page = startPage;'''
if src.count(OLD_SCAN) != 1:
    sys.exit(f"FAIL: scan loop matched {src.count(OLD_SCAN)} times")
src = src.replace(OLD_SCAN, NEW_SCAN, 1)

# --------------------------------------------------- 2. presence-aware probe
OLD_FLAT = 'function flattenNumeric(obj, prefix, out, depth) {'
if src.count(OLD_FLAT) != 1:
    sys.exit("FAIL: flattenNumeric anchor not unique")

NEW_FN = '''function flattenPresence(obj, prefix, out, depth) {
  if (!obj || typeof obj !== "object" || depth > 6) return out;
  for (var k in obj) {
    var v = obj[k];
    var key = prefix ? prefix + "." + k : k;
    var slot = out[key];
    if (!slot) slot = out[key] = { present: 0, nonzero: 0, max: 0, type: "" };
    slot.present++;
    if (v === null || v === undefined) { slot.type = slot.type || "null"; continue; }
    if (typeof v === "number") {
      slot.type = "number";
      if (v !== 0) { slot.nonzero++; if (v > slot.max) slot.max = v; }
    } else if (typeof v === "string") {
      slot.type = "string";
      if (v !== "" && /^[0-9]+(\\.[0-9]+)?$/.test(v)) {
        var n = Number(v);
        if (n !== 0) { slot.nonzero++; if (n > slot.max) slot.max = n; }
      }
    } else if (Array.isArray(v)) {
      slot.type = "array";
      if (v.length) { slot.nonzero++; if (v.length > slot.max) slot.max = v.length; }
      for (var i = 0; i < v.length && i < 2; i++) flattenPresence(v[i], key + "[]", out, depth + 1);
    } else if (typeof v === "object") {
      slot.type = "object";
      slot.nonzero++;
      flattenPresence(v, key, out, depth + 1);
    }
  }
  return out;
}
__name(flattenPresence, "flattenPresence");
function flattenNumeric(obj, prefix, out, depth) {'''
src = src.replace(OLD_FLAT, NEW_FN, 1)

OLD_PROBE_BODY = '''      var found = flattenNumeric(payload, "", {}, 0);
      for (var k in found) {
        var cur = slot.keys[k];
        if (!cur) cur = slot.keys[k] = { n: 0, max: 0 };
        cur.n++;
        if (found[k] > cur.max) cur.max = found[k];
      }'''
NEW_PROBE_BODY = '''      var found = flattenPresence(payload, "", {}, 0);
      for (var k in found) {
        var cur = slot.keys[k];
        if (!cur) cur = slot.keys[k] = { present: 0, nonzero: 0, max: 0, type: "" };
        cur.present += found[k].present;
        cur.nonzero += found[k].nonzero;
        if (found[k].max > cur.max) cur.max = found[k].max;
        cur.type = found[k].type || cur.type;
      }'''
if src.count(OLD_PROBE_BODY) != 1:
    sys.exit(f"FAIL: probe body matched {src.count(OLD_PROBE_BODY)} times")
src = src.replace(OLD_PROBE_BODY, NEW_PROBE_BODY, 1)

OLD_SIG = 'async function probeYlopoEventSchema(env, maxPages) {'
NEW_SIG = 'async function probeYlopoEventSchema(env, maxPages, startPage) {'
src = src.replace(OLD_SIG, NEW_SIG, 1)
OLD_CALL = '''  var meta = await scanYlopoEvents(env, {
    maxPages: maxPages,
    onRecord: function (rec) {
      var p = rec.properties || rec.fields || {};
      var t = String(p.ylopo_event || "UNKNOWN").slice(0, 40);
      var slot = byType[t];'''
NEW_CALL = '''  var meta = await scanYlopoEvents(env, {
    maxPages: maxPages,
    startPage: startPage,
    onRecord: function (rec) {
      var p = rec.properties || rec.fields || {};
      var t = String(p.ylopo_event || "UNKNOWN").slice(0, 40);
      var slot = byType[t];'''
if src.count(OLD_CALL) != 1:
    sys.exit(f"FAIL: probe scan call matched {src.count(OLD_CALL)} times")
src = src.replace(OLD_CALL, NEW_CALL, 1)

# ------------------------------------------------------- 3. route reporting
OLD_ROUTE = '''          const probe = await probeYlopoEventSchema(env, aggMaxPages);
          const types = {};
          for (const t of Object.keys(probe.byType)) {
            const slot = probe.byType[t];
            const keys = Object.entries(slot.keys)
              .sort((a, b) => b[1].n - a[1].n)
              .slice(0, 30)
              .map(([k, v]) => `${k} n=${v.n} max=${v.max}`);
            types[t] = { events: slot.events, numericKeys: keys };
          }'''
NEW_ROUTE = '''          const startPage = Math.max(1, parseInt(url.searchParams.get("startPage") || "1", 10) || 1);
          const probe = await probeYlopoEventSchema(env, aggMaxPages, startPage);
          const types = {};
          for (const t of Object.keys(probe.byType)) {
            const slot = probe.byType[t];
            const keys = Object.entries(slot.keys)
              .sort((a, b) => b[1].present - a[1].present)
              .slice(0, 40)
              .map(([k, v]) => `${k} [${v.type}] present=${v.present} nonzero=${v.nonzero} max=${v.max}`);
            types[t] = { events: slot.events, keys };
          }'''
if src.count(OLD_ROUTE) != 1:
    sys.exit(f"FAIL: route probe block matched {src.count(OLD_ROUTE)} times")
src = src.replace(OLD_ROUTE, NEW_ROUTE, 1)

src = src.replace('ok: true, mode: "schema",', 'ok: true, mode: "schema", startPage: Math.max(1, parseInt(url.searchParams.get("startPage") || "1", 10) || 1),', 1)

if src == orig:
    sys.exit("FAIL: no changes applied")
open(W, "w", encoding="utf-8").write(src)
print(f"OK: worker.js {len(orig)} -> {len(src)} bytes (+{len(src)-len(orig)})")
