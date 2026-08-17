// Generic contrast scanner: every visible text node on a page, measured
// against its own composited background, in one theme.
const puppeteer = require('puppeteer-core');
// CHROME_PATH lets CI point at its own Chromium; the default is the Mac install.
const CHROME = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'https://thelistingteamproxy-staging.lehr007.workers.dev';

const PAGES = {
  hub: '/dashboard',
  priority: '/dashboard/priority-leads',
  contacts: '/dashboard/ylopo-contacts',
  analytics: '/dashboard/ylopo-analytics',
  pipeline: '/dashboard/pipeline',
};

const IN_PAGE = () => {
  const px = c => {
    const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const onto = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  // composite every translucent background from the element up to an opaque one
  const bgOf = el => {
    const stack = [];
    let n = el, gradient = false;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') gradient = true;
      const c = px(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a === 1) break;
      }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = onto(stack[i], base);
    return { bg: base, gradient };
  };

  const groups = new Map();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walk.nextNode())) {
    const text = node.nodeValue.trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const fg0 = px(cs.color);
    if (!fg0) continue;
    const { bg, gradient } = bgOf(el);
    const fg = onto(fg0, bg);
    const size = parseFloat(cs.fontSize);
    const weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const r = ratio(fg, bg);
    if (r >= need) continue;

    const key = [cs.color, Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b),
      Math.round(size), weight, gradient].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        fg: cs.color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
        size: Math.round(size * 10) / 10, weight, need, ratio: Math.round(r * 100) / 100,
        gradient, n: 0, sample: text.slice(0, 34), cls: (el.className || '').toString().slice(0, 40),
      });
    }
    groups.get(key).n++;
  }
  return [...groups.values()].sort((a, b) => a.ratio - b.ratio);
};

(async () => {
  const [pageName, mode] = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1512, height: 950 });
  await page.evaluateOnNewDocument(m => {
    try { localStorage.setItem('tlt-theme', m); localStorage.setItem('tlt-contacts-theme', m); } catch (e) {}
  }, mode);
  await page.goto(BASE + PAGES[pageName] + '?v=' + Math.random(),
    { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 9000));

  const rows = await page.evaluate(IN_PAGE);
  const solid = rows.filter(r => !r.gradient);
  const grad = rows.filter(r => r.gradient);
  console.log('=== %s / %s === %d failing style groups (%d over a gradient, reported separately)',
    pageName, mode, solid.length, grad.length);
  solid.slice(0, 14).forEach(r => {
    console.log('  %s:1 (need %s)  %spx/%s  fg %s on %s  x%d  "%s" %s',
      String(r.ratio).padEnd(5), r.need, String(r.size).padEnd(4), r.weight,
      r.fg.padEnd(21), r.bg.padEnd(17), r.n, r.sample, r.cls);
  });
  if (solid.length > 14) console.log('  ... and %d more groups', solid.length - 14);
  await browser.close();
})();
