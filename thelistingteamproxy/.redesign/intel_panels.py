#!/usr/bin/env python3
"""Buyer / Seller Intel: put the JS-rendered panels on the design system's
component vocabulary instead of hand-rolled inline card styling.

renderBuyerTab / renderSellerTab build their markup with innerHTML string
concatenation, so they never saw the CSS pass. Every card in them re-declares
background + border + radius + padding by hand, with two spellings of the same
thing (--card and --card-bg,var(--card)) and hardcoded 12px/20px that ignore
the radius and spacing scales. This maps them onto .panel and .stat-card.

Also fixes the pipeline-health gauge, whose colour was a raw #22c55e /
#f59e0b / #ef4444 ternary: 2.26:1 against a white card in light mode, which
fails even the 3:1 large-text threshold at its 32px size.

Scoped strictly to the two render functions. Idempotent.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKER = os.path.join(ROOT, 'worker.js')
CB = 'border:1px solid var(--card-border);border-radius:12px'


# Both spellings of the surface token appear; treat them as one thing.
def cards(bg):
    """(old style attribute, replacement attributes, expected count)."""
    p = 'background:%s;%s' % (bg, CB)
    return [
        (p + ';padding:20px;margin-bottom:20px', 'class="panel" style="margin-bottom:20px"'),
        (p + ';padding:20px;text-align:center',  'class="panel" style="text-align:center"'),
        (p + ';padding:16px;text-align:center',  'class="stat-card" style="text-align:center"'),
        (p + ';overflow:hidden',                 'class="panel" style="padding:0;overflow:hidden"'),
        (p + ';padding:20px',                    'class="panel"'),
    ]


# longest-first ordering matters: ";padding:20px" is a prefix of
# ";padding:20px;margin-bottom:20px", so the specific forms must go first.
CARD_RULES = cards('var(--card-bg,var(--card))') + cards('var(--card)')
EXPECTED_CARDS = 25

# The health gauge. Raw hex -> semantic tokens, which are contrast-tuned:
# #22c55e was 2.26:1 on a white card; var(--green) is 5.28:1.
GAUGE_OLD = ("healthScore >= 70 ? '#22c55e' : healthScore >= 45 ? '#f59e0b' : '#ef4444'")
GAUGE_NEW = ("healthScore >= 70 ? 'var(--green)' : healthScore >= 45 ? "
             "'var(--yellow)' : 'var(--red)'")
GAUGE_N = 2

# A CSS variable is not valid in an SVG presentation attribute - it only
# resolves through the style property - so the stroke has to move.
STROKE_OLD = 'stroke="\' + healthColor + \'"'
STROKE_NEW = 'style="stroke:\' + healthColor + \'"'
STROKE_N = 2


def template_span(text, name):
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


def fn_span(text, name):
    """Brace-matched body of a top-level function declaration."""
    i = text.find('function ' + name)
    if i < 0:
        raise SystemExit('ABORT: function not found: ' + name)
    k = text.find('{', i)
    depth = 0
    while k < len(text):
        if text[k] == '{':
            depth += 1
        elif text[k] == '}':
            depth -= 1
            if depth == 0:
                return i, k + 1
        k += 1
    raise SystemExit('ABORT: unbalanced braces in ' + name)


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
tpl_before = tpl

# Source Performance and Geography render the same way and carry the same
# hand-rolled cards, so they get the same treatment.
FUNCTIONS = ['renderBuyerTab', 'renderSellerTab', 'renderSrcPerf', 'renderGeoView']

if not re.search(r'style="background:var\(--card[^"]*border-radius:12px', tpl):
    raise SystemExit('ABORT: no hand-rolled cards left - already applied')

n_cards = 0
for fn in FUNCTIONS:
    a, b = fn_span(tpl, fn)
    body = tpl[a:b]
    dollars = unescaped(body, '${')

    for old, new in CARD_RULES:
        target = 'style="%s"' % old
        while target in body:
            body = body.replace(target, new, 1)
            n_cards += 1

    # NOT anchored on `style="background:` - some cards declare the surface
    # token after another property, and an anchored check would pass them by.
    leftover = re.findall(r'style="[^"]*var\(--card[^"]*border-radius:12px[^"]*"', body)
    if leftover:
        raise SystemExit('ABORT: %s has %d unmapped card styles: %s'
                         % (fn, len(leftover), leftover[0][:90]))

    if unescaped(body, '${') != dollars:
        raise SystemExit('ABORT: ${ count changed in ' + fn)
    if unescaped(body, '`'):
        raise SystemExit('ABORT: bare backtick introduced into ' + fn)

    tpl = tpl[:a] + body + tpl[b:]

# Five hand-rolled cards remain OUTSIDE these four views, in modal/tool
# functions (findDuplicates, showABTestDashboard, showPerformanceAnalytics,
# showMarketBenchmarks, showPipelineKanban). They are deliberately left alone:
# they are a different surface, and two are structurally not .panel at all -
# a bordered wrapper with no background, and a kanban column whose top border
# carries a per-column colour. Converting them is separate work.


# --- health gauge colour + the SVG stroke that carries it -----------------
def replace_or_already(text, old, new, n, label):
    """Accept the expected count, or zero if a previous run already did it."""
    got = text.count(old)
    if got == 0 and text.count(new) >= n:
        return text, 0
    if got != n:
        raise SystemExit('ABORT: found %d of %s, expected %d' % (got, label, n))
    return text.replace(old, new), got


tpl, n_gauge = replace_or_already(tpl, GAUGE_OLD, GAUGE_NEW, GAUGE_N, 'gauge ternary')
tpl, n_stroke = replace_or_already(tpl, STROKE_OLD, STROKE_NEW, STROKE_N, 'gauge stroke')

# --- whole-template safety ------------------------------------------------
if unescaped(tpl, '`'):
    raise SystemExit('ABORT: bare backtick in YLOPO_CONTACTS_HTML')
if unescaped(tpl, '${') != unescaped(tpl_before, '${'):
    raise SystemExit('ABORT: ${ count changed in YLOPO_CONTACTS_HTML')
for eid in ['buyerTabContent', 'sellerTabContent', 'viewTabBuyer', 'viewTabSeller']:
    if eid not in tpl:
        raise SystemExit('ABORT: element id lost: ' + eid)

src = src[:ts] + tpl + src[te:]
open(WORKER, 'w', encoding='utf-8').write(src)

print('cards mapped to .panel / .stat-card : %d' % n_cards)
print('health gauges retinted              : %d' % n_gauge)
print('svg strokes moved to style          : %d' % n_stroke)
print('contacts template %d -> %d bytes (%+d)'
      % (len(tpl_before), len(tpl), len(tpl) - len(tpl_before)))
