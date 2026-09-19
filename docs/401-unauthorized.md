# 401 Unauthorized — falling-cow page

- Status: implemented and verified live (`/login` → 401, probes logged).
- Scope: `LogForce-Perimeter-Prototype` only.
- Files: `ui/401.html`, `ui/server.go` (`isUnauthorized`,
  `handleUnauthorized`), `vercel.json`, `docs/401-unauthorized.md`.
- Related: `docs/403-honeypot.md` (sibling page), `LogForce-Docs/INDEX.md`.

## 1. What this is

401 means "we don't know who you are" (missing/expired session), while 403
means "we know you, no". So the honeypot is split by intent:

- **401** → auth-looking probes: `/admin`, `/login`, `/wp-admin`,
  `/wp-login`, `/phpmyadmin` and paths under them. "This door exists —
  who are you?" The cow falls into the auth well; the probe is logged as
  `unauthorized probe ip=… path=…`.
- **403** keeps source/secret busting (`*.go`, `.env`, `/models`, …).

No login page exists yet, so every 401 today is either a buster or a lost
user. Both get the same page: the falling-cow animation, a plain-language
line, and working buttons (`Go Home` → dashboard, `Request access` →
team page).

## 2. Auth handoff (read when login lands)

`isUnauthorized` in `ui/server.go` owns the path list. The day a real
`login.html` (or `/admin` console) ships:

1. Delete its path from the `exact`/`pre` lists so it serves normally.
2. Repoint the cow page's `Go Home` button at it if sign-in becomes the
   primary action.
3. Keep the buster patterns (`/wp-*`, `/phpmyadmin`) on 401 forever —
   those consoles will never exist here.

## 3. About the animation

Source: freefrontend cow-falling pen (Pug + SCSS, pure CSS3 — no JS, no
WebGL, nothing to fail at runtime). Ported, not pasted:

- Pug → static HTML (cow/head/face, 4 legs, tail, well, 2 buttons,
  text box). SCSS `&`-nesting → flat CSS selectors. The `box-sizing:
  border` typo in the source is fixed to `border-box`.
- Kept 1:1: walk-in → tip-over → sink timeline (`move` 2s), swinging
  buttons (`btnAnim` 4s), dropping `401` text (`textAnim` 3.6s), infinite
  leg-kick/jitter/tail idle.
- Changed: home button repointed from the author's CodePen to
  `dashboard-v2.html`; added `Request access` → `team.html` (positioned
  below it, above the well lip via `z-index:120` so it stays clickable);
  copy adapted (`we don't know who you are yet...`); `body{margin:0}`
  added for full-bleed; `Cabin Sketch` loaded from Google Fonts
  (dashboard precedent) with Georgia/serif fallback so air-gap renders.
- Guards: small-screen `@media (max-width:700px)` root bump (the
  `0.75vw` scale would shrink the cow to ~88px on phones);
  `prefers-reduced-motion` disables all animation — base styles already
  equal the end state (cow in well, text visible), so nothing looks broken.

## 4. Run and verify

```sh
cd LogForce-Perimeter-Prototype/ui   # go.mod lives here, not the root
STATIC_DIR=. PORT=8081 go run ./server.go
```

Expected:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/401          # 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/login        # 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/wp-admin     # 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/             # 200
python3 ../.github/workflows/check_routes.py                                # routes ok: 9 pages checked
```

Open `http://localhost:8081/401` and watch ~4s: cow walks in, falls,
text drops, buttons swing in.

## 5. Residual risks (accepted)

- Vercel static rewrites serve 200; authoritative 401 comes from Go/Render.
- No session system exists, so 401 vs anonymous can't be distinguished
  yet — everything unknown is treated as unauthenticated. Correct until
  auth lands (§2).
