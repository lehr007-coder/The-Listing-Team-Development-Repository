#!/usr/bin/env python3
"""
Let buyer readiness use the Ylopo saved-search enrichment.

The price (10 pts) and preference (5 pts) components were only earnable by
GHL-backed contacts, because min/max price and beds/baths lived on GHL custom
fields. The saved-search export now puts that data on the matrix record itself
for 3,892 of 3,988 leads, so those points become earnable - and a new email
engagement component (15 pts) uses signal we did not previously have at all.

Scores stay normalised against what each lead could actually earn, so leads
without enrichment are not marked down for missing it.

New factors flow into the existing factors[] array, so the UI renders them as
chips with no template change.
"""
import sys

W = "worker.js"
src = open(W, encoding="utf-8").read()
orig = src

# ------------------------------------------------------------ 1. enrich handle
OLD = '''  var ghlBacked = !opts || opts.ghlBacked !== false;'''
NEW = '''  var ghlBacked = !opts || opts.ghlBacked !== false;
  // Ylopo saved-search export (hub/18): price band, beds/baths and email
  // engagement for leads that have no GHL custom fields behind them.
  var en = (opts && opts.enrich) || {};
  var enrichAvailable = !!en.searchDataAvailable;'''
if src.count(OLD) != 1:
    sys.exit(f"FAIL: ghlBacked anchor matched {src.count(OLD)} times")
src = src.replace(OLD, NEW, 1)

# ------------------------------------------------------------------- 2. price
OLD_PRICE = '''  var pricePts = 0;
  if (ext.minPrice > 0 || ext.maxPrice > 0) { pricePts = 6; }
  if (ext.minPrice > 0 && ext.maxPrice > 0) { pricePts = 10; }
  if (pricePts > 0) {
    score += pricePts;
    var priceLabel = '';
    if (ext.minPrice && ext.maxPrice) priceLabel = fmtPrice(ext.minPrice) + '-' + fmtPrice(ext.maxPrice);
    else if (ext.maxPrice) priceLabel = 'up to ' + fmtPrice(ext.maxPrice);
    else priceLabel = fmtPrice(ext.minPrice) + '+';
    factors.push({ name: priceLabel, pts: pricePts, max: 10 });
  }'''
NEW_PRICE = '''  var pMin = ext.minPrice > 0 ? ext.minPrice : (Number(en.minPrice) || 0);
  var pMax = ext.maxPrice > 0 ? ext.maxPrice : (Number(en.maxPrice) || 0);
  var pricePts = 0;
  if (pMin > 0 || pMax > 0) { pricePts = 6; }
  if (pMin > 0 && pMax > 0) { pricePts = 10; }
  if (pricePts > 0) {
    score += pricePts;
    var priceLabel = '';
    if (pMin && pMax) priceLabel = fmtPrice(pMin) + '-' + fmtPrice(pMax);
    else if (pMax) priceLabel = 'up to ' + fmtPrice(pMax);
    else priceLabel = fmtPrice(pMin) + '+';
    factors.push({ name: priceLabel, pts: pricePts, max: 10 });
  }'''
if src.count(OLD_PRICE) != 1:
    sys.exit(f"FAIL: price block matched {src.count(OLD_PRICE)} times")
src = src.replace(OLD_PRICE, NEW_PRICE, 1)

# ------------------------------------------------------------------- 3. prefs
OLD_PREF = '''  var prefPts = 0;
  if (ext.beds) prefPts += 2;
  if (ext.baths) prefPts += 2;
  if (ext.propType) prefPts += 1;
  prefPts = Math.min(prefPts, 5);
  if (prefPts > 0) {
    score += prefPts;
    factors.push({ name: (ext.beds || '?') + 'bd/' + (ext.baths || '?') + 'ba', pts: prefPts, max: 5 });
  }'''
NEW_PREF = '''  var bBeds = ext.beds || Number(en.beds) || 0;
  var bBaths = ext.baths || Number(en.baths) || 0;
  var prefPts = 0;
  if (bBeds) prefPts += 2;
  if (bBaths) prefPts += 2;
  if (ext.propType || (en.cities && en.cities.length)) prefPts += 1;
  prefPts = Math.min(prefPts, 5);
  if (prefPts > 0) {
    score += prefPts;
    factors.push({ name: (bBeds || '?') + 'bd/' + (bBaths || '?') + 'ba', pts: prefPts, max: 5 });
  }

  // Email engagement (0-15). Ylopo saved-search export. Clicks are weighted
  // hardest because they correlate +0.389 with measured view counts, against
  // +0.144 for opens and +0.107 for saved-search count (hub/18). This is a
  // proxy for intent, not a measurement of browsing - label it as engagement.
  var engPts = 0;
  if (enrichAvailable) {
    engPts = Math.min(Math.round((Number(en.engagementScore) || 0) * 0.15), 15);
    if (engPts > 0) {
      score += engPts;
      var engBits = [];
      if (Number(en.emailClicked) > 0) engBits.push(en.emailClicked + ' clicks');
      else if (Number(en.emailOpened) > 0) engBits.push(en.emailOpened + ' opens');
      if (Number(en.activeAlerts) > 0) engBits.push(en.activeAlerts + ' alerts');
      if (!engBits.length && Number(en.savedSearches) > 0) engBits.push(en.savedSearches + ' searches');
      factors.push({ name: engBits.join(', ') || 'Email engagement', pts: engPts, max: 15 });
    }
  }'''
if src.count(OLD_PREF) != 1:
    sys.exit(f"FAIL: prefs block matched {src.count(OLD_PREF)} times")
src = src.replace(OLD_PREF, NEW_PREF, 1)

# ------------------------------------------------------------- 4. maxPossible
OLD_MAX = '''  var maxPossible = actMax + 15 /* completeness */ + 15 /* source */ + 10 /* tags */;
  if (ghlBacked) maxPossible += 25 /* recency */ + 10 /* price */ + 5 /* prefs */;'''
NEW_MAX = '''  var maxPossible = actMax + 15 /* completeness */ + 15 /* source */ + 10 /* tags */;
  if (ghlBacked) maxPossible += 25 /* recency */;
  // Price and preferences are earnable by anyone who has either GHL custom
  // fields or saved-search enrichment behind them. Leads with neither are still
  // not marked down for it.
  if (ghlBacked || enrichAvailable) maxPossible += 10 /* price */ + 5 /* prefs */;
  if (enrichAvailable) maxPossible += 15 /* engagement */;'''
if src.count(OLD_MAX) != 1:
    sys.exit(f"FAIL: maxPossible matched {src.count(OLD_MAX)} times")
src = src.replace(OLD_MAX, NEW_MAX, 1)

# -------------------------------------------------------------- 5. call site
OLD_CALL = "var rd = calcBuyerReadiness(subject, ext, m, { ghlBacked: !!raw });"
NEW_CALL = "var rd = calcBuyerReadiness(subject, ext, m, { ghlBacked: !!raw, enrich: r });"
if src.count(OLD_CALL) != 1:
    sys.exit(f"FAIL: call site matched {src.count(OLD_CALL)} times")
src = src.replace(OLD_CALL, NEW_CALL, 1)

if src == orig:
    sys.exit("FAIL: no changes applied")
open(W, "w", encoding="utf-8").write(src)
print(f"OK: worker.js {len(orig)} -> {len(src)} bytes (+{len(src)-len(orig)})")
