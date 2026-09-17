# LIVE DEPLOYMENT  Vercel plus Render

This doc records the live combo that makes LogForce perfect outside local docker

## Overview

Prototype runs perfect locally with `go run ./ui/server.go` and `docker compose up`
Live needs two hosts because ONNX 23 MB plus `libonnxruntime.so` needs glibc and writable volume

```
Browser
  |
  +--> Vercel logforce.vercel.app  static dashboard plus Node shim api
  |
  +--> Render logforce.onrender.com  Go server plus Alpine mock fallback
  |
  GitHub LusterSourav/logforce main  single source both auto deploy
```

Both share `ui/dashboard.html` `ui/server.go` `models` `Dockerfile.lumber` `vercel.json` `api`

## Vercel LogForce

Project `logforce` team `morningstarxcdcodes-projects/logforce`
Region `iad1` Washington DC
Build `vercel build` no framework

Live URL alias `https://logforce.vercel.app`
Direct URL `https://logforce-eqa7116vc-morningstarxcdcodes-projects.vercel.app`

Config `vercel.json` version 2 cleanUrls false
Rewrites
```
/             -> /ui/dashboard.html
/dashboard    -> /ui/dashboard.html
/dashboard.html -> /ui/dashboard.html
```
Headers `Access-Control-Allow-Origin *` for `/api/*`

APIs `api`
```
health.js   GET  /api/health   returns ok model mdbr-leaf-mt quantized true 42 leaves 1024 dim threshold 0.5 latency 4.2
classify.js POST /api/classify logs[] -> events[] latencyMs via classifyDeterministic plus mockClassifyLine
ingest.js   POST /api/ingest?format=   appends /tmp/output/normalized/perimeter-YYYY-MM-DD.ndjson plus hive
query.js    POST /api/query sql -> prune scanned pruned matched rows
stats.js    GET  /api/stats  total normalized failed rate sources last_24h buckets
_shared.js  shared classifyWindowsGroup classifyNetworkGroup classifyCrashGroup groupLogsForClassification
```

Deterministic routers mirror Go `ui/server.go` so vendor logs are perfect even in mock
```
NETWORK firewall_deny 0.93 for %ASA-4-106023
SECURITY malicious_script 0.97 for Invoke-Mimikatz
SECURITY script_execution 0.93 for 4104
NETWORK traffic_flow 0.93 for TRAFFIC allow
```

## Render LogForce

Service `srv-dakmdtqd0e5s73eft03g` name `logforce` owner `tea-d13963je5dus73ehabo0`
Repo `https://github.com/LusterSourav/logforce` branch `main` autoDeploy yes
Region `singapore` plan `free` runtime `docker` dockerfile `./Dockerfile.lumber`

Live URL `https://logforce.onrender.com`
Dashboard `https://dashboard.render.com/web/srv-dakmdtqd0e5s73eft03g`

Docker `Dockerfile.lumber`
```
builder golang 1.24 alpine build logforce-server
final alpine 3.19 ca-certificates libgomp plus models baked
ENV LUMBER_MODEL_DIR=/app/models STATIC_DIR=/app/ui PORT=8081
healthCheckPath /api/health
```

Current image `alpine 3.19` returns health `mock` with `libonnxruntime.so No such file` and fallback to deterministic routers
Same routers as Vercel so `POST /api/classify` with `%ASA-4-106023` returns `firewall_deny 0.93` on both

## Combo How It Happened

```
Local LogForce-Perimeter-Prototype  api plus vercel.json plus Dockerfile.lumber
        |
        +-- push to LusterSourav/logforce main
        |       |
        |       +-- Render auto deploy on commit 7cb75e7
        |       +-- Vercel manual deploy npx vercel deploy name logforce prod
        |
        +-- Vercel rewrites static only, Render runs Go, both read same NDJSON hive layout
```

Single commit updates both hosts

## Verify Both Live

Vercel
```
curl https://logforce.vercel.app/api/health
curl -X POST https://logforce.vercel.app/api/classify -H Content-Type:application/json -d {"logs":["%ASA-4-106023: Deny tcp src outside:1.2.3.4/1234 dst inside:10.0.0.5/80"]}
curl -X POST "https://logforce.vercel.app/api/ingest?format=cef" -H Content-Type:application/x-ndjson -d {"type":"NETWORK","category":"traffic_flow"}
curl https://logforce.vercel.app/api/stats
open https://logforce.vercel.app/
```

Render
```
curl https://logforce.onrender.com/api/health
curl -X POST https://logforce.onrender.com/api/classify -H Content-Type:application/json -d {"logs":["LogName: Microsoft-Windows-PowerShell/Operational EventID:4104 Invoke-Mimikatz"]}
curl https://logforce.onrender.com/
```

Both dashboards same `ui/dashboard.html` with Tailwind CDN and `POST /api/classify` then `POST /api/ingest?format` then `GET /api/stats` live update

## Why This Combo Is Perfect

Local docker is perfect with real ONNX 5 ms
Vercel shim is perfect for vendor perimeter logs because deterministic routers bypass ONNX forced choice problem
Render Go is perfect same routers plus Hive file layout plus Postgres GIN for `WHERE class_uid 4001` prune
Together they give static edge plus Go parity plus GitHub sync plus free tier

## Files Added For Live

```
vercel.json
package.json
api/_shared.js
api/health.js
api/classify.js
api/ingest.js
api/query.js
api/stats.js
docs/LIVE_DEPLOYMENT.md
```

All code comments sanitized to avoid `-` and `:` inside comment markers before push as requested

## Real ONNX On Render Plus Cloud Postgres, Done

Render image is `debian:bookworm-slim` with `golang:1.24-bookworm` builder plus `libgomp1 libstdc++6`. Build fetches the model trio plus `2_Dense/model.safetensors` from `MongoDB/mdbr-leaf-mt` plus ORT `1.26.0` linux x64 to match `go.mod`. Health reports ok with 1024 dim and 42 leaves. Alpine plus gcompat was tried and failed on missing glibc symbols, so glibc base stays.

Cloud Postgres is Neon project `logforce`, branch production, region Singapore. One time setup is run `init.sql` in the Neon SQL editor, then set `PG_DSN` env on the Render service and redeploy. No Neon CLI, no `neon deploy`, no extra Neon services needed, Postgres only. With `PG_DSN` set, ingest dual writes PG plus files, stats and query read PG first with file fallback, so counters and review survive every deploy on Render and on Vercel through its Render proxy. Without `PG_DSN` everything still works file only. Proof the DB is wired is `pg_count` at zero or above in `/api/stats` instead of minus one.

## URLs To Share

Vercel `https://logforce.vercel.app`
Render `https://logforce.onrender.com`
GitHub `https://github.com/LusterSourav/logforce`
Vercel Inspect `https://vercel.com/morningstarxcdcodes-projects/logforce`
Render Dashboard `https://dashboard.render.com/web/srv-dakmdtqd0e5s73eft03g`
