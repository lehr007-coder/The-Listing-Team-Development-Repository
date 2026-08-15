#!/usr/bin/env python3
"""Darken the light-mode status tokens so the soft-tint chip pattern actually
clears 4.5:1 when measured on the rendered page.

The earlier values were chosen against a plain white card. But a soft-tint
chip does not sit on white - it sits on the tint OVER white, which is darker,
and that costs roughly 0.5-0.7 of contrast ratio. Measured in a real browser,
--red on --red-soft came out at 4.15:1 and --yellow on --yellow-soft at
4.38:1, both below the bar despite passing the white-card arithmetic.

Reducing the tint alpha cannot rescue red: even at 0.05 it only reaches 4.48.
So the label colours move darker instead. Each new value clears 4.5:1 both as
a label on its own tint AND as white text on the solid fill, so the same token
is safe in either chip style.

                 old        new       on tint   white-on-fill
      red     #D92D20 -> #B3261E      5.55        6.54
      yellow  #B45309 -> #9A4A08      5.40        6.26
      green   #0A7C42 -> #08703B      5.34        6.19
      blue    #1D4ED8  (unchanged)    5.74        6.70
      purple  #6D28D9  (unchanged)    6.03        7.10
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TARGETS = [os.path.join(ROOT, 'worker.js'), os.path.join(HERE, 'tlt-ui.css')]


# Only the LIGHT values are touched. The dark values already measure 6.1-7.4
# on the dark card and are left alone.
SWAPS = [
    ('--red:#D92D20',   '--red:#B3261E'),
    ('--error:#D92D20', '--error:#B3261E'),
    ('--yellow:#B45309', '--yellow:#9A4A08'),
    ('--warning:#B45309', '--warning:#9A4A08'),
    ('--amber:#B45309',  '--amber:#9A4A08'),
    ('--green:#0A7C42',  '--green:#08703B'),
    ('--success:#0A7C42', '--success:#08703B'),
    # the soft tints must track their label colour
    ('rgba(217,45,32,0.10)', 'rgba(179,38,30,0.10)'),
    ('rgba(180,83,9,0.10)',  'rgba(154,74,8,0.10)'),
    ('rgba(10,124,66,0.10)', 'rgba(8,112,59,0.10)'),
]

STALE = ['#D92D20', '#B45309', '#0A7C42',
         'rgba(217,45,32,0.10)', 'rgba(180,83,9,0.10)', 'rgba(10,124,66,0.10)']

for path in TARGETS:
    s = open(path, encoding='utf-8').read()
    orig = s
    counts = []
    for old, new in SWAPS:
        n = s.count(old)
        s = s.replace(old, new)
        counts.append((old.split(':')[0] if ':' in old else old, n))
    for stale in STALE:
        if stale in s:
            raise SystemExit('ABORT: %s still contains %s' % (path, stale))
    if s == orig:
        raise SystemExit('ABORT: nothing changed in ' + path + ' (already applied?)')
    open(path, 'w', encoding='utf-8').write(s)
    print(os.path.basename(path))
    print('   ' + '  '.join('%s x%d' % (k, v) for k, v in counts if v))
