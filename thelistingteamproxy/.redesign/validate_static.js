#!/usr/bin/env node
// Static pre-deploy gate. No browser, no network, no staging deploy needed --
// so this can run on every push, unlike scan.js / grad.js / audit.js, which
// measure a rendered page and need a deploy to exist first.
//
// It encodes the failure modes that have actually shipped in this repo:
//
//  1. Syntax. Every worker.js must parse. These files are patched by scripts;
//     a bad splice is the single most likely way to break a deploy.
//
//  2. Hex-alpha corruption (doc 10, failure mode 6). Several sites derive a
//     tint by appending to a colour: prColor + '22'. Put a token there and you
//     get var(--red)22 -- invalid CSS that fails SILENTLY TO TRANSPARENT. No
//     error, no warning, just an element that vanishes. Nothing else catches
//     this, which is why it is the centrepiece of this gate.
//
//  3. The chart-palette relief rule (doc 11). Slots 3/4/5 measure 2.82, 2.17
//     and 2.69 against white -- below 3:1. They are only legal in a chart that
//     prints its values beside the segments. If someone removes the printed
//     count, the palette silently becomes non-compliant.
//
//  4. Template-literal safety. The dashboards live inside `...` templates. A
//     bare backtick introduced by a patch script terminates the template and
//     usually still parses, producing garbled HTML rather than an error.
//
// Exit 0 = clean. Exit 1 = at least one FAIL. Warnings never fail the build.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const warns = [];
const ok = [];

const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const pass = (m) => ok.push(m);

// Every worker.js in the repo, excluding dependency and scratch trees.
const workers = [];
(function walk(dir, depth) {
  if (depth > 3) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (e.name === 'worker.js') workers.push(p);
  }
})(ROOT, 0);

if (workers.length === 0) fail('no worker.js found anywhere under ' + ROOT);

for (const w of workers) {
  const rel = path.relative(ROOT, w);
  const src = fs.readFileSync(w, 'utf8');

  // ---- 1. syntax --------------------------------------------------------
  try {
    execFileSync(process.execPath, ['--check', w], { stdio: 'pipe' });
    pass(`${rel}: parses`);
  } catch (e) {
    fail(`${rel}: SYNTAX ERROR\n    ${String(e.stderr || e).split('\n').slice(0, 3).join('\n    ')}`);
    continue; // everything below assumes a parseable file
  }

  // ---- 2. hex-alpha corruption -----------------------------------------
  // var(--anything) immediately followed by 2-8 hex digits, or concatenated
  // with a short hex string in JS.
  const inline = [...src.matchAll(/var\(--[a-z0-9-]+\)[0-9a-fA-F]{2,8}\b/g)].map((m) => m[0]);
  const concat = [...src.matchAll(/var\(--[a-z0-9-]+\)['"]\s*\+\s*['"][0-9a-fA-F]{2}['"]/g)].map((m) => m[0]);
  const bad = [...new Set([...inline, ...concat])];
  if (bad.length) {
    fail(`${rel}: ${bad.length} hex-alpha corruption site(s) -- these fail silently to transparent:\n    ` +
         bad.slice(0, 8).join('\n    '));
  } else {
    pass(`${rel}: no var(--token)NN corruption`);
  }

  // ---- 3. chart-palette relief rule ------------------------------------
  if (src.includes('--chart-1-light')) {
    const light = /--chart-3-light:\s*#1baf7a/.test(src) &&
                  /--chart-4-light:\s*#eda100/.test(src) &&
                  /--chart-5-light:\s*#e87ba4/.test(src);
    if (!light) {
      warn(`${rel}: chart slots 3/4/5 differ from the doc-11 validated values -- ` +
           `re-run validate_palette.js against #FFFFFF and #14202C`);
    }
    // Any chart array using a low-contrast slot must print its count.
    const lowSlotUsers = [...src.matchAll(/var\(--chart-[345]\)/g)];
    if (lowSlotUsers.length) {
      // Look for the printed-value markup in the same render block.
      const printsValues = /\+ b\.count \+|\+ seg\.count \+|\+ b\.val \+/.test(src);
      if (!printsValues) {
        fail(`${rel}: uses low-contrast chart slots 3/4/5 (below 3:1 on white) but ` +
             `no printed value found beside the segments -- the doc-11 relief rule is unmet`);
      } else {
        pass(`${rel}: relief rule satisfied for low-contrast slots`);
      }
    }
    // Slots must not be reused as status tones.
    if (/status[A-Za-z]*\s*[:=][^;\n]*var\(--chart-/.test(src)) {
      fail(`${rel}: a chart slot is being used as a status colour -- doc 11 reserves those`);
    }
  }

  // ---- 4. template-literal safety --------------------------------------
  // Count backticks; an odd number means one was introduced or lost.
  const ticks = (src.match(/`/g) || []).length;
  if (ticks % 2 !== 0) {
    fail(`${rel}: odd backtick count (${ticks}) -- a template literal is unbalanced`);
  }
}

// ---- report -------------------------------------------------------------
const line = '-'.repeat(64);
console.log(line);
console.log(`static pre-deploy gate -- ${workers.length} worker(s) checked`);
console.log(line);
for (const m of ok) console.log('  PASS  ' + m);
for (const m of warns) console.log('  WARN  ' + m);
for (const m of fails) console.log('  FAIL  ' + m);
console.log(line);
console.log(`${ok.length} passed, ${warns.length} warning(s), ${fails.length} failure(s)`);

if (fails.length) {
  console.log('\nBlocking the deploy. Each failure above is a defect that does not');
  console.log('throw at runtime -- it renders wrong, silently. Fix, do not bypass.');
  process.exit(1);
}
