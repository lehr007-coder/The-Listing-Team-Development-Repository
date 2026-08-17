#!/usr/bin/env python3
"""Apply the hub/11 validated 8-slot categorical chart palette.

Scope (deliberately narrow -- see hub/11):
  1. Define --chart-1..8 tokens (light + dark) in the Contacts CSS block.
  2. Repoint the buyer Price Range Interest bands onto slots 1..7, in fixed
     array order (never cycled, colour follows the entity not its rank).

Explicitly NOT touched:
  - Readiness / motivation distributions: ordinal STATUS scales. hub/11 says
    "status colours stay reserved"; recolouring them destroys hot->cold meaning.
  - Seller tag catBars: 11 categories > 8 slots. hub/11 forbids cycling; the
    fold-to-Other decision is a product call, not a refactor.
  - Any hex-alpha concat site (prColor + '22'). Asserted absent below.

Idempotent: aborts if already applied.
"""
import re
import sys

PATH = 'worker.js'

src = open(PATH, encoding='utf-8').read()
orig = src

if '--chart-1-light' in src:
    sys.exit('ABORT: palette already applied (--chart-1-light present)')

# ---------------------------------------------------------------- 1. tokens
ANCHOR = ("    --beh-stale-bg:rgba(220,38,38,0.15);       "
          "--beh-stale-color:#64748B;\n  }\n")
if src.count(ANCHOR) != 1:
    sys.exit('ABORT: token anchor not found exactly once (%d)' % src.count(ANCHOR))

TOKENS = """
  /* ---------- Chart categorical palette (hub/11) -------------------------
     Validated against our surfaces: light card #FFFFFF, dark card #14202C.
     Light: CVD separation PASS (worst adjacent dE 9.1); slots 3/4/5 sit below
     3:1 on white -- the relief rule applies, they are only legal where the
     value is printed beside the segment. Dark: all six checks PASS.
     Assign in fixed slot order. Never cycle. Never reuse as a status tone. */
  :root {
    --chart-1-light:#2a78d6; --chart-1-dark:#3987e5;  /* blue    */
    --chart-2-light:#eb6834; --chart-2-dark:#d95926;  /* orange  */
    --chart-3-light:#1baf7a; --chart-3-dark:#199e70;  /* aqua    */
    --chart-4-light:#eda100; --chart-4-dark:#c98500;  /* yellow  */
    --chart-5-light:#e87ba4; --chart-5-dark:#d55181;  /* magenta */
    --chart-6-light:#008300; --chart-6-dark:#008300;  /* green   */
    --chart-7-light:#4a3aa7; --chart-7-dark:#9085e9;  /* violet  */
    --chart-8-light:#e34948; --chart-8-dark:#e66767;  /* red     */
  }
  body.light-mode {
    --chart-1:var(--chart-1-light); --chart-2:var(--chart-2-light);
    --chart-3:var(--chart-3-light); --chart-4:var(--chart-4-light);
    --chart-5:var(--chart-5-light); --chart-6:var(--chart-6-light);
    --chart-7:var(--chart-7-light); --chart-8:var(--chart-8-light);
  }
  body:not(.light-mode) {
    --chart-1:var(--chart-1-dark); --chart-2:var(--chart-2-dark);
    --chart-3:var(--chart-3-dark); --chart-4:var(--chart-4-dark);
    --chart-5:var(--chart-5-dark); --chart-6:var(--chart-6-dark);
    --chart-7:var(--chart-7-dark); --chart-8:var(--chart-8-dark);
  }
"""
src = src.replace(ANCHOR, ANCHOR + TOKENS, 1)
print('[1/2] tokens inserted')

# ------------------------------------------------------- 2. price bands
OLD_BANDS = """    { label: '$1M+', min: 1000000, max: Infinity, color: '#a855f7' },
    { label: '$500K-1M', min: 500000, max: 999999, color: '#8b5cf6' },
    { label: '$300-500K', min: 300000, max: 499999, color: '#3b82f6' },
    { label: '$200-300K', min: 200000, max: 299999, color: '#06b6d4' },
    { label: '$100-200K', min: 100000, max: 199999, color: '#10b981' },
    { label: '<$100K', min: 0, max: 99999, color: '#6b7280' },
    { label: 'Unknown', min: -1, max: -1, color: '#374151' }"""

NEW_BANDS = """    { label: '$1M+', min: 1000000, max: Infinity, color: 'var(--chart-1)' },
    { label: '$500K-1M', min: 500000, max: 999999, color: 'var(--chart-2)' },
    { label: '$300-500K', min: 300000, max: 499999, color: 'var(--chart-3)' },
    { label: '$200-300K', min: 200000, max: 299999, color: 'var(--chart-4)' },
    { label: '$100-200K', min: 100000, max: 199999, color: 'var(--chart-5)' },
    { label: '<$100K', min: 0, max: 99999, color: 'var(--chart-6)' },
    { label: 'Unknown', min: -1, max: -1, color: 'var(--chart-7)' }"""

n = src.count(OLD_BANDS)
if n != 1:
    sys.exit('ABORT: price band array found %d times, expected 1' % n)
src = src.replace(OLD_BANDS, NEW_BANDS, 1)
print('[2/2] price bands -> slots 1..7')

# ------------------------------------------------------------- guardrails
# hub/11 trap 1: a token concatenated with a hex-alpha suffix fails SILENTLY
# to transparent. Assert no var(--chart-N) is ever followed by hex digits.
bad = re.findall(r"var\(--chart-\d\)\s*\+?\s*'?[0-9a-fA-F]{2}'", src)
if bad:
    sys.exit('ABORT: hex-alpha corruption risk: %r' % bad[:5])

# The three low-contrast light slots (3,4,5) are only legal where the value is
# printed beside the segment. The price chart prints b.count -- verify.
seg = src[src.find(NEW_BANDS):]
seg = seg[:seg.find('html += \'</div>\';')]
if "+ b.count +" not in seg:
    sys.exit('ABORT: relief rule unmet - price chart no longer prints values')
print('      guardrails: no hex-alpha corruption, relief rule satisfied')

assert src != orig
open(PATH, 'w', encoding='utf-8').write(src)
print('\nOK -- worker.js patched. Run: node --check worker.js')
