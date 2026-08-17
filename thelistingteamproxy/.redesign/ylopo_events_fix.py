#!/usr/bin/env python3
"""
Fix the Ylopo event -> contact association and add an aggregation route.

GHL returns the contact link on custom-object records as
    rec.relations[] = [{associationId, objectKey: "contact", recordId, ...}]
groupEventsByContact looked for rec.associations / rec.relationships /
rec.contactId / rec.fields.contactId - none of which GHL emits - so every one of
the 39,584 stored ylopo_event records failed to associate and /ylopo-events
reported contactsWithEvents: 0.

Also adds cursor (searchAfter) paging, because the old page<=20 loop capped the
scan at 2,000 of 39,584 records, and a streaming aggregator that never holds the
full record set in memory (raw_json alone would be ~60MB).
"""
import re
import sys

W = "worker.js"
src = open(W, encoding="utf-8").read()
orig = src

ASSOC_ID = "6993820513ab7068597962ae"

# ---------------------------------------------------------------- 1. helpers
ANCHOR = "function groupEventsByContact(records) {"
if src.count(ANCHOR) != 1:
    sys.exit(f"FAIL: expected 1 groupEventsByContact definition, found {src.count(ANCHOR)}")

HELPERS = '''var YLOPO_EVENT_OBJECT_KEY = "custom_objects.ylopo_event";
var YLOPO_CONTACT_ASSOC_ID = "%s";
function ylopoEventContactId(rec) {
  if (!rec) return null;
  var rels = rec.relations || rec.relation || null;
  if (Array.isArray(rels)) {
    for (var i = 0; i < rels.length; i++) {
      var r = rels[i];
      if (r && r.recordId && (r.objectKey === "contact" || r.objectKey === "contacts")) return r.recordId;
    }
    for (var j = 0; j < rels.length; j++) {
      var r2 = rels[j];
      if (r2 && r2.recordId && r2.associationId === YLOPO_CONTACT_ASSOC_ID) return r2.recordId;
    }
  }
  var associations = rec.associations || rec.relationships || {};
  if (associations.contact) {
    var c = associations.contact;
    if (typeof c === "string") return c;
    return (c && c.id) || (c && c[0] && c[0].id) || (c && c[0]) || null;
  }
  if (rec.contactId || rec.contact_id) return rec.contactId || rec.contact_id;
  var f = rec.fields || rec.properties || {};
  return f.contactId || f.contact_id || f.contact || null;
}
__name(ylopoEventContactId, "ylopoEventContactId");
async function scanYlopoEvents(env, opts) {
  var locId = env.GHL_LOCATION_ID || LOC_ID;
  var maxPages = (opts && opts.maxPages) || 500;
  var onRecord = opts && opts.onRecord;
  var searchAfter = null, pages = 0, scanned = 0, total = null, hitCap = false;
  while (true) {
    if (pages >= maxPages) { hitCap = true; break; }
    var body = { locationId: locId, pageLimit: 100 };
    if (searchAfter) body.searchAfter = searchAfter;
    var data = await ghlV2(env, "POST", "/objects/" + YLOPO_EVENT_OBJECT_KEY + "/records/search", body);
    var recs = data.records || data.data || [];
    if (total === null && typeof data.total === "number") total = data.total;
    pages++;
    for (var i = 0; i < recs.length; i++) { scanned++; if (onRecord) onRecord(recs[i]); }
    if (recs.length < 100) break;
    var last = recs[recs.length - 1];
    searchAfter = last && (last.searchAfter || last.sort);
    if (!searchAfter) break;
  }
  return { pages: pages, scanned: scanned, total: total, truncated: hitCap };
}
__name(scanYlopoEvents, "scanYlopoEvents");
async function aggregateYlopoActivity(env, maxPages) {
  var byContact = /* @__PURE__ */ Object.create(null);
  var typeHist = /* @__PURE__ */ Object.create(null);
  var withContact = 0, withoutContact = 0;
  var meta = await scanYlopoEvents(env, {
    maxPages: maxPages,
    onRecord: function (rec) {
      var p = rec.properties || rec.fields || {};
      var t = String(p.ylopo_event || "UNKNOWN");
      typeHist[t] = (typeHist[t] || 0) + 1;
      var cid = ylopoEventContactId(rec);
      if (!cid) { withoutContact++; return; }
      withContact++;
      var a = byContact[cid];
      if (!a) {
        a = byContact[cid] = {
          events: 0, types: {}, email: "", name: "", uuid: "",
          firstEventAt: "", lastEventAt: "",
          sumViews: 0, sumSaves: 0, maxViews: 0, maxSaves: 0,
          sumSessionSaves: 0, sumShowings: 0, sumVisits: 0, maxVisits: 0
        };
      }
      a.events++;
      a.types[t] = (a.types[t] || 0) + 1;
      if (!a.email && p.lead_email) a.email = String(p.lead_email);
      if (!a.name && p.name) a.name = String(p.name);
      if (!a.uuid && p.ylopo_uuid) a.uuid = String(p.ylopo_uuid);
      var at = rec.createdAt || "";
      if (at && (!a.lastEventAt || at > a.lastEventAt)) a.lastEventAt = at;
      if (at && (!a.firstEventAt || at < a.firstEventAt)) a.firstEventAt = at;
      var v = Number(p.views) || 0;
      var s = Number(p.saves) || 0;
      a.sumViews += v; a.sumSaves += s;
      if (v > a.maxViews) a.maxViews = v;
      if (s > a.maxSaves) a.maxSaves = s;
      a.sumSessionSaves += Number(p.last_session_listings_saved) || 0;
      a.sumShowings += Number(p.last_session_showing_requests) || 0;
      var tv = Number(p.last_session_total_visits) || 0;
      a.sumVisits += tv;
      if (tv > a.maxVisits) a.maxVisits = tv;
    }
  });
  return { meta: meta, byContact: byContact, typeHist: typeHist, withContact: withContact, withoutContact: withoutContact };
}
__name(aggregateYlopoActivity, "aggregateYlopoActivity");
''' % ASSOC_ID

src = src.replace(ANCHOR, HELPERS + ANCHOR, 1)

# ------------------------------------------------- 2. rewire groupEventsByContact
OLD_BODY = '''  const map = {};
  for (const rec of records) {
    const associations = rec.associations || rec.relationships || {};
    let contactId = null;
    if (associations.contact) {
      contactId = typeof associations.contact === "string" ? associations.contact : associations.contact?.id || associations.contact?.[0]?.id || associations.contact?.[0];
    }
    if (!contactId)
      contactId = rec.contactId || rec.contact_id;
    if (!contactId) {
      const fields = rec.fields || rec.properties || {};
      contactId = fields.contactId || fields.contact_id || fields.contact;
    }
    if (contactId) {'''
NEW_BODY = '''  const map = {};
  for (const rec of records) {
    const contactId = ylopoEventContactId(rec);
    if (contactId) {'''
if src.count(OLD_BODY) != 1:
    sys.exit(f"FAIL: groupEventsByContact body matched {src.count(OLD_BODY)} times, expected 1")
src = src.replace(OLD_BODY, NEW_BODY, 1)

# ---------------------------------------------------------------- 3. the route
ROUTE_ANCHOR = '''    if (method === "GET" && path === "/ylopo-events") {'''
if src.count(ROUTE_ANCHOR) != 1:
    sys.exit(f"FAIL: /ylopo-events route anchor matched {src.count(ROUTE_ANCHOR)} times")

NEW_ROUTE = '''    if (method === "GET" && path === "/ylopo-events/aggregate") {
      try {
        const aggMaxPages = Math.min(parseInt(url.searchParams.get("maxPages") || "500", 10) || 500, 900);
        const agg = await aggregateYlopoActivity(env, aggMaxPages);
        const ids = Object.keys(agg.byContact);
        const out = {
          ok: true,
          scanned: agg.meta.scanned,
          pages: agg.meta.pages,
          totalInGhl: agg.meta.total,
          truncated: agg.meta.truncated,
          eventsWithContact: agg.withContact,
          eventsWithoutContact: agg.withoutContact,
          uniqueContacts: ids.length,
          eventTypes: agg.typeHist
        };
        if (url.searchParams.get("full") === "1") out.byContact = agg.byContact;
        return json(out);
      } catch (e) {
        return err(`Ylopo aggregate failed: ${e.message || e.data || e.status}`, e.status || 500);
      }
    }
'''
src = src.replace(ROUTE_ANCHOR, NEW_ROUTE + ROUTE_ANCHOR, 1)

if src == orig:
    sys.exit("FAIL: no changes applied")

open(W, "w", encoding="utf-8").write(src)
print(f"OK: worker.js {len(orig)} -> {len(src)} bytes (+{len(src)-len(orig)})")
