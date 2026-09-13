# PRD, Universal Log Pre-processing Framework (ULPF)

**Problem Statement:** Unified, lossless normalization of heterogeneous perimeter & enterprise logs to OCSF 4001 for SIEM/ML. 
**Organization:** ULPF Prototype Team (Perimeter slice) + Full-Stack ULPF 
**Category:** Software / Security Data Engineering 
**Theme:** Smart Automation, Log Normalization, Offline AI Classification, Observability 
**Status:** Prototype LIVE (Perimeter, today → ~1.6k lines/sec) → Final Universal (all devices + Custom ULPF-ONNX-Hyper for 1B lines/sec burst)

## 1. Product Vision

Build a log pipeline that works offline, keeps every byte, and normalizes to one
schema. Raw comes in from any device, gets parsed deterministically, classified
by a local ONNX model (or a small LLM on the VM pod for unknowns), then stored
as OCSF 4001 with `integrity` and `unmapped` so nothing is lost. From there it
lands in Hive Parquet and Postgres GIN, and shows up on the dashboard with a
fix suggestion.

The prototype handles the hard part first: perimeter firewalls, IDS and apps
(Palo Alto, Cisco ASA, FortiGate, CEF/LEEF, Suricata, Zeek, syslog, JSON, CSV,
XML) all through one pipeline. Later it widens to laptops, phones, servers,
cloud and DB, each app detected on its own, tethered to a small free-tier VM
pod. The point is one queryable event per raw line, with the fix attached.

## 2. Problem

Logs arrive as syslog, JSON, XML, CSV, CEF, LEEF, plain key=value, and
whatever the app happened to print. Time formats differ, severity names
differ, multiline traces spill across lines. Today a team writes one parser
per device, then fixes it when firmware changes. SIEM rules drift because
the input was never stable.

The raw also lives on the box that broke. A laptop service crash, a phone
ANR, a firewall NAT miss, the analyst is somewhere else at 2 AM reading a
forwarded screenshot. The gap is a pre-processing layer that:

1. captures on the device as soon as the app writes,
2. normalizes before anything hits SIEM or lake storage,
3. keeps `raw` for forensics,
4. explains what the line means and which endpoint fixes it,
5. is reachable from anywhere with a VPN toggle, like Rethink,
6. can run on a student free tier (GitHub Student Pack to Azure).

SIEM-Lite, Wazuh and Grafana handle what happens after ingest. ULPF handles
what should happen before.

## 3. Target Users

### Primary, Today (Prototype)
**SOC Analyst / Detection Engineer validating normalization on a perimeter log**
- paste or drop any raw line and see immediate OCSF/Canonical result with confidence + latency;
- no loss: `raw_event` + `sha256(canonical)` for dedup/forensics;
- one-regex onboarding for the next firewall;
- offline demo (no HF pull, no internet).

### Primary, Future (All Devices)
**Developer or student who just hit a crash at night**

Needs:
- capture without setup: Windows Event Log, macOS DiagnosticReports,
 `journald` on Linux, `logcat` and `last_crash.log` on Android,
 `sysdiagnose`/`os_log` on iOS. Per-app detection, no paste.
- one tap to connect: a Quick Settings tile (same row as Rethink) that
 WireGuards the phone to a free Azure VM pod.
- a short answer, not a raw dump: what happened, why, how bad, and which
 endpoint to hit. `POST /capture` returns that, `GET /report` shows it.
- works from hostel Wi-Fi, mobile data, behind NAT. No port forward.

### Secondary
- Threat hunters, Data engineers, ML teams needing clean features.

## 4. MVP, What the Prototype Already Does (DONE TODAY)

Six live capabilities in `ULPF-Perimeter-Prototype/`:

### 4.1 Edge Classify, Offline ONNX (42 leaves, ~5 ms), DONE
Quantized `mdbr-leaf-mt` (23 MB int8). WordPiece 128 → 3 tensors → mean-pool → 1024-dim projection (`2_Dense`) → cosine vs 42 leaves. Best >0.5 wins else `UNCLASSIFIED`. Batch 100 → 50-80 ms.
Chips: `SYSTEM.process_lifecycle`, `ERROR.dependency_error`, `REQUEST.success`, etc. Health badge `42 leaves • 5 ms • Offline`.

> **Current:** ONNX runs **only on laptop/server**, not on phone. Phone cannot load `libonnxruntime` (too large, no NNAPI). Hence future decode moves to VM pod.

### 4.2 Vector + VRL Normalization (OCSF 4001), DONE
`ingestion/vector.toml` tails `PERIMETER_LOG_PATH`, disk 2 GB `block`, VRL 3 phases: Phase 0 snapshot + `sha256`, Phase 1 single regex (plug point), Phase 2 drop < warning, Phase 3 OCSF `class_uid 4001`.

### 4.3 Storage, NDJSON + Hive Parquet, DONE
`output/normalized/*.ndjson` + `parquet_writer.py` Hive `year/month/day/class/vendor` Snappy; fallback NDJSON if `pyarrow` absent.

### 4.4 Dashboard + Go API (:8081), DONE
Single HTML + Go; `GET /api/health`, `POST /api/classify`, `POST /api/ingest?format=`, `POST /api/query`, `GET /api/stats`, static. `Classify` auto-persists → `2→3` live.

### 4.5 Dual-Write: Postgres + Search, DONE
`init.sql` `events(raw jsonb, class_uid, vendor)` GIN. Vector `search_indexer` → `/api/ingest`.

### 4.6 Parsing Bridges, DONE
`ulpf_ocsf.py` fast path + `perimeter.yml` 5 decoders hot-swap.

**MVP boundary:** perimeter only, no auto-device agents, no VM-pod small LLM yet (both exist as `maincode/auto_capture/` + `ai_solver/` stubs, see §7).

## 5. Core User Journeys

### Journey A, Paste & See (prototype, today)
```text
Drop file or paste raw log → Classify (POST /api/classify) → Auto-persist (POST /api/ingest) → Dashboard 2→3 → Query → Parquet
```

### Journey B, Vector Fleet (prototype, today)
```text
Device appends to perimeter.log → Vector tails → VRL → NDJSON + PG → same dashboard
```

### Journey C, All-Device Auto-Catch + Decode + Fix (FUTURE, the overnight hero)
```text
Every device installs one ULPF agent (one per OS, zero per app):

Laptop: Win (Event Log tail) / macOS (DiagnosticReports tail) / Linux (journald) → ULPF agent
Mobile: Android Tile tap / iOS Shortcuts action / auto-crash handler → raw capture
Server/Firewall: Vector file source (already done)
Per-app auto-detect: agent fingerprints source via header/prefix (e.g., OuterTune: → tag outer_tune, ASA: → cisco_asa), no user picks format.

 ↓ (auto, no paste)

WireGuard tunnel auto-connects on Tile tap (like Rethink in your screenshot)
 Phone QS tile "ULPF" → VpnService → WireGuard handshake → Azure free VM pod (see §7.3)
 From anywhere: hostel, 4G, campus NAT, no public IP, no manual VPN app.

 ↓ POST /capture {log, source:"phone", device:"pixel-7", app:"outer_tune"} ≤4096 chars, dedup sha16

VM Pod decodes (NOT phone):
 auto_capture/server.py:8002 → miner/miner_service.py:8001 → Drain3 template
 → auto_search_problem() keyword hint
 → ai_solver (Ollama localhost:11434) small GB model (see §7.2) → OCSF mapping → rule synthesis
 → Response: {what, why, severity, fix_endpoint, one_liner_curl}

 ↓

Phone toast + Dashboard: "OuterTune Source Error 2000, Auth token expired, FIX: POST /api/token/refresh on pod 10.0.0.5:8002 → [Copy curl] [Open fix]"
At 2 AM you tap Copy, it hits the endpoint, DONE. No panic.
```

## 6. MVP Success Criteria (today)

1. `go run./ui/server.go`, open `dashboard.html`, `GET /api/health` shows `leaves:42`.
2. Paste CEF → `REQUEST.success`, ASA → `ERROR.connection_failure`, see `2→3` live.
3. `POST /api/query` prune, Parquet promotion, `vector test` pass.

### Future success (all-device)
4. Install Android APK → QS tile appears beside Rethink/Orbot (your screenshot) → tap → `connected to Azure pod 20.193.x.x`.
5. Kill a test app → crash auto-saved → tile tap → VM returns `what/why/fix` in <2s on mobile data.
6. Same for a laptop `journalctl` line and a firewall syslog, all arrive as OCSF `class_uid 4001` with `source` auto-detected.

### Core validation question

> **Can any new log, on any device, be auto-caught with zero paste, appear as queryable OCSF 4001 with a plain-English fix and a copyable endpoint, via one tap from anywhere in the world for ₹0?**

## 7. Future Architecture, All Devices + Free VM + Small LLM Pod

### 7.1 Device Fleet, Auto-Catch Every App
| Device | Agent | How it auto-detects | Log path |
|---|---|---|---|
| Windows laptop | ULPF Win service | ETW + Event Log subscription per provider (auto tag) | `EventLog → Vector file source` |
| macOS laptop | launchd tail | `~/Library/Logs/DiagnosticReports` + `os_log` stream | `vector/vector.toml` include |
| Linux laptop/server | systemd tail | `journald` + `logs/*.log` | `Vector tail + multiline` |
| Android | APK + `TileService` (see Design) | `logcat` tail via Shizuku (or app crash file `filesDir/last_crash.log`), `packageName` → `source` auto | `POST /capture` |
| iOS | Shortcuts + Share Extension | `os_log` collect, `burst` → `POST /capture` (iOS no tile; Shortcuts action) | `POST /capture` |
| Firewall/IDS | Vector (already) | header/prefix regex Phase 1 | `PERIMETER_LOG_PATH` |
| Any custom app | SDK one-liner | `ULPF.log("msg")` wrapper → same `POST` | HTTP |

No per-app config. Header fingerprint in `normalize_outertune.vrl: Phase 1` and `sampler.py` tag it.

### 7.2 VM Pod, small model that fits (ONNX stays on pod)

Phones cannot run the ONNX model (23 MB plus 58 MB of embeddings and
runtime) and an LLM at the same time.

- ONNX stays on the pod: `mdbr-leaf-mt` answers `POST /api/classify` in
 about 5 ms, just over the tunnel instead of locally.
- unknown handling moves to the pod: `ai_engine.py` calls
 `http://localhost:11434` (Ollama, never cloud).

Small models that work locally (disk, then RAM about 1.3x):

| Model | Disk | RAM | When to use it |
|---|---|---|---|
| `qwen2.5:0.5b-instruct` | 0.52 GB | ~1 GB | Default on a 2 GB student VM. Fast, valid JSON, 32k context. |
| `llama3.2:1b-instruct` | 1.32 GB | ~2 GB | B1ms or B2s, better reasoning |
| `gemma2:2b-it` | 1.64 GB | ~3 GB | VM 4 GB or more |
| `phi3:3.8b-mini-4k` | 2.18 GB | ~4 GB | 8 GB pod, best at writing VRL |

Default is `qwen2.5:0.5b` (add `ollama/ollama:0.5.7` in
`offline/image-list.txt`). Swap with `SOLVER_OLLAMA_MODEL`, no code change.

Validated path (10 steps) `pipeline.py:145`: sampler dedup, sanitizer (21
redact rules plus 9 injection patterns, nonce-split), then sanitized text
only to the model, OCSF 4001 mapper, 10 validator checks, tester
(match at least 0.8, false positives at most 0.1), Git PR, loader sentinel.
Raw and secrets never reach the model.

### 7.3 Anywhere Connect, Rethink-Style Button via Free Azure VM

**Your screenshot = our target.** Rethink adds a QS tile via `VpnService` + `TileService`. ULPF will add **the same row**: `Refresh Connection, Rethink, Orbot, ULPF`.

**Azure for ₹0 (GitHub Student Pack):**
- Claim `education.github.com/pack` → Azure for Students **$100 credit (no CC for $100)** + 12 months free.
- Create **B1s (1 vCPU, 1 GB RAM, 750 hrs/month free for 12 mo)** or **B1ms (1 vCPU, 2 GB)**, enough for `qwen2.5:0.5b` + Vector + Miner + Loki stack (tuned to ~1.4 GB idle). Upgrade to B2s (2 vCPU/4 GB) with credit if using 2B+ model.
- Assign static public IP (free while VM running), NSG inbound `51820/udp (WireGuard)`, `8002/tcp (auto_capture via tunnel, not public)`; outbound 443 for GitHub mirror only.

**WireGuard tunnel (Rethink-style, no manual VPN app):**
- VM runs `wg-quick@wg0` (10.0.0.1/24). Android APK embeds `wireguard-android` tunnel, tile tap = `wg-quick up` handshake (handshake <100 ms). iOS uses WireGuard App config.
- Laptops run `wg-quick` or Tailscale sidecar. Firewall Vector can also use mTLS.
- Result: device gets `10.0.0.x` inside pod network, `POST https://10.0.0.1:8002/capture` works from hostel/metro/4G, **no public ingress for logs**, no port-forward, no domain.

**Setup one-liner (student):**
```bash
az vm create -g ulpf-rg -n ulpf-pod --image Ubuntu2204 --size Standard_B1s --admin-username azureuser --generate-ssh-keys
az vm open-port -g ulpf-rg -n ulpf-pod --port 51820 --priority 100
# on VM: curl -fsSL https://get.docker.com | sh && docker compose -f maincode/docker-compose.yml up -d
# on phone: install ULPF.apk → QS → Add Tile ULPF → tap → Connected
```

Alternatives: Oracle Always Free `VM.Standard.E2.1.Micro` (1 OCPU, 1 GB, forever) or Google Cloud free `e2-micro`; but Azure packs with the pack.

### 7.4 Decode → Fix, No Panic at Night

| Stage | What you see | Endpoint to hit |
|---|---|---|
| **Raw** | `E OuterTune Source Error 2000` | `logs/auto_captured.log` |
| **Template** | `E OuterTune Source Error <NUM>` (Drain3 `cluster_id`) | `GET /report → template` |
| **What** | `Source token expired`, `sanitizer` + AI summary | `GET /report` or Grafana Loki |
| **Why** | `Auth failure 2000, firewall allow-list missing` | `auto_search_problem()` hint → Ollama cause |
| **Fix** | `POST /capture/launch hint: check token and allow-list` + copyable `curl -X POST http://10.0.0.1:8002/capture -d '{"log":"refresh"}'` or firewall `POST /api/allow` | **Fix endpoint** rendered as button: `[Copy fix curl]` `[Open Grafana]` `[Create Git PR for rule]` |
| **Proof** | `integrity.sha256` + `unmapped.raw_event` + `Stored as NDJSON Hive` | `POST /api/query` |

The phone toast shows truncated fix; full report has the exact curl/URL to paste. No SSH at 3 AM.

## 8. Out of Scope (still deferred)

- Full SIEM correlation (Storm) in prototype folder; national-scale marketplace; PII-rich mobile logs beyond crash/logcat (user opt-in only).

## 9. Non-Functional Requirements

- Air-gap capable: baked `models/*` + `SHA256SUMS` + `offline/offline-prepare.sh` tar + skipped HF pull.
- Latency (prototype): warm single ~5 ms; batch 100 → 50-80 ms (~1.6k/sec per instance), measured `health.latencyMs`.
- Latency (future Hyper): single GPU `qwen2.5:0.5b` decode 0.8-2 s, but classify path `ULPF-ONNX-Hyper` 4L/256d/int4 + HNSW → ~45k/sec (A10G) / 120k/sec (H100) per GPU, dynamic batch 512, seq 64.
- Lossless + dedup: `sha256(canonical)` + `auto_capture/capture.py: dedup sha16 window 200` + 10 MB rotate.
- Offline decode budget: `qwen2.5:0.5b` <1 GB RAM; Hyper ONNX 9-11 MB (int4/int8), runs on VM pod, never on phone.
- Battery: tile tap on-demand, Shizuku non-polling, cap 4096 chars.

### 9a. Throughput, Ground Reality (2-6 honest)

| Reality check | Value | Source |
|---|---|---|
| Prototype measured | 100 lines / 60 ms → 1.6k/sec/instance (CPU 4 threads) | `ui/server.go` + `lumber` bench |
| 1B/sec needed instances (CPU) | 625,000 instances → impossible on 1 VM | 1e9 ÷ 1.6k |
| 1B/sec with Hyper GPU | 833× H100 (120k/sec each) or 22k× A10G, 1000-partition Kafka, 10-sec burst only | Architecture §14 math |
| Cost of 1B burst (10 sec) | $10-20k (800 H100 × $3/hr ÷360), **demo slide only** | Azure NC pricing |
| Real prod target | **100k-1M/sec sustained on 1-10 GPUs**, already > any SIEM | Honest claim for Prd |
| Storage at 1B/sec | 86 PB/day at 1 KB/line → must sample 1% raw, 100% OCSF counts | Not sustainable 24/7 |

- Battery: tile tap is on-demand, not polling; `logcat` tail is Shizuku non-polling; capture cap 4096 chars.

> **Do not claim "1B/sec on one free VM".** Claim "1B/sec 10-sec burst on sharded fleet (800 H100, Kafka 1000 partitions); single GPU does 120k/sec; free VM does 1.6k/sec; prod target 100k-1M/sec".

## 10. Product Principle

> **Do not build another SIEM. Build the one auto-catcher that explains every log on every device and hands you its fix.**

## 11. Endpoint Contract, Prototype + Future Auto-Capture

### Prototype (still live, `ULPF-Perimeter-Prototype/ui`, 42 leaves, ~1.6k/sec)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/health` |, | `{"status":"ok","model":"mdbr-leaf-mt","taxonomyLeaves":42,"latencyMs":float}` |
| POST | `/api/classify` | `{"logs":[...]}` | `{"events":[{type,category,severity,timestamp,summary,confidence,raw}],"latencyMs":float}`, Hyper will add `model:"ulpf-onnx-hyper-4L-256d"` + `gpu:true` |
| POST | `/api/ingest[?format=]` | NDJSON | `{"ingested":int,"file":str}` |
| POST | `/api/query` | `{"sql":"…WHERE class_uid=4001"}` | `{"prune":{…},"rows":[…]}` |
| GET | `/api/stats` |, | `{"total_events","normalized","rate","sources","buckets",…}` |
| gRPC | `ulpf-onnx-hyper:50051/Classify` | `ClassifyRequest{logs, batch:512, seq_bucket:64}` | `stream ClassifyResponse`, Hyper only, 45k/sec (A10G) / 120k/sec (H100), dynamic batching |

> **Custom Hyper endpoint** is not in prototype `server.go:154`; it lives in `maincode/vector/onnx-hyper/server.go` (future) with ORT CUDA/TensorRT EP, HNSW 400 leaves, PQ-64.

### Future auto-capture (`maincode/auto_capture/server.py:8002`, via WireGuard)

| Method | Path | Request | Response | Device |
|---|---|---|---|---|
| GET | `/health` |, | `{"status":"ok","capture":"ready","vm":"offline-ai localhost:11434"}` | all |
| POST | `/capture` | `{"log":"…≤4096","source":"phone"/"laptop"/"firewall","device":"pixel-7","app":"outer_tune"}` | `{"status":"captured|deduped","template":str,"change":str,"hint":str, "fix_endpoint"?:string, "curl"?:string}`, **the midnight fix** | any |
| POST | `/capture/image` | `multipart image ≤10 MB` | `{"status":"captured","ocr":str}`, VM OCR via `pytesseract` (phone never OCRs) | phone screenshot |
| POST | `/capture/launch` | `{"log":"launch","source":"phone"}` | `{"status":"launch","recent":str}`, tails `logs/outertune/outertune.log` | phone open |
| GET | `/report?limit=20` |, | `{"recent":[log…],"clusters":int,"hint":"open Grafana 3000"}`, for phone toast | all |
| POST | `/parse` (miner) | `{"log":"…"}` | `{"template":str,"params":[…],"change_type":str,"cluster_id":int}`, Drain3 | internal |
| *Fix* | `POST` (per hint) | e.g. `POST /api/token/refresh` or `POST /api/allow` | `{"fixed":true}`, endpoint surfaced in `hint`/`curl` of `/capture` response | varies |

**Midnight smoke:**
```bash
# on Azure free VM (after pack claim):
docker compose -f maincode/docker-compose.yml up -d && ollama pull qwen2.5:0.5b
# on phone (anywhere):
curl -k https://10.0.0.1:8002/capture -H 'Content-Type: application/json' \
 -d '{"log":"E OuterTune Source Error 2000","source":"phone"}' | python -m json.tool
# → {"hint":"Auth failure 2000, check token and firewall allow list",
# "fix_endpoint":"POST https://10.0.0.1:8002/capture/launch",
# "curl":"curl -X POST https://10.0.0.1:8002/capture -d '{\"log\":\"refresh\"}'"}
```
