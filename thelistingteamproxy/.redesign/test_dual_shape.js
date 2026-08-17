// Unit-test the dual-shape session mapping against real payload samples taken
// from the live GHL ylopo_event object. No network, no GHL writes.
function pickNum() {
  for (var i = 0; i < arguments.length; i++) {
    var n = Number(arguments[i]);
    if (!isNaN(n) && n !== 0) return n;
  }
  return 0;
}
function map(payload) {
  const lead = payload.lead || payload.contact || {};
  const session = payload.session || payload.additionalData || {};
  return {
    views: String(pickNum(session.viewsCount, session.listingsViewed, lead.lastSessionListingsViewed)),
    saves: String(pickNum(session.savesCount, session.listingsSaved, lead.lastSessionListingsSaved)),
    searches: String(pickNum(session.searchCount, session.searches, lead.lastSessionSearches)),
    showingRequests: String(pickNum(session.showingRequests, lead.lastSessionShowingInfoRequests)),
    totalVisits: String(pickNum(session.totalVisits, lead.lastSessionTotalVisits))
  };
}

const cases = [
  { name: 'REGISTRATION shape, populated (what we need to work)',
    payload: { eventType: 'REGISTRATION', lead: { email: 'a@b.com',
      lastSessionListingsViewed: 22, lastSessionListingsSaved: 8,
      lastSessionSearches: 11, lastSessionShowingInfoRequests: 2,
      lastSessionTotalVisits: 40 } },
    expect: { views: '22', saves: '8', searches: '11', showingRequests: '2', totalVisits: '40' } },

  { name: 'REGISTRATION shape, zeros (what Ylopo sends today)',
    payload: { eventType: 'REGISTRATION', lead: { email: 'a@b.com',
      lastSessionListingsViewed: 0, lastSessionListingsSaved: 0,
      lastSessionSearches: 0, lastSessionShowingInfoRequests: 0,
      lastSessionTotalVisits: 0 } },
    expect: { views: '0', saves: '0', searches: '0', showingRequests: '0', totalVisits: '0' } },

  { name: 'session.* shape (VIEW_LISTING_DETAIL / SHOWING_REQUEST) still works',
    payload: { eventType: 'SHOWING_REQUEST', lead: { email: 'a@b.com' },
      session: { viewsCount: 30, savesCount: 12, searchCount: 15,
                 showingRequests: 2, totalVisits: 40 } },
    expect: { views: '30', saves: '12', searches: '15', showingRequests: '2', totalVisits: '40' } },

  { name: 'both shapes present, non-zero wins over zero',
    payload: { eventType: 'REGISTRATION',
      lead: { lastSessionListingsViewed: 17 },
      session: { viewsCount: 0 } },
    expect: { views: '17', saves: '0', searches: '0', showingRequests: '0', totalVisits: '0' } },

  { name: 'missing everything degrades to zeros, no crash',
    payload: { eventType: 'TAG' },
    expect: { views: '0', saves: '0', searches: '0', showingRequests: '0', totalVisits: '0' } },

  { name: 'string numerics from Ylopo are coerced',
    payload: { lead: { lastSessionListingsViewed: '9', lastSessionListingsSaved: '3' } },
    expect: { views: '9', saves: '3', searches: '0', showingRequests: '0', totalVisits: '0' } }
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = map(c.payload);
  const ok = Object.keys(c.expect).every(k => got[k] === c.expect[k]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!ok) { console.log('   expected', c.expect); console.log('   got     ', got); fail++; }
  else pass++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
