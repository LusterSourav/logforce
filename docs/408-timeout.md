# 408 Request Timeout — hourglass physics game

- Status: implemented and verified live (`/408` → 408, game playable).
- Scope: `LogForce-Perimeter-Prototype` only.
- Files: `ui/408.html`, `ui/lib/matter.min.js`, `ui/server.go`
  (`handleTimeout`, `ReadHeaderTimeout`), `vercel.json`,
  `docs/408-timeout.md`.
- Related: `docs/403-honeypot.md`, `docs/401-unauthorized.md`,
  `docs/404-not-found.md`.

## 1. What this is

408 means the client was too slow. The face for it is an hourglass
physics game: tilt the broken hourglass with the slider, keep the sand
inside, get 110 grains through the neck before the 11-second clock runs
out. Too slow and time runs out — the joke is the status code.

## 2. About the port

Source: CodePen Vue + p5 + Matter.js pen. Ported, not pasted:

- Cut: Vue → ~30 lines vanilla JS (slider binding, countdown, message,
  restart — all it ever did). Cut: p5 → Matter's own `Render` plus one
  `requestAnimationFrame` rotate loop (p5 drew nothing but `clear()`).
- Kept 1:1: both pixel-wall arrays, 110 grains, sensor/win/floor-lose
  logic, 11s limit, first-move-starts-clock, all CSS/timings, VT323 with
  monospace fallback (dashboard precedent).
- Fixed while porting: `reload(true)` (deprecated) → plain reload;
  debounced resize rebuild (source kept desktop physics after rotation);
  `pointermove` instead of `mousemove` (touch drag); mouse defaults to
  screen centre; `prefers-reduced-motion` freezes on frame one with a
  note — a physics game has no other honest reduced form, and the timer
  is guarded so it never starts.
- Single dependency: `ui/lib/matter.min.js` (0.19.0, MIT, 80KB),
  vendored so the page renders **air-gapped**. Verified bootable via
  `node` (`Engine.create()` runs headless).

## 3. Server wiring

- Explicit `/408`, `/408.html` routes serve the page with
  `WriteHeader(408)` (`handleTimeout`, logged).
- `ReadHeaderTimeout: 10s` on the `http.Server` is real slowloris
  hardening: slow-header clients get cut, with zero behaviour change for
  normal traffic (dashboard polls land in milliseconds). Go closes timed-
  out connections rather than serving the page — the page stays the face
  of slowness; per-request 408 middleware waits for the auth work.

## 4. Run and verify

```sh
cd LogForce-Perimeter-Prototype/ui   # go.mod lives here, not the root
STATIC_DIR=. PORT=8081 go run ./server.go
```

Expected:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/408          # 408
curl -s http://localhost:8081/408 | grep -c "canvas_container\|matter.min"  # 2
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/             # 200
python3 ../.github/workflows/check_routes.py                                # routes ok: 11 pages checked
```

Open `http://localhost:8081/408`, drag the Controller slider: the clock
starts, the hourglass tilts, sand flows. Vercel serves the page on
`/408` with status 200 (static-rewrite limit, same as 401/403/404).

## 5. Residual risks (accepted)

- Difficulty is source-faithful, not playtested — retune only with
  evidence (all 110 grains must pass; the neck sensors are generous).
- No per-request 408 kill on slow `/api` bodies yet; tracked with auth.
