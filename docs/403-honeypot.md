# 403 Honeypot — doors-closing page

- Status: implemented and verified live (`/403` → 403, probes logged).
- Scope: `LogForce-Perimeter-Prototype` only.
- Files: `ui/403.html`, `ui/server.go` (`isForbidden`, `handleForbidden`),
  `vercel.json`, `.vercelignore`, `docs/403-honeypot.md` (this file).
- Related: `LogForce-Docs/INDEX.md` (Evidence), `ui/README.md` (Pages table).

## 1. What this is

A honeypot error page. When someone probes restricted paths — directory and
file busting (`/.env`, `/.git/config`, `/models/*.onnx`, `/ui/server.go`,
`*.md`, any dotfile, any directory) — the server answers with a real
HTTP 403, a raymarched closing-doors animation, a plain-language boundary
message, and safe ways back (dashboard / team / docs). Every probe is
logged as `forbidden probe ip=… path=…` for the SIEM.

## 2. Threat model — read before changing anything

A 403 page **cannot block Inspect Element, View Source, the Sources panel,
or the Network tab**. Those run in the visitor's own browser against bytes
we already chose to send. Any "no-inspect" script (right-click traps, F12
blockers, devtools detectors) is bypassed via menu → View Source, `curl`,
or remote debugging — and it breaks keyboard and screen-reader users
first. Deliberately not implemented here.

What this page **does** do:

1. Gives a lost or under-privileged user a clear boundary and a way back
   instead of a dead browser error.
2. Turns server-side probes into signal: busters' wordlists burn entries
   against a theatrical 403 while we collect probe IP + path.
3. Keeps the public surface minimal (comment hygiene, deploy allowlist,
   aggregate-only stats API — see §5).

`/api/stats` and `/api/health` were audited during this work: aggregates
only (counts, buckets, vendor/category tallies). No raw logs, no PII.

## 3. How it is wired

| Layer | Where | Behaviour |
|---|---|---|
| Page | `ui/403.html` | Self-contained (no CDN, no downloads — renders air-gapped). Doors-closing WebGL shader + `403 — Access denied` card: authenticated-but-out-of-scope copy, `Back to dashboard`, `Request access` → `team.html`, `Docs`. No contact email exists in-repo, so access requests route to the team page. |
| Go, real 403 | `ui/server.go`: `isForbidden`, `handleForbidden`, `staticRoot` | Forbidden patterns (full table §4) serve `403.html` with `WriteHeader(403)` and log the probe. Explicit `/403` and `/403.html` routes. Genuinely-missing files still 404 so their existence stays hidden. |
| Vercel | `vercel.json`, `.vercelignore` | `/403`, `/403.html` rewrites. Static rewrites always serve 200 — the real 403 status only comes from the Go server (Render/local). Global hardening headers: `nosniff`, `SAMEORIGIN` frames, strict referrer, minimal `Permissions-Policy`. `.vercelignore` keeps `models/` (58MB ONNX), `ui/server.go`, `*.md`, `.env.example`, compose/init files, and build inputs out of deploys. |
| Hygiene | `ui/dashboard-v2.html`, `ui/dashboard.html` | 113 + 105 HTML comments stripped (`BEGIN MainContainerFrame`, `V2 wire. Local only…`, per-icon narration). Zero functional change — no script parsed comments (verified: pages serve byte-identical behaviour, route guard green). |

## 4. Forbidden-pattern reference (`isForbidden`)

| Rule | Matches | Example |
|---|---|---|
| Source / module suffixes | `*.go *.mod *.sum *.md *.env *.pem *.key` | `/ui/server.go`, `/README.md` |
| VCS metadata | `/.git`, `/.git/*` | `/.git/config` |
| Any dot-segment | path part starting with `.` | `/.env`, `/.DS_Store` |
| Payload dirs | `/models`, `/output` + anything under them | `/models/vocab.txt` |
| Any directory | existing dir on disk (listing stays denied) | `/docs/` |

Everything else falls through to the static file server; missing files 404.

## 5. Run and verify

```sh
cd LogForce-Perimeter-Prototype/ui   # go.mod lives here, not the root
STATIC_DIR=. PORT=8081 go run ./server.go
```

Expected (second terminal):

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/403          # 403
curl -s http://localhost:8081/ui/server.go | head -c 15                     # <!DOCTYPE html> (doors page, 403)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/             # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/nope-xyz     # 404
python3 .github/workflows/check_routes.py                                   # routes ok: 8 pages checked
```

Open `http://localhost:8081/403` in a browser for the animation.

## 6. Animation notes (for the next person who ports a shader)

Source: freefrontend doors shader (Three.js r88 + two `s3…cdpn.io`
textures). Ported, not pasted:

- Cut: `u_mouse` (written every pointermove, never read), `u_noise`
  (downloaded, never sampled), `smin/random/cylinder/torus/plane/AO`
  helpers (uncalled); the 600KB Three.js include → ~40-line hand-rolled
  WebGL fullscreen-quad bootstrap; both CodePen downloads → the `403`
  plate is drawn at runtime on a 2D canvas through the same `plateUV`
  displacement math.
- Gotcha (found by headless-Chrome screenshot audit): Three.js silently
  prepends `attribute vec3 position` to every vertex shader. The ported
  shader must declare `attribute vec2 position;` explicitly **and** build
  `vec4(position, 0.0, 1.0)` — `vec4(vec2, float)` is a compile error.
  Without both, every browser fails compile and shows only the fallback
  gradient (a flat diagonal wash with the card on top — unmistakable).
- Kept: corridor SDF, hinge-`smoothstep` doors, embossed plate, handle
  sphere, diffuse/spec/fog lighting, `u_time += 0.01` walk.
- Guards: `pixelRatio` cap 1.5, pause on hidden tab,
  `prefers-reduced-motion` renders one static frame, no-WebGL falls back
  to gradient + identical card. Overlay buttons use transform-only
  transitions (INP-safe).

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `404 page not found` plaintext on `/403` | Stale server binary from before this change (only the old code emits that exact text) | `lsof -ti:8081 \| xargs kill`, restart per §5 |
| `go.mod file not found` | Ran from prototype root | `cd ui` first — `go.mod` lives in `ui/` |
| Flat gradient, no doors | Shader failed to compile on that GPU/browser | Read the browser console for `COMPILE:` lines; page is designed to degrade to card-on-gradient |
| Vercel `/403` returns 200 | Static rewrites can't set status (platform limit) | Expected; authoritative 403 comes from Go/Render |

## 8. Residual risks (accepted, not oversights)

- Static filenames must be public to load; View Source always works.
  Mitigation is exposure minimisation (§3–§4), not detection.
- `Request access` ends at the team page until an admin contact is defined.
- No CSP header yet: inline shaders/scripts plus Tailwind/Google-Fonts
  CDNs need a report-only rollout first; tracked as follow-up.

## 9. Changelog

- 2026-09-18: created (`403.html`, Go guard + probe logging, Vercel
  rewrites/headers/allowlist, comment hygiene, INDEX link). Fixed
  vertex-shader port bugs found by screenshot audit. Route guard 8/8.
