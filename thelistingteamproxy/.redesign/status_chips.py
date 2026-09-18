#!/usr/bin/env python3
"""Contacts: fix the readiness / motivation / priority chips.

They were solid saturated fills carrying white text, which does not survive
measurement: white on #f59e0b is 2.19:1 and on #eab308 is 1.96:1, against a
4.5:1 requirement for 12px bold. They move onto the soft-tint chip pattern the
rest of the product already uses (.score-high, .badge-good, .status-new):
a tinted background with the semantic colour as the label.

Why the colour variables are NOT simply retokenised: two sites append a hex
alpha suffix to them - `prColor + '22'` and `motColor + '88'`. A token would
produce `var(--red)22`, which is invalid CSS and fails silently to
transparent. So each definition gains a parallel *tone name* and only the
six white-on-fill chip sites are rewritten; the alpha-suffix sites are left
exactly as they are.

Idempotent.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKER = os.path.join(ROOT, 'worker.js')

# hex -> semantic tone. #f59e0b and #eab308 both fold to yellow: the chip also
# prints the numeric score, so the tier stays legible without a 4th fill.
TONE = {
    "'#ef4444'": "'red'", "'#f59e0b'": "'yellow'", "'#eab308'": "'yellow'",
    "'#3b82f6'": "'blue'", "'#22c55e'": "'green'", "'#6b7280'": "'muted'",
}


# 'muted' has no -soft/-colour pair, so it resolves to the neutral surface.
TONE_CSS_BG = ("' + (%(t)s === 'muted' ? 'var(--surface-2)' : "
               "'var(--' + %(t)s + '-soft)') + '")
TONE_CSS_FG = ("' + (%(t)s === 'muted' ? 'var(--text-secondary)' : "
               "'var(--' + %(t)s + ')') + '")


def chip(var, tone):
    """The six white-on-fill chip sites, as (old, new) pairs."""
    bg = TONE_CSS_BG % {'t': tone}
    fg = TONE_CSS_FG % {'t': tone}
    tail = 'padding:2px 8px;border-radius:12px;font-size:12px;font-weight:700'
    return [
        # form A: background first, then color
        ("background:' + %s + ';color:#fff;%s" % (var, tail),
         "background:%s;color:%s;%s" % (bg, fg, tail)),
        # form B: inline-block pill, colour last
        ("display:inline-block;padding:2px 10px;border-radius:12px;"
         "font-weight:700;font-size:12px;background:' + %s + ';color:#fff" % var,
         "display:inline-block;padding:2px 10px;border-radius:12px;"
         "font-weight:700;font-size:12px;background:%s;color:%s" % (bg, fg)),
        # form C: the 28px rank circle
        ("width:28px;height:28px;border-radius:50%%;background:' + %s + ';color:#fff"
         % var,
         "width:28px;height:28px;border-radius:50%%;background:%s;color:%s" % (bg, fg)),
    ]


PAIRS = chip('rdColor', 'rdTone') + chip('motColor', 'motTone') + chip('prColor', 'prTone')
EXPECTED_CHIPS = 6


def template_span(text, name):
    m = re.search(r'var ' + name + r'\s*=\s*`', text)
    i = m.end()
    start = i
    while i < len(text):
        if text[i] == '\\':
            i += 2
            continue
        if text[i] == '`':
            return start, i
        i += 1
    raise SystemExit('ABORT: unterminated template')


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


src = open(WORKER, encoding='utf-8').read()
ts, te = template_span(src, 'YLOPO_CONTACTS_HTML')
tpl = src[ts:te]
before = tpl

if 'rdTone' in tpl or 'motTone' in tpl:
    raise SystemExit('ABORT: status chip fix already applied')

# 1. give every colour ternary a parallel tone ternary on the next statement
n_defs = 0
for var, tone in [('rdColor', 'rdTone'), ('motColor', 'motTone'), ('prColor', 'prTone')]:
    for m in list(re.finditer(r'var ' + var + r' = ([^;]+);', tpl)):
        decl = m.group(0)
        expr = m.group(1)
        toned = expr
        for hx, tn in TONE.items():
            toned = toned.replace(hx, tn)
        if toned == expr:
            raise SystemExit('ABORT: no hex mapped in %s definition' % var)
        new = decl + ' var ' + tone + ' = ' + toned + ';'
        tpl = tpl.replace(decl, new, 1)
        n_defs += 1


# 2. rewrite only the white-on-fill chip sites
n_chips = 0
for old, new in PAIRS:
    while old in tpl:
        tpl = tpl.replace(old, new, 1)
        n_chips += 1

if n_chips != EXPECTED_CHIPS:
    raise SystemExit('ABORT: rewrote %d chips, expected %d' % (n_chips, EXPECTED_CHIPS))

# 3. the alpha-suffix sites must be untouched - a var() there would be invalid
for suffix in ["prColor + '22'", "motColor + '88'"]:
    if before.count(suffix) != tpl.count(suffix):
        raise SystemExit('ABORT: alpha-suffix site disturbed: ' + suffix)
if re.search(r'var\(--[a-z-]+\)\d\d', tpl):
    raise SystemExit('ABORT: a var() gained a hex-alpha suffix')

# 4. no white-on-fill chips left on these three variables
for var in ['rdColor', 'motColor', 'prColor']:
    bad = re.findall(r"background:' \+ " + var + r" \+ ';color:#fff", tpl)
    if bad:
        raise SystemExit('ABORT: %d white-on-fill chips left on %s' % (len(bad), var))

# 5. template-literal safety
if unescaped(tpl, '`'):
    raise SystemExit('ABORT: bare backtick introduced')
if unescaped(tpl, '${') != unescaped(before, '${'):
    raise SystemExit('ABORT: ${ count changed')

open(WORKER, 'w', encoding='utf-8').write(src[:ts] + tpl + src[te:])
print('tone ternaries added : %d' % n_defs)
print('chips rewritten      : %d' % n_chips)
print('contacts %d -> %d bytes (%+d)' % (len(before), len(tpl), len(tpl) - len(before)))
