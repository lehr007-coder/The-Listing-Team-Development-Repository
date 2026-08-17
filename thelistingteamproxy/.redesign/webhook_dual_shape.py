#!/usr/bin/env python3
"""
Read BOTH Ylopo session payload shapes in the webhook.

Ylopo sends session metrics under two different contracts (hub/17):

  REGISTRATION            lead.lastSessionListingsViewed, lastSessionListingsSaved,
                          lastSessionSearches, lastSessionShowingInfoRequests,
                          lastSessionTotalVisits, lastSessionAvgPrice
  VIEW_LISTING_DETAIL,    session.viewsCount, savesCount, searchCount,
  SHOWING_REQUEST,        showingRequests, totalVisits, avgPrice
  PRIORITY_LEAD_EVENT

The handler only read the second shape. The lead.lastSession* fields arrive on
14,665 events - currently all zero - and were being dropped on the floor. The
moment Ylopo populates them the handler would still have written zeros, and the
failure would have looked like Ylopo's fault rather than ours.

This makes the handler read whichever shape is present, preferring a non-zero
value from either. It changes nothing while the upstream values are zero, and
starts working by itself the day they are not.
"""
import sys

W = "worker.js"
src = open(W, encoding="utf-8").read()
orig = src

OLD = '''              // Session metrics as plain numbers
              views: String(Number(session.viewsCount || session.listingsViewed) || 0),
              saves: String(Number(session.savesCount || session.listingsSaved) || 0),
              searches: String(Number(session.searchCount || session.searches) || 0),
              showingRequests: String(Number(session.showingRequests) || 0),
              avgPrice: String(Number(session.avgPrice || payload.avgPrice) || 0),
              totalVisits: String(Number(session.totalVisits) || 0),'''

NEW = '''              // Session metrics as plain numbers. Ylopo uses two different
              // shapes: session.* on VIEW_LISTING_DETAIL / SHOWING_REQUEST /
              // PRIORITY_LEAD_EVENT, and lead.lastSession* on REGISTRATION.
              // Read both - pickNum takes the first non-zero it finds - so
              // whichever contract an event uses, the value lands. See hub/17.
              views: String(pickNum(session.viewsCount, session.listingsViewed, lead.lastSessionListingsViewed)),
              saves: String(pickNum(session.savesCount, session.listingsSaved, lead.lastSessionListingsSaved)),
              searches: String(pickNum(session.searchCount, session.searches, lead.lastSessionSearches)),
              showingRequests: String(pickNum(session.showingRequests, lead.lastSessionShowingInfoRequests)),
              avgPrice: String(pickNum(session.avgPrice, payload.avgPrice, lead.lastSessionAvgPrice)),
              totalVisits: String(pickNum(session.totalVisits, lead.lastSessionTotalVisits)),
              lastVisitDate: String(session.lastVisitDate || lead.lastSessionLastVisitDate || ""),
              browsingHistoryLink: String(lead.viewBrowsingHistoryLink || ""),'''

if src.count(OLD) != 1:
    sys.exit(f"FAIL: webhook session block matched {src.count(OLD)} times")
src = src.replace(OLD, NEW, 1)

# pickNum helper, defined next to the webhook's other helpers.
ANCHOR = "async function ghlV2(env, method, path, body = null) {"
if src.count(ANCHOR) != 1:
    sys.exit("FAIL: ghlV2 anchor not unique")
HELPER = '''function pickNum() {
  for (var i = 0; i < arguments.length; i++) {
    var n = Number(arguments[i]);
    if (!isNaN(n) && n !== 0) return n;
  }
  return 0;
}
__name(pickNum, "pickNum");
'''
src = src.replace(ANCHOR, HELPER + ANCHOR, 1)

if src == orig:
    sys.exit("FAIL: no changes applied")
open(W, "w", encoding="utf-8").write(src)
print(f"OK: worker.js {len(orig)} -> {len(src)} bytes (+{len(src)-len(orig)})")
