const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://thelistingteamproxy-staging.lehr007.workers.dev';

function lum(r, g, b) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function parse(c) {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}
function over(fg, bg) { // composite fg (may be translucent) onto bg
  if (!fg) return bg;
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function cr(a, b) {
  const la = lum(a.r, a.g, a.b), lb = lum(b.r, b.g, b.b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

(async () => {
  const mode = process.argv[2] || 'light';
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1512, height: 950 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  await page.evaluateOnNewDocument(m => {
    try { localStorage.setItem('tlt-theme', m); localStorage.setItem('tlt-contacts-theme', m); } catch (e) {}
  }, mode);

  await page.goto(BASE + '/dashboard/ylopo-contacts?v=' + Math.random(),
    { waitUntil: 'networkidle2', timeout: 90000 });
  // Wait for real data rather than a fixed sleep: getBuyerLeads() returns 0
  // for the first few seconds and the renderer then paints its empty state.
  await page.waitForFunction(
    () => typeof getBuyerLeads === 'function' && getBuyerLeads().length > 0,
    { timeout: 60000, polling: 500 });

  const report = await page.evaluate(() => {
    // Render and measure in ONE pass: the page runs a periodic refresh that
    // resets the non-active view containers to their loading state, so a
    // render in a previous evaluate is gone by the time we query it.
    if (typeof renderBuyerTab === 'function') renderBuyerTab();
    const out = { view: null, panels: 0, statCards: 0, chips: [], gauge: null, overflow: null, transparent: [] };
    const bp = document.getElementById('buyerTabContent');
    out.view = bp ? 'rendered ' + bp.innerHTML.length + ' chars' : 'missing';
    const scope = bp || document;
    out.panels = scope.querySelectorAll('.panel').length;
    out.statCards = scope.querySelectorAll('.stat-card').length;
    out.overflow = document.documentElement.scrollWidth > window.innerWidth + 2;

    // every chip-like span with its own background
    scope.querySelectorAll('span[style*="border-radius"]').forEach(el => {
      const cs = getComputedStyle(el);
      if (!el.textContent.trim()) return;
      out.chips.push({ t: el.textContent.trim().slice(0, 14), bg: cs.backgroundColor, fg: cs.color });
    });
    // gauge number
    const svg = scope.querySelector('svg circle[style*="stroke"]');
    if (svg) out.gauge = { stroke: getComputedStyle(svg).stroke };
    // anything that resolved to fully transparent background but has inline background set
    scope.querySelectorAll('[style*="background"]').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && /background:[^;]*var\(/.test(el.getAttribute('style') || '')) {
        out.transparent.push((el.getAttribute('style') || '').slice(0, 70));
      }
    });
    const card = scope.querySelector('.panel');
    out.cardBg = card ? getComputedStyle(card).backgroundColor : null;
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    return out;
  });

  const bg = parse(report.cardBg || report.bodyBg) || { r: 255, g: 255, b: 255, a: 1 };
  console.log('=== ' + mode.toUpperCase() + ' ===');
  console.log('buyer view display :', report.view);
  console.log('panels / stat-cards:', report.panels, '/', report.statCards);
  console.log('card bg / body bg  :', report.cardBg, '/', report.bodyBg);
  console.log('gauge stroke       :', report.gauge && report.gauge.stroke);
  console.log('h-overflow         :', report.overflow);
  console.log('transparent bgs    :', report.transparent.length, report.transparent.slice(0, 3));
  console.log('js errors          :', errs.length, errs.slice(0, 3));
  console.log('--- chip contrast (label vs its own composited background) ---');
  let fails = 0;
  const seen = new Set();
  report.chips.forEach(c => {
    const key = c.bg + '|' + c.fg;
    if (seen.has(key)) return;
    seen.add(key);
    const chipBg = over(parse(c.bg), bg);
    const ratio = cr(over(parse(c.fg), chipBg), chipBg);
    const ok = ratio >= 4.5;
    if (!ok) fails++;
    console.log('  %s "%s" %s on %s  = %s:1', ok ? 'PASS' : 'FAIL',
      c.t.padEnd(14), c.fg.padEnd(22), c.bg.padEnd(24), ratio.toFixed(2));
  });
  console.log('distinct chip styles:', seen.size, ' failing:', fails);
  await page.screenshot({ path: '/tmp/cdp/buyer-' + mode + '.png' });
  await browser.close();
})();
