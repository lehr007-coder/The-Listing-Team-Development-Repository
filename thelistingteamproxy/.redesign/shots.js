// Render every dashboard in both themes and build a side-by-side review sheet.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://thelistingteamproxy-staging.lehr007.workers.dev';
const OUT = '/tmp/review';

const PAGES = [
  ['hub', '/dashboard', 'Command Center'],
  ['priority', '/dashboard/priority-leads', 'Priority Leads'],
  ['contacts', '/dashboard/ylopo-contacts', 'Ylopo Contacts'],
  ['analytics', '/dashboard/ylopo-analytics', 'Ylopo Analytics'],
  ['pipeline', '/dashboard/pipeline', 'Pipeline'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
  });
  for (const [key, path, label] of PAGES) {
    for (const mode of ['light', 'dark']) {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await p.evaluateOnNewDocument(m => {
        try {
          localStorage.setItem('tlt-theme', m);
          localStorage.setItem('tlt-contacts-theme', m);
          localStorage.setItem('v5_dark_mode', m === 'dark' ? '1' : '0');
        } catch (e) {}
      }, mode);
      try {
        await p.goto(BASE + path + '?v=' + Math.random(), { waitUntil: 'networkidle2', timeout: 90000 });
      } catch (e) { console.log('  goto slow: ' + key + '/' + mode); }
      // Wait for the page to be POPULATED, not for a fixed delay. A fixed
      // 11s caught Priority Leads mid-spinner (551 chars, 6 elements).
      try {
        await p.waitForFunction(() => {
          const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
          if (t.length < 1200) return false;
          if (/loading|please wait/i.test(t.slice(0, 700))) return false;
          return document.querySelectorAll('tr,.table-row,.card,.panel,.stat-card').length >= 8;
        }, { timeout: 75000, polling: 1000 });
      } catch (e) {
        console.log('  !! ' + key + '/' + mode + ' never finished loading - screenshot may be a spinner');
      }
      await new Promise(r => setTimeout(r, 3500));   // settle charts/animation
      const file = `${OUT}/${key}-${mode}.png`;
      await p.screenshot({ path: file });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`  ${label.padEnd(16)} ${mode.padEnd(5)} -> ${kb}KB`);
      await ctx.close();
    }
  }
  await browser.close();

  // review sheet: light and dark side by side, one row per dashboard
  const rows = PAGES.map(([key, path, label]) => `
  <section>
    <h2>${label} <a href="${BASE}${path}" target="_blank">open staging &rarr;</a></h2>
    <div class="pair">
      <figure><figcaption>LIGHT (default)</figcaption><img src="${key}-light.png"></figure>
      <figure><figcaption>DARK</figcaption><img src="${key}-dark.png"></figure>
    </div>
  </section>`).join('\n');

  fs.writeFileSync(`${OUT}/index.html`, `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Design system review — staging</title><style>
 body{margin:0;padding:32px;background:#F1F5F8;color:#10222E;
      font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
 h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
 .sub{color:#4E6879;margin:0 0 28px}
 .sub code{background:#E3EAF0;padding:2px 6px;border-radius:5px}
 section{margin:0 0 34px;background:#fff;border:1px solid #E3EAF0;
         border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(16,34,46,.08)}
 h2{font-size:15px;margin:0 0 12px;display:flex;gap:12px;align-items:baseline}
 h2 a{font-size:12px;font-weight:500;color:#1A6B89}
 .pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
 figcaption{font-size:11px;font-weight:700;letter-spacing:.08em;
            color:#4E6879;margin-bottom:6px}
 figure{margin:0}
 img{width:100%;border:1px solid #E3EAF0;border-radius:8px;display:block}
</style></head><body>
<h1>Design system &mdash; staging review</h1>
<p class="sub">All five dashboards, light and dark. Staging only &mdash; production is untouched.
Contrast is verified (0 failing groups, both scanners); <strong>what needs your eye is layout,
hierarchy and whether the teal feels right</strong>.</p>
${rows}
</body></html>`);
  console.log('\nreview sheet: ' + OUT + '/index.html');
})();
