#!/usr/bin/env python3
"""Production-safe fix for the two REAL Ylopo Contacts logic bugs.

Deliberately scoped:
  * Only edits inside the YLOPO_CONTACTS_HTML template literal. PRIORITY_LEADS_HTML
    and YLOPO_ANALYTICS_HTML are verified not to contain these patterns and are
    never touched.
  * Only bugs 3 and 4 - the score-history key collision and the init TypeError.
    Both are invisible logic defects: no pixel on the live dashboard changes.
  * Bug 5 (#00ff55) is NOT applied. On the production dark theme that colour is
    perfectly legible; it only becomes a contrast failure under the new light
    theme, so it belongs with the redesign, not in a bug-fix ship.

Idempotent. Aborts loudly rather than guessing.
"""
import os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(BASE, 'worker.js')
src = open(WORKER, encoding='utf-8').read()
before = src


def template_span(name):
    st = src.find('var %s = `' % name)
    if st < 0:
        sys.exit('ABORT: %s not found' % name)
    ot = src.index('`', st)
    i = ot + 1
    while True:
        j = src.index('`', i)
        if src[j - 1] == '\\':
            i = j + 1
            continue
        return ot + 1, j


LO, HI = template_span('YLOPO_CONTACTS_HTML')

# Guard: the other page templates must not contain these patterns, or the
# "scoped" claim is false and this script should not run.
for other in ('PRIORITY_LEADS_HTML', 'YLOPO_ANALYTICS_HTML'):
    a, b = template_span(other)
    t = src[a:b]
    if 'SCORE_HISTORY_KEY' in t or 'loadData().then' in t:
        sys.exit('ABORT: %s also contains these patterns - widen the review first' % other)

applied, skipped = [], []


def sub(label, old, new, expect):
    global src, LO, HI
    win = src[LO:HI]
    n = win.count(old)
    if n == 0:
        if new in win:
            skipped.append(label + ' (already applied)')
            return
        sys.exit('ABORT: %s - pattern not found' % label)
    if n != expect:
        sys.exit('ABORT: %s - expected %d, found %d' % (label, expect, n))
    src = src[:LO] + win.replace(old, new) + src[HI:]
    HI += (len(new) - len(old)) * n
    applied.append('%s (%d)' % (label, n))


# ---- bug 3: SCORE_HISTORY_KEY declared twice; the second declaration wins for
#      the whole script, so the trend tracker ({s,t} objects) and the daily
#      history chart (arrays) collide on one localStorage key.
DECL_OLD = "var SCORE_HISTORY_KEY = 'score_history';"
DECL_NEW = "var SCORE_DAILY_KEY = 'ylopo_score_daily';"
win = src[LO:HI]
if DECL_OLD in win:
    at = LO + win.index(DECL_OLD)
    src = src[:at] + DECL_NEW + src[at + len(DECL_OLD):]
    HI += len(DECL_NEW) - len(DECL_OLD)
    applied.append('split the colliding score-history key')
    # only usages AFTER the declaration belong to the daily-history subsystem
    tail_lo, tail_hi = at, HI
    win2 = src[tail_lo:tail_hi]
    r1 = 'JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY)) || {}'
    n1 = win2.count(r1)
    if n1 != 2:
        sys.exit('ABORT: expected 2 daily-history reads, found %d' % n1)
    win2 = win2.replace(r1, 'JSON.parse(localStorage.getItem(SCORE_DAILY_KEY)) || {}')
    r2 = 'localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history));'
    n2 = win2.count(r2)
    if n2 != 1:
        sys.exit('ABORT: expected 1 daily-history write, found %d' % n2)
    win2 = win2.replace(r2, 'localStorage.setItem(SCORE_DAILY_KEY, JSON.stringify(history));')
    src = src[:tail_lo] + win2 + src[tail_hi:]
    HI = tail_lo + len(win2)
    applied.append('daily history reads/writes repointed (3)')
else:
    skipped.append('score-history key split (already applied)')

sub('guard snapshot array shape',
    'if (!history[lead.id]) history[lead.id] = [];',
    'if (!Array.isArray(history[lead.id])) history[lead.id] = [];', 1)

sub('guard chart array shape',
    "var data = history[leadId] || [{ date: new Date().toISOString().split('T')[0], score: lead.score }];",
    "var data = Array.isArray(history[leadId]) && history[leadId].length ? history[leadId]"
    " : [{ date: new Date().toISOString().split('T')[0], score: lead.score }];", 1)

# ---- bug 4: loadData() returns nothing but init chains .then() on it, so every
#      page load throws and recordScoreSnapshot() never runs.
sub('remove the .then() on a void loadData()',
    'loadGHLTeam().then(function() { loadData().then(function() { recordScoreSnapshot(); }); });',
    'loadGHLTeam().then(function() { loadData(); });', 1)

sub('snapshot scores once the leads are actually built',
    '  updateScoreTrends(ALL_LEADS);\n  updateStats();',
    '  updateScoreTrends(ALL_LEADS);\n'
    "  try { recordScoreSnapshot(); } catch (e) { console.warn('score snapshot skipped:', e); }\n"
    '  updateStats();', 1)

# ---- assertions: prove the blast radius
if src.count('var SCORE_HISTORY_KEY') != 1:
    sys.exit('ABORT: SCORE_HISTORY_KEY should be declared once, found %d' % src.count('var SCORE_HISTORY_KEY'))
if src.count('#00ff55') != before.count('#00ff55'):
    sys.exit('ABORT: this script must not change any colour')
if len(src) - len(before) > 400:
    sys.exit('ABORT: diff larger than expected (%d bytes)' % (len(src) - len(before)))

open(WORKER, 'w', encoding='utf-8').write(src)
print('applied:')
for a in applied:
    print('  +', a)
for s_ in skipped:
    print('  =', s_)
print('net size change: %+d bytes' % (len(src) - len(before)))
print('colour literals changed: 0')
