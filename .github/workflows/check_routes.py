"""Route guard helper: every local page or asset linked from ui/*.html must
resolve on Vercel through either a vercel.json rewrite or a static file path.
Run from the repo root. Exits 1 listing offenders, else prints ok."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

vercel = json.loads((ROOT / 'vercel.json').read_text())
routes = {r['source'] for r in vercel.get('rewrites', [])}
static = {'/'}
for p in ROOT.rglob('*'):
    if '.git' in p.parts or '.vercel' in p.parts:
        continue
    if p.is_file():
        static.add('/' + p.relative_to(ROOT).as_posix())

errs = []
pages = sorted((ROOT / 'ui').glob('*.html'))
link_re = re.compile(r'''(?<![\w-])(?:href|src)\s*=\s*["']([^"'#]+)["']''')
for page in pages:
    for m in link_re.finditer(page.read_text()):
        link = m.group(1).strip().split('?')[0]
        if not link or link.startswith(('http://', 'https://', 'mailto:', 'data:', '//')):
            continue
        cands = [link] if link.startswith('/') else ['/' + link, '/ui/' + link]
        if not any(c in routes or c in static or c.startswith('/api/') for c in cands):
            errs.append(f'{page.name} links {link} with no vercel route or static file')
if errs:
    print('\n'.join(errs))
    sys.exit(1)
print(f'routes ok: {len(pages)} pages checked')
