#!/usr/bin/env python3
"""Contacts: stop tint chips from wearing their own series colour as the label.

Eight chips build themselves as `background:' + X + '22;color:' + X + '` - a
13% tint of a colour, labelled in that same colour. Measured on the rendered
page that is 1.94:1 for the amber value and 3.16:1 for red and blue, because
X is a light chart hue, not a text colour.

X is not fixed - it arrives from data (n.color, typeColor, crColor...) - so
there is no per-colour substitution to make. The general fix is the data-viz
rule: text wears text tokens, never the series colour. The tint keeps carrying
identity; the label becomes --text, which is legible on a 13% tint of anything
in either theme.

This also removes one string concatenation per site, which is why the
replacement merges two literals into one.

Idempotent.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKER = os.path.join(ROOT, 'worker.js')
EXPECTED = 8

PAT = re.compile(r"background:' \+ ([\w.]+) \+ '22;color:' \+ \1 \+ '")


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

found = PAT.findall(tpl)
if not found:
    raise SystemExit('ABORT: no tint chips found - already applied?')
if len(found) != EXPECTED:
    raise SystemExit('ABORT: found %d tint chips, expected %d (%s)'
                     % (len(found), EXPECTED, found))

tpl = PAT.sub(lambda m: "background:' + %s + '22;color:var(--text)" % m.group(1), tpl)

# quote parity: each rewrite removes exactly one `+ X + '` pair, so the number
# of single quotes must drop by exactly two per site.
if before.count("'") - tpl.count("'") != EXPECTED * 2:
    raise SystemExit('ABORT: quote parity off - %d removed, expected %d'
                     % (before.count("'") - tpl.count("'"), EXPECTED * 2))
if PAT.search(tpl):
    raise SystemExit('ABORT: tint chips remain')
if unescaped(tpl, '`') or unescaped(tpl, '${') != unescaped(before, '${'):
    raise SystemExit('ABORT: template-literal safety check failed')

open(WORKER, 'w', encoding='utf-8').write(src[:ts] + tpl + src[te:])
print('tint chip labels moved to --text : %d  (%s)' % (len(found), ', '.join(sorted(set(found)))))
print('contacts %d -> %d bytes (%+d)' % (len(before), len(tpl), len(tpl) - len(before)))
