#!/usr/bin/env python3
"""Bring hub / priority / analytics / pipeline onto the shared design system.

Operates on the RAW template text inside worker.js so every JS escape
(\\`, \\${, <\\/script>) survives byte-for-byte outside the regions we
deliberately rewrite. Idempotent: aborts loudly if already applied.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import unify  # noqa: E402

ROOT = os.path.dirname(HERE)
WORKER = os.path.join(ROOT, 'worker.js')
SHARED = open(os.path.join(HERE, 'tlt-ui.css'), encoding='utf-8').read()
MARK = 'THE LISTING TEAM - SHARED DESIGN SYSTEM'

# (page key, hex before, hex after, page tokens stripped) -- the numbers the
# verified local conversion produced. None = do not assert.
EXPECT = {
    'ADMIN_HUB_HTML':       ('hub',        37,   4,   18),
    'PRIORITY_LEADS_HTML':  ('priority',   34,   3,   18),
    'YLOPO_ANALYTICS_HTML': ('analytics', 469, 334,   39),
    'PIPELINE_HTML':        ('pipeline',  101,  28, None),
}
ORDER = ['ADMIN_HUB_HTML', 'PRIORITY_LEADS_HTML',
         'YLOPO_ANALYTICS_HTML', 'PIPELINE_HTML']


def span(text, name):
    """Byte span of the template literal's contents, escape-aware."""
    m = re.search(r'var ' + name + r'\s*=\s*`', text)
    if not m:
        raise SystemExit('ABORT: template not found: ' + name)
    i = m.end()
    start = i
    while i < len(text):
        c = text[i]
        if c == '\\':
            i += 2
            continue
        if c == '`':
            return start, i
        i += 1
    raise SystemExit('ABORT: unterminated template: ' + name)


def unescaped(text, needle):
    """Count occurrences of needle that are NOT backslash-escaped."""
    n = 0
    i = 0
    while i < len(text):
        if text[i] == '\\':
            i += 2
            continue
        if text.startswith(needle, i):
            n += 1
        i += 1
    return n


OWNED = set(re.findall(r'(--[a-zA-Z0-9-]+)\s*:', SHARED))


def page_token_defs(html):
    """Shared tokens the page still redefines in its own <style> blocks.

    Anything left here (e.g. a definition nested inside an @media block,
    which the brace-matching stripper cannot reach) sits AFTER the injected
    block in source order and silently wins the cascade.
    """
    body = html.replace(SHARED, '', 1)
    found = set()
    for mm in re.finditer(r'<style[^>]*>(.*?)</style>', body, re.S | re.I):
        for nm in re.findall(r'(--[a-zA-Z0-9-]+)\s*:', mm.group(1)):
            if nm in OWNED:
                found.add(nm)
    return found


# these templates live inside a JS template literal; keep the file's own
# defensive </script> escaping convention
unify.THEME_BOOTSTRAP = unify.THEME_BOOTSTRAP.replace('</script>', '<\\/script>')

src = open(WORKER, encoding='utf-8').read()
orig_len = len(src)
if MARK in src:
    raise SystemExit('ABORT: shared design system already present in worker.js')

shared_hex = len(re.findall(unify.HEXRE, SHARED))
rows = []

for name in ORDER:
    page, exp_before, exp_after, exp_strip = EXPECT[name]
    s, e = span(src, name)
    raw = src[s:e]
    dollars = unescaped(raw, '${')
    if unescaped(raw, '`'):
        raise SystemExit('ABORT: bare backtick already in ' + name)

    out = unify.convert_page(raw, SHARED, page=page)
    stripped = getattr(unify.convert_page, 'stripped', 0)
    before = len(re.findall(unify.HEXRE, raw))
    after = len(re.findall(unify.HEXRE, out)) - shared_hex

    # --- template-literal safety: nothing may terminate or interpolate ---
    if unescaped(out, '`'):
        raise SystemExit('ABORT: conversion introduced a bare backtick in ' + name)
    if unescaped(out, '${') != dollars:
        raise SystemExit('ABORT: ${ count changed in %s (%d -> %d)'
                         % (name, dollars, unescaped(out, '${')))

    # --- the conversion actually happened ---
    if MARK not in out:
        raise SystemExit('ABORT: shared block not injected into ' + name)
    if 'tltThemeBtn' not in out or 'light-mode' not in out:
        raise SystemExit('ABORT: theme bootstrap missing from ' + name)

    # --- it matches the locally verified conversion exactly ---
    if before != exp_before or after != exp_after:
        raise SystemExit('ABORT: %s hex %d->%d, expected %d->%d'
                         % (name, before, after, exp_before, exp_after))
    # --- the real invariant: no page-level redefinition of a shared token
    #     survives, because a later :root{} would silently outrank the
    #     injected block and the shared palette would do nothing.
    leftovers = page_token_defs(out)
    if leftovers:
        raise SystemExit('ABORT: %s still defines shared tokens: %s'
                         % (name, ', '.join(sorted(leftovers)[:12])))

    src = src[:s] + out + src[e:]
    rows.append((name, before, after, before - after, stripped, len(out) - len(raw)))


# the redesigned Contacts page must not be touched by this pass
if src.count('YLOPO_CONTACTS_HTML') != open(WORKER, encoding='utf-8').read().count('YLOPO_CONTACTS_HTML'):
    raise SystemExit('ABORT: contacts template disturbed')

if not os.path.exists(WORKER + '.preui.bak'):
    open(WORKER + '.preui.bak', 'w', encoding='utf-8').write(
        open(WORKER, encoding='utf-8').read())

open(WORKER, 'w', encoding='utf-8').write(src)

print('%-22s %5s %5s %7s %8s %9s' % ('template', 'hex', '->', 'mapped', 'stripped', 'bytes'))
for r in rows:
    print('%-22s %5d %5d %7d %8d %+9d' % r)
print('worker.js %d -> %d bytes (%+d)' % (orig_len, len(src), len(src) - orig_len))
print('backup: worker.js.preui.bak')
