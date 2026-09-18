#!/usr/bin/env python3
"""Bring every thelistingteamproxy dashboard onto the shared design system.

For each page template it:
  1. injects the shared token + base block at the top of the page's <style>
  2. rewrites hardcoded colours to semantic variables, PROPERTY-AWARE so that
     `color:#fff` (text on a coloured surface) is not confused with
     `background:#fff` (a card surface)
  3. adds body.light-mode + a shared floating theme toggle whose choice is
     stored under one key and therefore follows the user across all dashboards

Deliberately does NOT restructure any page's layout or class names - every page
keeps its own components, they just draw from one palette and one scale.
"""
import re

# --------------------------------------------------------------------------
# status / accent colours: safe in BOTH foreground and background positions,
# because each has a light and a dark variant defined in the shared block.
STATUS = {
    '#ef4444':'--red','#dc2626':'--red','#f87171':'--red','#b91c1c':'--red','#dc3545':'--red',
    '#22c55e':'--green','#16a34a':'--green','#4ade80':'--green','#10b981':'--green',
    '#15803d':'--green','#84cc16':'--green',
    '#f59e0b':'--yellow','#eab308':'--yellow','#d97706':'--yellow','#fbbf24':'--yellow',
    '#3b82f6':'--blue','#2563eb':'--blue','#60a5fa':'--blue','#93c5fd':'--blue',
    '#1e4d9e':'--blue','#1a3a6b':'--blue',
    '#8b5cf6':'--purple','#a855f7':'--purple','#7c3aed':'--purple','#a78bfa':'--purple',
    '#c084fc':'--purple',
    '#f97316':'--orange',
    '#06b6d4':'--cyan','#22d3ee':'--cyan',
    '#ec4899':'--pink','#db2777':'--pink',
    '#f43f5e':'--rose',
    # pale tints used as chip backgrounds
    '#dcfce7':'--green-light','#dbeafe':'--blue-light','#fee2e2':'--red-light',
    '#fef3c7':'--amber-light','#ede9fe':'--purple-light','#fce7f3':'--pink-light',
    '#ffedd5':'--orange-light',
    # brand, already correct - normalise to the token
    '#0d3b4f':'--brand-primary','#1e7a9c':'--brand-secondary','#5dade2':'--brand-accent',
    '#f0f8fb':'--brand-surface','#dcf2f8':'--brand-chip',
}

# structural colours, resolved differently depending on the CSS property
SURFACE = {   # when used as a background
    '#fff':'--card','#ffffff':'--card','#f9fafb':'--surface-2','#f6f9fb':'--surface-2',
    '#f3f4f6':'--bg','#f1f5f9':'--bg','#eee':'--surface-2',
    '#0a0e1a':'--bg','#0f172a':'--bg','#0a1120':'--bg','#0f2137':'--bg',
    '#111827':'--surface','#111':'--surface','#1a2236':'--surface','#131f33':'--surface',
    '#1e293b':'--card','#1e2d42':'--card','#1e3554':'--card','#1a1a1a':'--surface',
    '#2d2d2d':'--card','#333333':'--card-border','#404040':'--card-border',
    '#334155':'--card-border','#2d3f58':'--card-border','#4a5568':'--card-border',
    '#e5e7eb':'--card-border','#e5e5e5':'--card-border','#e2e8f0':'--card-border',
    '#d1d5db':'--card-border','#cbd5e1':'--card-border',
    '#000':'--text','#000000':'--text',
    # Priority Leads' lime sub-palette -> brand
    '#bed62f':'--brand-accent','#8cc63e':'--brand-secondary',
}
INK = {       # when used as a text colour
    '#111827':'--text','#111':'--text','#1e293b':'--text','#0f172a':'--text',
    '#1a1a1a':'--text','#000':'--text','#000000':'--text','#333333':'--text',
    '#6b7280':'--text-secondary','#64748b':'--text-secondary','#94a3b8':'--text-secondary',
    '#9ca3af':'--text-secondary','#585a5c':'--text-secondary','#a0a0a0':'--text-secondary',
    '#4a5568':'--text-secondary','#cbd5e1':'--text-secondary',
    '#f1f5f9':'--text','#e2e8f0':'--text','#f6f9fb':'--text',
    '#bed62f':'--brand-accent','#8cc63e':'--brand-secondary',
    # NOTE: #fff / #ffffff intentionally absent - white text on a coloured
    # surface (buttons, gradient headers) must stay white in both themes.
}

BG_PROPS = r'(background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|border-top-color|border-bottom-color|border-left-color|border-right-color|outline|outline-color|fill|stroke)'
FG_PROPS = r'(color|caret-color)'

HEXRE = r'(?<!&)(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\b'



# --------------------------------------------------------------------------
# Per-page reconciliation. Two pages use token NAMES that clash with the shared
# system's meaning, which is the subtlest failure mode here: Priority Leads
# defines --accent as its brand accent, while the shared system uses --accent
# for warning-orange. Stripping the page definition would silently repoint every
# var(--accent) at the wrong colour, so usages are renamed first.
PAGE_OVERRIDES = {
    'priority': {
        'rename': {
            '--accent-dark':'--brand-secondary', '--accent':'--brand-accent',
            '--primary-light':'--brand-secondary', '--primary':'--brand-primary',
            '--bg-dark':'--surface-inverse',
        },
        # black panels that carry white text must stay dark in BOTH themes
        'surface': {
            '#1a1a1a':'--surface-inverse', '#2d2d2d':'--surface-inverse',
            '#000000':'--surface-inverse', '#000':'--surface-inverse',
            '#333333':'--border-hover', '#404040':'--border-hover',
        },
    },
}


def rename_vars(text, mapping):
    """Repoint var(--x) usages. Longest name first so --accent-dark is not
    clobbered by the --accent rule."""
    out = text
    for old in sorted(mapping, key=len, reverse=True):
        out = re.sub(r'var\(\s*' + re.escape(old) + r'\s*([,)])',
                     lambda m: 'var(%s%s' % (mapping[old], m.group(1)), out)
    return out


def _map(css, table, props):
    """Replace `prop: #hex` with `prop: var(--token)` for the given property set."""
    pat = re.compile(r'(?<![\w-])' + props + r'(\s*:\s*)([^;{}"\']*?)' + HEXRE)
    def rep(m):
        prop, sep, pre, hx = m.group(1), m.group(2), m.group(3), m.group(4)
        tok = table.get(hx.lower())
        if not tok:
            return m.group(0)
        return '%s%s%svar(%s)' % (prop, sep, pre, tok)
    prev = None
    out = css
    # loop: a single declaration can hold several colours (e.g. gradients, shadows)
    while prev != out:
        prev = out
        out = pat.sub(rep, out)
    return out


def convert_styles(text, page=None):
    """Apply the colour mapping to a chunk of CSS or inline-style-bearing HTML."""
    ov = PAGE_OVERRIDES.get(page or '', {})
    surface = {**SURFACE, **ov.get('surface', {})}
    t = text
    t = _map(t, {**STATUS, **INK}, FG_PROPS)
    t = _map(t, {**STATUS, **surface}, BG_PROPS)
    return t


THEME_BOOTSTRAP = (
    "<script>(function(){var K='tlt-theme';var b=document.body;"
    "function set(m){if(m==='dark'){b.classList.remove('light-mode');}else{b.classList.add('light-mode');}"
    "var t=document.getElementById('tltThemeBtn');"
    "if(t)t.innerHTML=(m==='dark'?'&#9788; Light':'&#9790; Dark');}"
    "var saved=null;try{saved=localStorage.getItem(K)||localStorage.getItem('tlt-contacts-theme');}catch(e){}"
    "set(saved==='dark'?'dark':'light');"
    "var btn=document.createElement('button');btn.id='tltThemeBtn';btn.className='tlt-theme-toggle';"
    "btn.title='Toggle light / dark';"
    "btn.onclick=function(){var m=b.classList.contains('light-mode')?'dark':'light';"
    "try{localStorage.setItem(K,m);}catch(e){}set(m);};"
    "b.appendChild(btn);set(saved==='dark'?'dark':'light');"
    "})();</script>"
)


def strip_page_tokens(css, owned):
    """Remove the page's own definitions of tokens the shared block owns.

    Without this the page's `:root{--bg:...}` sits AFTER the injected block and
    silently wins, so the shared palette would have no effect. Tokens the shared
    block does not define (page-specific extras) are preserved.
    """
    removed = [0]

    def clean_block(m):
        sel, body = m.group(1), m.group(2)
        if '--' not in body:
            return m.group(0)
        kept = []
        for decl in body.split(';'):
            d = decl.strip()
            if not d:
                continue
            name = d.split(':')[0].strip()
            if name.startswith('--') and name in owned:
                removed[0] += 1
                continue
            kept.append(d)
        if not kept:
            return ''
        return '%s{%s}' % (sel, ';'.join(kept))

    out = re.sub(r'([^{}]*?)\{([^{}]*?--[^{}]*?)\}', clean_block, css)
    return out, removed[0]


def convert_page(html, shared_css, add_toggle=True, page=None):
    """Convert one full page template."""
    owned = set(re.findall(r'(--[a-zA-Z0-9-]+)\s*:', shared_css))
    ov = PAGE_OVERRIDES.get(page or '', {})
    if ov.get('rename'):
        html = rename_vars(html, ov['rename'])

    # 1. inject the shared block at the top of the first <style>
    m = re.search(r'(<style[^>]*>)', html, re.I)
    if not m:
        raise SystemExit('no <style> block found')
    out = html[:m.end(1)] + shared_css + html[m.end(1):]

    # 2. neutralise the page's own token definitions so the shared block wins.
    #    Scoped to <style> blocks ONLY - running the brace-matching stripper over
    #    the whole document would happily eat JS object literals.
    head = out[:m.end(1) + len(shared_css)]
    tail = out[m.end(1) + len(shared_css):]
    total = [0]

    def in_style(mm):
        inner, n = strip_page_tokens(mm.group(2), owned)
        total[0] += n
        return mm.group(1) + inner + mm.group(3)

    # the first </style> closes the block we injected into
    first_close = tail.find('</style>')
    if first_close >= 0:
        cleaned, n_first = strip_page_tokens(tail[:first_close], owned)
        tail = cleaned + tail[first_close:]
        total[0] += n_first
    tail = re.sub(r'(<style[^>]*>)(.*?)(</style>)', in_style, tail, flags=re.S | re.I)
    convert_page.stripped = total[0]

    # 3. map colours - the shared block itself must be left alone
    tail = convert_styles(tail, page)
    out = head + tail

    # 3. light-mode default + shared toggle
    if add_toggle:
        def bodytag(mm):
            attrs = mm.group(1) or ''
            if 'class=' in attrs:
                return re.sub(r'class="([^"]*)"', lambda c: 'class="%s light-mode"' % c.group(1), '<body%s>' % attrs, count=1)
            return '<body%s class="light-mode">' % attrs
        out = re.sub(r'<body(\s[^>]*)?>', bodytag, out, count=1)
        # anchor to the LAST </body>: analytics builds HTML in JS and contains a
        # literal '</body>' inside a string, so replacing the first occurrence
        # splices the bootstrap into the middle of a script and breaks it.
        i = out.rfind('</body>')
        out = (out[:i] + THEME_BOOTSTRAP + out[i:]) if i >= 0 else (out + THEME_BOOTSTRAP)
    return out


if __name__ == '__main__':
    import sys, os
    shared = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tlt-ui.css')).read()
    src = open(sys.argv[1], encoding='utf-8').read()
    res = convert_page(src, shared)
    open(sys.argv[2], 'w', encoding='utf-8').write(res)
    before = len(re.findall(HEXRE, src))
    after = len(re.findall(HEXRE, res)) - len(re.findall(HEXRE, shared))
    print('%-22s hex %3d -> %3d (%3d mapped), page tokens stripped: %d' % (sys.argv[1], before, after, before-after, getattr(convert_page,'stripped',0)))
