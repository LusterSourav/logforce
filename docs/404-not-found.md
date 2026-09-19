# 404 Not Found — watching-eyes page

- Status: implemented and verified live (missing paths → 404 + eyes).
- Scope: `LogForce-Perimeter-Prototype` only.
- Files: `ui/404.html`, `ui/server.go` (`handleNotFound`), `vercel.json`,
  `docs/404-not-found.md`.
- Related: `docs/403-honeypot.md`, `docs/401-unauthorized.md`.

## 1. What this is

The last of the trio: 401 asks who you are, 403 knows you and says no,
404 is for paths that don't exist at all. Missing assets, typos, and
busters' dead-end wordlist entries land on Hakim El Hattab's watching
eyes — 18 eyes plus one big central eye that open staggered over ~5s,
blink on their own timers, and follow the cursor. 404s are logged as
`missing path ip=… path=…` (`/favicon.ico` excluded — browsers request it
on every load and it would drown the log).

## 2. About the animation

Source: hakim.se/404 (plain HTML + CSS + canvas 2D JS, no dependencies).
Ported, not pasted:

- Kept 1:1: all 19 eye definitions (position/scale/activation), blink
  and exposure physics, iris-follow math, staggered `activationTime × 10s`
  cascade, central eye at 1s.
- Cut: the 2011 `requestAnimFrame` shim → native `requestAnimationFrame`;
  `setTimeout(initialize, 1)` → direct init (script sits at end of body,
  canvas already exists).
- Added: rebuild-on-resize (debounced 200ms; source never resized, so a
  rotated phone kept desktop coordinates); `pointermove` instead of
  `mousemove` (covers touch drag); mouse defaults to screen centre so the
  first frame isn't cross-eyed; `prefers-reduced-motion` renders one
  static frame with all eyes open.
- Added: the message card (source had none) — `404 · Not found` eyebrow,
  one line of copy, `Back to dashboard` / `Docs` / `Request access`
  buttons with transform-only hovers (INP-safe), `role="alert"`.

## 3. Server wiring

`handleNotFound` serves `404.html` with `WriteHeader(404)`. It is reached
two ways: explicit `/404`, `/404.html` routes, and any path that passes
the 401/403 guards but matches no file on disk. This replaced the old
plaintext `http.NotFound` branch for `*.go/*.mod/*.sum/*.md` — dead code
now, since `isForbidden` already catches those suffixes with a 403.

## 4. Run and verify

```sh
cd LogForce-Perimeter-Prototype/ui   # go.mod lives here, not the root
STATIC_DIR=. PORT=8081 go run ./server.go
```

Expected:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/404          # 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/nope-xyz     # 404
curl -s http://localhost:8081/nope-xyz | grep -c "fof\|Back to dashboard"   # 2
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/             # 200
python3 ../.github/workflows/check_routes.py                                # routes ok: 10 pages checked
```

Open `http://localhost:8081/404`, wait ~5s for all eyes, move the cursor —
irises track it. Vercel static serves the page on `/404` with status 200
(platform limit, same as 401/403); unmatched Vercel paths show Vercel's
own 404.

## 5. Residual risks (accepted)

- A catch-all rewrite mapping every unknown Vercel path to `404.html`
  was skipped: it would shadow `/api/*` if misordered. Revisit only with
  an explicit API-first ordering test.
