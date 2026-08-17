#!/usr/bin/env python3
"""Splice the v2 design (tokens + app shell) into YLOPO_CONTACTS_HTML in worker.js.

Only touches the <style> block and the body markup of that one template literal.
The 7,800-line dashboard JS below it is left byte-for-byte identical.
"""
import re, sys, shutil, os, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(BASE, 'worker.js')
HERE = os.path.dirname(os.path.abspath(__file__))

src = open(WORKER, encoding='utf-8').read()
css = open(os.path.join(HERE, 'new.css'), encoding='utf-8').read()
body = open(os.path.join(HERE, 'new-body.html'), encoding='utf-8').read()

for name, blob in (('new.css', css), ('new-body.html', body)):
    for bad in ('`', '${'):
        if bad in blob:
            sys.exit('ABORT: %s contains %r which would break the template literal' % (name, bad))

# ---- locate the template literal -------------------------------------------
start = src.find('var YLOPO_CONTACTS_HTML = `')
if start < 0:
    sys.exit('ABORT: YLOPO_CONTACTS_HTML not found')
open_tick = src.index('`', start)
i = open_tick + 1
while True:
    j = src.index('`', i)
    if src[j - 1] == '\\':
        i = j + 1
        continue
    end_tick = j
    break
tpl = src[open_tick + 1:end_tick]
print('template literal: %d chars' % len(tpl))

# ---- 1. replace the first <style> block ------------------------------------
m = re.search(r'(<style[^>]*>)(.*?)(</style>)', tpl, re.S | re.I)
if not m:
    sys.exit('ABORT: no <style> block in template')
print('old css: %d chars -> new css: %d chars' % (len(m.group(2)), len(css)))
tpl2 = tpl[:m.start(2)] + css + tpl[m.end(2):]

# ---- 2. replace <body ...> ... up to the big app <script> ------------------
bstart = tpl2.find('<body')
if bstart < 0:
    sys.exit('ABORT: no <body> in template')
appstart = None
for mm in re.finditer(r'<script[^>]*>', tpl2):
    close = min([c for c in (tpl2.find(t, mm.start()) for t in (r'<\/script>', '</script>')) if c > 0] or [-1])
    if close > 0 and close - mm.start() > 100000:
        appstart = mm.start()
        break
if appstart is None:
    sys.exit('ABORT: could not find the main app <script> block')
# match house style: escape the closing tag of the theme-bootstrap script
body = body.replace('</script>', r'<\/script>')
print('old body: %d chars -> new body: %d chars' % (appstart - bstart, len(body)))
tpl3 = tpl2[:bstart] + body + '\n' + tpl2[appstart:]

# ---- sanity checks ----------------------------------------------------------
IDS = ['loadingOverlay','loadingText','toast-container','colorPanelOverlay','cpLock','cpBody',
       'diagModal','diagContent','subtitleText','actBellBtn','actBadge','dupBadge','themeToggle',
       'lastLoaded','refreshCountdown','statTotal','statHot','statWarm','statCold','statShowings',
       'statNew','statTrend','statStale','sourcePieChart','conversionMini','viewTabContacts',
       'viewTabSource','viewTabGeo','viewTabBuyer','viewTabSeller','contactsViewPanel','sourceFilter',
       'searchInput','presetBtn','presetMenu','sortSelect','viewToggle','smartListsPanel','bulkBar',
       'bulkCount','tableView','leadsTable','selectAll','leadsBody','cardsView','paginationEl',
       'sourceViewPanel','srcKPIs','srcTblBody','srcDistBars','srcHotBars','srcTypeBars','srcRecentBars',
       'geoViewPanel','geoKPIs','geoCityBars','geoStateBars','geoTblBody','buyerViewPanel',
       'buyerTabContent','sellerViewPanel','sellerTabContent','listingsInput','listingsCanvas']
missing = [i for i in IDS if ('id="%s"' % i) not in tpl3]
if missing:
    sys.exit('ABORT: element IDs lost in the rewrite: %s' % missing)
print('all %d required element IDs present' % len(IDS))

if tpl3.count('<script') < tpl.count('<script'):
    sys.exit('ABORT: a script block was lost (%d -> %d)' % (tpl.count('<script'), tpl3.count('<script')))
if 'chart.umd.min.js' not in tpl3:
    sys.exit('ABORT: Chart.js include lost')
if tpl3.count(r'<\/script>') + tpl3.count('</script>') != tpl3.count('<script'):
    sys.exit('ABORT: unbalanced script tags')

out = src[:open_tick + 1] + tpl3 + src[end_tick:]

stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(WORKER, os.path.join(HERE, 'worker.js.bak-' + stamp))
open(WORKER, 'w', encoding='utf-8').write(out)
print('worker.js: %d -> %d bytes (backup: worker.js.bak-%s)' % (len(src), len(out), stamp))
