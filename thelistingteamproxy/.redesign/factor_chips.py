#!/usr/bin/env python3
"""Contacts: fix the buyer/seller "contributing factor" chips.

Each chip fades its own fill by score: `opacity = Math.max(0.3, f.pts/f.max)`,
then puts WHITE text on it. At the top of the range that is white on solid
#3b82f6 (3.68:1); at the bottom it is white on a 30% tint of blue over a white
card, which measures about 1.3:1 - the label is effectively invisible on every
low-scoring factor.

Two changes, same rule as the other chips: the tint keeps carrying magnitude,
the label wears a text token.

  opacity  Math.max(0.3, f.pts/f.max)  ->  0.10 + 0.22 * min(1, f.pts/f.max)
  label    #fff                        ->  var(--text)

The new range keeps the fill light enough that --text clears 8:1 at the top of
the scale in both themes, while staying monotonic in score. The `|| 1` guard
also stops a zero f.max from producing NaN, which CSS drops to transparent.

Idempotent.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKER = os.path.join(ROOT, 'worker.js')

OLD_OP = 'var opacity = Math.max(0.3, f.pts / f.max);'
NEW_OP = 'var opacity = 0.10 + 0.22 * Math.min(1, f.pts / (f.max || 1));'
N_OP = 2

CHIPS = [
    ("background:rgba(59,130,246,' + opacity + ');color:#fff",
     "background:rgba(59,130,246,' + opacity + ');color:var(--text)"),
    ("background:rgba(99,102,241,' + opacity + ');color:#fff",
     "background:rgba(99,102,241,' + opacity + ');color:var(--text)"),
]


src = open(WORKER, encoding='utf-8').read()
if NEW_OP in src:
    raise SystemExit('ABORT: factor chip fix already applied')

if src.count(OLD_OP) != N_OP:
    raise SystemExit('ABORT: found %d opacity formulas, expected %d'
                     % (src.count(OLD_OP), N_OP))
src = src.replace(OLD_OP, NEW_OP)

n = 0
for old, new in CHIPS:
    c = src.count(old)
    if c != 1:
        raise SystemExit('ABORT: found %d of %s, expected 1' % (c, old[:40]))
    src = src.replace(old, new)
    n += 1

if "' + opacity + ');color:#fff" in src:
    raise SystemExit('ABORT: a white-on-faded chip remains')

open(WORKER, 'w', encoding='utf-8').write(src)
print('opacity formulas rebased : %d' % N_OP)
print('factor chip labels fixed : %d' % n)
