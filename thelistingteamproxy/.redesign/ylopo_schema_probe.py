#!/usr/bin/env python3
"""
Add ?mode=schema to /ylopo-events/aggregate.

The typed custom-object properties (views, saves, last_session_*) are zero on
essentially every record - a full 39,584-event scan found exactly one contact
with a nonzero value, and that was a test record. The real Ylopo payload is
stored verbatim in properties.raw_json, so the counters, if they are anywhere,
are in there.

Rather than sample records by hand, this walks every raw_json, flattens it to
dotted keys, and reports per event type which numeric keys occur and how large
they get. One pass answers "which field is views" definitively.
"""
import sys

W = "worker.js"
src = open(W, encoding="utf-8").read()
orig = src

ANCHOR = "async function aggregateYlopoActivity(env, maxPages) {"
if src.count(ANCHOR) != 1:
    sys.exit(f"FAIL: aggregateYlopoActivity anchor matched {src.count(ANCHOR)} times")

PROBE = '''function flattenNumeric(obj, prefix, out, depth) {
  if (!obj || typeof obj !== "object" || depth > 5) return out;
  for (var k in obj) {
    var v = obj[k];
    var key = prefix ? prefix + "." + k : k;
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (v !== 0) out[key] = Math.max(out[key] || 0, v);
    } else if (typeof v === "string") {
      if (v !== "" && /^[0-9]+(\\.[0-9]+)?$/.test(v)) {
        var n = Number(v);
        if (n !== 0) out[key] = Math.max(out[key] || 0, n);
      }
    } else if (Array.isArray(v)) {
      if (v.length) out[key + "[]len"] = Math.max(out[key + "[]len"] || 0, v.length);
      for (var i = 0; i < v.length && i < 3; i++) flattenNumeric(v[i], key + "[]", out, depth + 1);
    } else if (typeof v === "object") {
      flattenNumeric(v, key, out, depth + 1);
    }
  }
  return out;
}
__name(flattenNumeric, "flattenNumeric");
async function probeYlopoEventSchema(env, maxPages) {
  var byType = /* @__PURE__ */ Object.create(null);
  var parseFailures = 0, noRaw = 0;
  var meta = await scanYlopoEvents(env, {
    maxPages: maxPages,
    onRecord: function (rec) {
      var p = rec.properties || rec.fields || {};
      var t = String(p.ylopo_event || "UNKNOWN").slice(0, 40);
      var slot = byType[t];
      if (!slot) slot = byType[t] = { events: 0, keys: {} };
      slot.events++;
      var raw = p.raw_json;
      if (!raw) { noRaw++; return; }
      var payload;
      try { payload = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch (e) { parseFailures++; return; }
      var found = flattenNumeric(payload, "", {}, 0);
      for (var k in found) {
        var cur = slot.keys[k];
        if (!cur) cur = slot.keys[k] = { n: 0, max: 0 };
        cur.n++;
        if (found[k] > cur.max) cur.max = found[k];
      }
    }
  });
  return { meta: meta, byType: byType, parseFailures: parseFailures, noRaw: noRaw };
}
__name(probeYlopoEventSchema, "probeYlopoEventSchema");
'''

src = src.replace(ANCHOR, PROBE + ANCHOR, 1)

ROUTE_OLD = '''        const aggMaxPages = Math.min(parseInt(url.searchParams.get("maxPages") || "500", 10) || 500, 900);
        const agg = await aggregateYlopoActivity(env, aggMaxPages);'''
ROUTE_NEW = '''        const aggMaxPages = Math.min(parseInt(url.searchParams.get("maxPages") || "500", 10) || 500, 900);
        if (url.searchParams.get("mode") === "schema") {
          const probe = await probeYlopoEventSchema(env, aggMaxPages);
          const types = {};
          for (const t of Object.keys(probe.byType)) {
            const slot = probe.byType[t];
            const keys = Object.entries(slot.keys)
              .sort((a, b) => b[1].n - a[1].n)
              .slice(0, 30)
              .map(([k, v]) => `${k} n=${v.n} max=${v.max}`);
            types[t] = { events: slot.events, numericKeys: keys };
          }
          return json({
            ok: true, mode: "schema",
            scanned: probe.meta.scanned, pages: probe.meta.pages,
            totalInGhl: probe.meta.total, truncated: probe.meta.truncated,
            parseFailures: probe.parseFailures, recordsWithoutRawJson: probe.noRaw,
            types
          });
        }
        const agg = await aggregateYlopoActivity(env, aggMaxPages);'''
if src.count(ROUTE_OLD) != 1:
    sys.exit(f"FAIL: route body matched {src.count(ROUTE_OLD)} times")
src = src.replace(ROUTE_OLD, ROUTE_NEW, 1)

if src == orig:
    sys.exit("FAIL: no changes applied")
open(W, "w", encoding="utf-8").write(src)
print(f"OK: worker.js {len(orig)} -> {len(src)} bytes (+{len(src)-len(orig)})")
