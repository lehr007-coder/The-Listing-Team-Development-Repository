#!/usr/bin/env python3
"""Targeted bug fixes inside the Ylopo Contacts dashboard JS.

Run AFTER splice.py. Idempotent: every replacement accepts either the expected
"not yet applied" count or 0 ("already applied"), so re-running is a no-op.

Fixes
  1. #00ff55 neon green, hardcoded 29x as a foreground colour. Legible on the
     old dark surface, ~1.4:1 contrast on the new light one. -> var(--green).
  2. SCORE_HISTORY_KEY is declared twice ('ylopo_score_history' at the top,
     'score_history' near the bottom). The later var wins for the whole script,
     so the trend tracker (writes {s,t} objects) and the daily-history chart
     (expects arrays) fight over one localStorage key. Consequences, both
     reproduced in a browser: showScoreHistory() throws "data.map is not a
     function" and recordScoreSnapshot() throws "push is not a function".
     -> give the daily history its own key, and guard the shape.
  3. loadData() returns nothing but init does loadData().then(...), so every
     page load throws "Cannot read properties of undefined (reading 'then')"
     and recordScoreSnapshot() never runs. -> drop the bogus chain and call the
     snapshot where the data is actually ready.
"""
import os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(BASE, 'worker.js')
src = open(WORKER, encoding='utf-8').read()

applied, skipped = [], []


def sub(label, old, new, expect, region=None):
    """Replace `old` with `new`. region=(start,end) limits the edit window."""
    global src
    lo, hi = (region or (0, len(src)))
    window = src[lo:hi]
    n = window.count(old)
    if n == 0:
        if new in window:
            skipped.append(label + ' (already applied)')
            return
        sys.exit('ABORT: %s - pattern not found: %r' % (label, old[:70]))
    if n != expect:
        sys.exit('ABORT: %s - expected %d occurrences, found %d' % (label, expect, n))
    src = src[:lo] + window.replace(old, new) + src[hi:]
    applied.append('%s (%d)' % (label, n))


# ---------------------------------------------------------------- fix 1
n = src.count('#00ff55')
if n:
    src = src.replace('#00ff55', 'var(--green)')
    applied.append('neon green -> var(--green) (%d)' % n)
else:
    skipped.append('neon green (already applied)')

n = src.count('rgba(0,255,85,0.1)')
if n:
    src = src.replace('rgba(0,255,85,0.1)', 'var(--green-soft)')
    applied.append('neon green fill -> var(--green-soft) (%d)' % n)
else:
    skipped.append('neon green fill (already applied)')

# ---------------------------------------------------------------- fix 2
DECL_OLD = "var SCORE_HISTORY_KEY = 'score_history';"
DECL_NEW = "var SCORE_DAILY_KEY = 'ylopo_score_daily';"
if DECL_OLD in src:
    at = src.index(DECL_OLD)
    src = src[:at] + DECL_NEW + src[at + len(DECL_OLD):]
    applied.append('split the colliding score-history key')
    tail = (at, len(src))
    # only the usages AFTER the declaration belong to the daily-history subsystem
    sub('daily history reads', 'JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY)) || {}',
        'JSON.parse(localStorage.getItem(SCORE_DAILY_KEY)) || {}', 2, tail)
    sub('daily history write', 'localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history));',
        'localStorage.setItem(SCORE_DAILY_KEY, JSON.stringify(history));', 1, tail)
else:
    skipped.append('score-history key split (already applied)')

sub('guard snapshot array shape',
    'if (!history[lead.id]) history[lead.id] = [];',
    'if (!Array.isArray(history[lead.id])) history[lead.id] = [];', 1)

sub('guard chart array shape',
    "var data = history[leadId] || [{ date: new Date().toISOString().split('T')[0], score: lead.score }];",
    "var data = Array.isArray(history[leadId]) && history[leadId].length ? history[leadId]"
    " : [{ date: new Date().toISOString().split('T')[0], score: lead.score }];", 1)

# ---------------------------------------------------------------- fix 3
sub('remove the .then() on a void loadData()',
    'loadGHLTeam().then(function() { loadData().then(function() { recordScoreSnapshot(); }); });',
    'loadGHLTeam().then(function() { loadData(); });', 1)

sub('snapshot scores once the leads are actually built',
    '  updateScoreTrends(ALL_LEADS);\n  updateStats();',
    '  updateScoreTrends(ALL_LEADS);\n'
    "  try { recordScoreSnapshot(); } catch (e) { console.warn('score snapshot skipped:', e); }\n"
    '  updateStats();', 1)

# ---------------------------------------------------------------- checks
if 'SCORE_HISTORY_KEY' in src and 'SCORE_DAILY_KEY' not in src:
    sys.exit('ABORT: key split left the file inconsistent')
if src.count("var SCORE_HISTORY_KEY") != 1:
    sys.exit('ABORT: SCORE_HISTORY_KEY should now be declared exactly once, found %d'
             % src.count('var SCORE_HISTORY_KEY'))

open(WORKER, 'w', encoding='utf-8').write(src)
print('applied:')
for a in applied:
    print('  +', a)
if skipped:
    print('skipped:')
    for s in skipped:
        print('  =', s)
