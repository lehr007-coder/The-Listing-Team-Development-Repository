// Gradient-aware contrast check: for text sitting on a gradient, test the
// label against EVERY colour stop in that gradient and keep the worst.
// Conservative and deterministic - no pixel sampling needed.
const puppeteer = require('puppeteer-core');
// CHROME_PATH lets CI point at its own Chromium; the default is the Mac install.
const CHROME = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'https://thelistingteamproxy-staging.lehr007.workers.dev';
const PAGES = {
  hub: '/dashboard', priority: '/dashboard/priority-leads',
  contacts: '/dashboard/ylopo-contacts', analytics: '/dashboard/ylopo-analytics',
  pipeline: '/dashboard/pipeline',
};

const IN_PAGE = () => {
  const px = c => {
    const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const hex = h => {
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    if (s.length !== 6) return null;
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a: 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const onto = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

  // all colour stops mentioned in a background-image value
  const stopsOf = img => {
    const out = [];
    (img.match(/rgba?\([^)]*\)/g) || []).forEach(s => { const c = px(s); if (c) out.push(c); });
    (img.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(s => { const c = hex(s.slice(0, 7)); if (c) out.push(c); });
    return out;
  };

  // nearest ancestor gradient + the solid colour underneath it
  const backdrop = (el, clipsText) => {
    let n = el, stops = null;
    let skipOwnBg = !!clipsText;   // a clipped gradient is not a backdrop
    const layers = [];
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (!stops && cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) {
        stops = stopsOf(cs.backgroundImage);
      }
      const c = px(cs.backgroundColor);
      if (!skipOwnBg && c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
      skipOwnBg = false;
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = onto(layers[i], base);
    return { stops, base };
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
    const r0 = el.getBoundingClientRect();
    if (r0.width < 2 || r0.height < 2) continue;
    const clipsText = /text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '');
    const { stops, base } = backdrop(el, clipsText);
    if (!stops || !stops.length) continue;          // gradients only

    // -webkit-background-clip:text means the gradient IS the glyphs, not the
    // backdrop: test each stop AS the text colour against the real background.
    const fg0 = clipsText ? null : px(cs.color);
    if (!clipsText && !fg0) continue;
    const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3.0 : 4.5;

    let worst = Infinity, worstStop = null;
    stops.forEach(s => {
      let r, ref;
      if (clipsText) { ref = base; r = ratio(onto(s, base), base); }
      else { ref = onto(s, base); r = ratio(onto(fg0, ref), ref); }
      if (r < worst) { worst = r; worstStop = ref; }
    });
    if (worst >= need) continue;
    const key = cs.color + '|' + JSON.stringify(worstStop) + '|' + Math.round(size) + '|' + weight;
    if (!groups.has(key)) {
      groups.set(key, {
        fg: cs.color, worstStop: 'rgb(' + [worstStop.r, worstStop.g, worstStop.b].map(Math.round).join(',') + ')',
        size: Math.round(size * 10) / 10, weight, need, ratio: Math.round(worst * 100) / 100,
        n: 0, sample: text.slice(0, 30), cls: (el.className || '').toString().slice(0, 34),
      });
    }
    groups.get(key).n++;
  }
  return [...groups.values()].sort((a, b) => a.ratio - b.ratio);
};

(async () => {
  const [pageName, mode] = process.argv.slice(2);
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1512, height: 950 });
  await p.evaluateOnNewDocument(m => { try { localStorage.setItem('tlt-theme', m); localStorage.setItem('tlt-contacts-theme', m); } catch (e) {} }, mode);
  await p.goto(BASE + PAGES[pageName] + '?v=' + Math.random(), { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 9000));
  const rows = await p.evaluate(IN_PAGE);
  console.log('=== %s / %s === %d failing gradient groups (worst stop)', pageName, mode, rows.length);
  rows.slice(0, 10).forEach(r => console.log('  %s:1 (need %s) %spx/%s  %s on %s  x%d  "%s" %s',
    String(r.ratio).padEnd(5), r.need, String(r.size).padEnd(4), r.weight,
    r.fg.padEnd(21), r.worstStop.padEnd(17), r.n, r.sample, r.cls));
  await b.close();
})();
