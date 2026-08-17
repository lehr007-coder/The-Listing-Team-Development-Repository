// Verify the saved-search enrichment reaches Buyer Intel readiness scoring.
// Drives the real staging page so we measure what an agent actually sees.
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'https://thelistingteamproxy-staging.lehr007.workers.dev/dashboard/ylopo-contacts';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(URL + '?cb=' + Date.now(), { waitUntil: 'networkidle2', timeout: 90000 });

  // The matrix only loads when Buyer Intel is opened. Trigger it explicitly so
  // we measure the enriched path rather than the GHL fallback.
  await page.evaluate(() => {
    if (typeof ensureMatrix === 'function') ensureMatrix(function () {});
  });
  await page.waitForFunction(
    () => typeof MATRIX_STATE !== 'undefined' && (MATRIX_STATE === 'ready' || MATRIX_STATE === 'empty'),
    { timeout: 120000 }
  ).catch(() => {});

  const out = await page.evaluate(() => {
    if (typeof getBuyerLeads !== 'function') return { error: 'getBuyerLeads not in scope' };
    const b = getBuyerLeads();
    const scores = b.map(x => x.readiness || (x.rd && x.rd.score) || 0).filter(n => typeof n === 'number');
    const withEng = b.filter(x => (x.rdFactors || x.factors || []).some(f => /click|open|alert|search/i.test(f.name || '')));
    const withPrice = b.filter(x => (x.rdFactors || x.factors || []).some(f => /^\$|up to \$/.test(f.name || '')));
    const sample = b.slice(0, 3).map(x => ({
      name: x.name,
      score: x.readiness || (x.rd && x.rd.score),
      priced: !!x.maxPrice,
      factors: (x.rdFactors || []).map(f => f.name + ' ' + f.pts + '/' + f.max)
    }));
    scores.sort((a, b2) => b2 - a);
    return {
      total: b.length,
      matrixState: typeof MATRIX_STATE !== 'undefined' ? MATRIX_STATE : 'n/a',
      maxScore: scores[0] || 0,
      over60: scores.filter(s => s >= 60).length,
      over40: scores.filter(s => s >= 40).length,
      median: scores[Math.floor(scores.length / 2)] || 0,
      withEngagementFactor: withEng.length,
      withPriceFactor: withPrice.length,
      sample
    };
  });

  out.pageErrors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
