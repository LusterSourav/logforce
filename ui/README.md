# ui
Dashboard and Go API for perimeter prototype. Dashboard is a single HTML file. Server wraps the 23 MB ONNX.

Open `dashboard.html` directly if you only need the mock. Run the Go server for real 5 ms inference.

```bash
# from this folder
go run server.go
# open http //localhost/dashboard.html
# or http //localhost/api/health
```

Env
- LUMBER_MODEL_DIR defaults to ./models or ../models. Put the quantized ONNX there.
- PORT defaults to 8081
- STATIC_DIR defaults to .

## Pages

| File | Port | Purpose |
|---|---|---|
| `dashboard.html` | 8081 | Production dashboard (DO NOT EDIT) |
| `dashboard-v2.html` | 8082 | Dev dashboard with backend wiring |
| `analytics.html` | 8082 | Analytics command view — KPIs plus threat mix plus review queue |
| `events.html` | 8082 | Event firehose browser with filters plus saved views plus bookmarks |
| `bookmarks.html` | 8082 | Saved events plus saved views, browser local only, zero network |
| `docs.html` | 8082 | Device documentation browser |
| `team.html` | 8082 | Team profile page — "Just Bored Vol. 3" design |

## team.html — Design Notes

Matches the "Just Bored Vol. 3" reference (freefrontend.com). Dark `#121212` background, three `article.post` cards in a grid layout:

- **Left side**: small square avatar (80×80), decorative serif name (`Hello Bonia Serif` 3rem), post actions bar (link icon, date, close button), lorem ipsum content card
- **Right side**: arch-framed photo (250×400px, `border-radius:200px 200px 0 0`), two star decorations (bottom corners), purple gradient overlay that slides up on hover, info text reveals unblurred on hover, photo darkens to `brightness(10%)`
- **Bottom**: purple contact bar with 6 icons (profile, email, archive, projects, search, bookmarks) — icons scale up on hover

### CDN Dependencies
- `bootstrap-icons` (cdn.jsdelivr.net)
- `Hello Bonia Serif` (fonts.cdnfonts.com)

### Team Members
| Name | Photo | Role |
|---|---|---|
| Sourav Rajak | `sourav.png` | Staff Engineer |
| Soham Chakraborty | `soham.jpeg` | Team Lead |
| Swarnadeep Roy | `swarnadeep.jpeg` | System Designer |
| Souvik Das | `souvik.jpeg` | QA & System Testing |
| Shreyasee Sahoo | `shreyasee.jpeg` | Multimedia Specialist |
| Soumita Chatterjee | `soumita.jpeg` | Product Evangelist |

## dashboard v2 pipeline notes

Paste box, output panel, drop banner, and action buttons carry fixed ids
(`pipe-input`, `pipe-out`, `pipe-drop`, `btn-classify`, `btn-batch`,
`btn-clear`, `btn-copy`, `btn-download`). Script lookup uses those ids
directly. Text search discovery is retired because ancestor text matches
once replaced the whole pipeline card with output.

Classification runs in two tiers. Vendor perimeter lines match a
deterministic router with fixed scores. All other lines run the ONNX
cosine path. Scores below 0.5 fall back to unknown. Fixed router scores
are 0.93 standard, 0.95 metadata, 0.97 critical, 0.2 unknown. Model
scores are raw cosines, so the two kinds share one number with
different meaning.

Ingest writes files always and Postgres when `PG_DSN` is set. Stats
and query read Postgres first with file fallback and never mix both.

## Notes

The sidebar is the same on the dashboard, analytics, events and bookmarks
pages, with the current page highlighted. The route guard workflow checks
links on every push, so this list stays in sync with vercel rewrites.

Bookmarks and saved views never leave the browser. They live in
`logforce.bookmarks.v1` (200 max) and `logforce.views.v1` (20 max).
You save them from the Events page and manage them on the Bookmarks
page. Export pulls both into a single JSON file. Import merges by id,
so nothing gets duplicated.

One house rule in this folder. Keep code comments plain.
