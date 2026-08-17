#!/usr/bin/env python3
"""Priority Leads: fix the floating nav pill contrast and the leftover
lime rgba() tints the hex-based converter could not see.

Two separate defects:

1. .external-links is position:fixed, so the pills pass over BOTH the deep
   teal header and the light page body. They carried a translucent wash plus
   a dark accent text colour, which is dark-on-dark over the header. They are
   now opaque surface chips that do not borrow contrast from the backdrop.

2. Eleven rgba() lime tints survived the colour pass (it mapped hex only).
   Six of them sit behind green / amber / red status text, so they take the
   matching semantic *-soft token rather than the brand tint - those are
   status colours, not brand colours. The remaining five are genuine brand
   surfaces and move onto the teal --brand-soft.

Idempotent: aborts if already applied.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKER = os.path.join(ROOT, 'worker.js')

# --- new token, added to every copy of the shared block (4 pages) ----------
DARK_ANCHOR = '--brand-surface:#132836; --brand-chip:#16344A; --brand-ink:#0A1119;'
LIGHT_ANCHOR = '--brand-surface:#F0F8FB; --brand-chip:#DCF2F8; --brand-ink:#FFFFFF;'
DARK_ADD = ' --brand-soft:rgba(93,173,226,0.10);'
LIGHT_ADD = ' --brand-soft:rgba(30,122,156,0.07);'
DARK_N = 8    # :root + legacy reconciliation block, x4 pages
LIGHT_N = 4   # body.light-mode, x4 pages

# --- Priority Leads only: rgba tints -> semantic tokens --------------------
# spaced format, so these cannot collide with the shared block's compact one
TINTS = [
    ('rgba(140, 198, 62, 0.15)', 'var(--green-soft)',  2),  # score-high, status-qualified
    ('rgba(140, 198, 62, 0.2)',  'var(--green-soft)',  1),  # badge-excellent
    ('rgba(190, 214, 47, 0.15)', 'var(--yellow-soft)', 2),  # score-medium, status-contacted
    ('rgba(190, 214, 47, 0.2)',  'var(--yellow-soft)', 1),  # badge-good
    ('rgba(220, 53, 69, 0.15)',  'var(--red-soft)',    1),  # score-low
    ('rgba(220, 53, 69, 0.2)',   'var(--red-soft)',    1),  # badge-average
    ('rgba(59, 130, 246, 0.15)', 'var(--blue-soft)',   1),  # status-new
    ('rgba(190, 214, 47, 0.05)', 'var(--brand-soft)',  4),  # tab active, row hover, card, factor
    ('rgba(190, 214, 47, 0.03)', 'var(--brand-soft)',  1),  # details panel
]

NAV_CSS = """
/* --- Floating cross-dashboard nav ------------------------------------------
   .external-links is position:fixed, so these pills pass over BOTH the deep
   teal header and the light page body. They cannot borrow contrast from the
   backdrop, so each is an opaque surface chip carrying its accent in the
   label and border rather than in a translucent wash. */
.external-link{background:var(--surface);color:var(--text-secondary);border:1px solid var(--card-border);box-shadow:var(--shadow-sm)}
.external-link:hover{background:var(--surface-hover);color:var(--text);border-color:currentColor;box-shadow:var(--shadow);transform:translateY(-2px)}
.external-link.ext-blue{color:var(--blue)}
.external-link.ext-green{color:var(--green)}
.external-link.ext-yellow{color:var(--yellow)}
.external-link.ext-purple{color:var(--purple)}
.external-link.ext-cyan{color:var(--cyan)}
.external-link.ext-blue:hover,.external-link.ext-green:hover,.external-link.ext-yellow:hover,.external-link.ext-purple:hover,.external-link.ext-cyan:hover{color:var(--text)}
.external-link.ext-brand{background:var(--brand-primary);color:var(--text-white);border-color:transparent}
.external-link.ext-brand:hover{background:var(--brand-secondary);color:var(--text-white);border-color:transparent}
"""


def span(text, name):
    m = re.search(r'var ' + name + r'\s*=\s*`', text)
    if not m:
        raise SystemExit('ABORT: template not found: ' + name)
    i = m.end()
    start = i
    while i < len(text):
        if text[i] == '\\':
            i += 2
            continue
        if text[i] == '`':
            return start, i
        i += 1
    raise SystemExit('ABORT: unterminated template: ' + name)


def sub_exact(text, old, new, n, label):
    got = text.count(old)
    if got != n:
        raise SystemExit('ABORT: %s -- found %d of "%s", expected %d'
                         % (label, got, old, n))
    return text.replace(old, new)


src = open(WORKER, encoding='utf-8').read()
if 'ext-brand' in src or '--brand-soft' in src:
    raise SystemExit('ABORT: nav/tint fix already applied')

# 1. add --brand-soft to every copy of the shared block
src = sub_exact(src, DARK_ANCHOR, DARK_ANCHOR + DARK_ADD, DARK_N, 'dark token block')
src = sub_exact(src, LIGHT_ANCHOR, LIGHT_ANCHOR + LIGHT_ADD, LIGHT_N, 'light token block')

# 2. everything else is scoped to the Priority Leads template alone
s, e = span(src, 'PRIORITY_LEADS_HTML')
t = src[s:e]
before_len = len(t)

for old, new, n in TINTS:
    t = sub_exact(t, old, new, n, 'tint')

# 3. inline pill styles -> accent classes
def pill(m):
    return 'class="external-link ext-%s"' % m.group(1)

t, n_pill = re.subn(r'class="external-link"\s+style="[^"]*color:var\(--([a-z]+)\)"', pill, t)
if n_pill != 5:
    raise SystemExit('ABORT: rewrote %d accent pills, expected 5' % n_pill)

t, n_brand = re.subn(r'class="external-link">', 'class="external-link ext-brand">', t)
if n_brand != 2:
    raise SystemExit('ABORT: tagged %d brand pills, expected 2' % n_brand)

bad = re.findall(r'class="external-link"[^>]*style=', t)
if bad:
    raise SystemExit('ABORT: %d pills still carry inline colour' % len(bad))

# 4. append the nav rules at the end of the page's own <style> block, so they
#    outrank the original .external-link rule by source order
close = t.find('</style>')
if close < 0:
    raise SystemExit('ABORT: no </style> in PRIORITY_LEADS_HTML')
t = t[:close] + NAV_CSS + t[close:]


# 5. template-literal safety
def unescaped(text, needle):
    n = i = 0
    while i < len(text):
        if text[i] == '\\':
            i += 2
            continue
        if text.startswith(needle, i):
            n += 1
        i += 1
    return n


if unescaped(t, '`'):
    raise SystemExit('ABORT: bare backtick introduced into PRIORITY_LEADS_HTML')
if unescaped(t, '${') != unescaped(src[s:e], '${'):
    raise SystemExit('ABORT: ${ count changed in PRIORITY_LEADS_HTML')

# 6. no lime left anywhere on the page
lime = re.findall(r'rgba\(\s*(?:190\s*,\s*214\s*,\s*47|140\s*,\s*198\s*,\s*62)', t)
if lime:
    raise SystemExit('ABORT: %d lime rgba tints still present' % len(lime))

src = src[:s] + t + src[e:]
open(WORKER, 'w', encoding='utf-8').write(src)

print('pills rewritten : %d accent + %d brand' % (n_pill, n_brand))
print('tints remapped  : %d' % sum(n for _, _, n in TINTS))
print('--brand-soft    : %d dark blocks, %d light blocks' % (DARK_N, LIGHT_N))
print('priority template %d -> %d bytes (%+d)' % (before_len, len(t), len(t) - before_len))
