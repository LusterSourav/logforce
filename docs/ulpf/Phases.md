# Phases, ULPF

## Guiding Principle

Ship one complete ingest→classify→store→query→dashboard loop for perimeter, then widen to universal without changing the OCSF contract.

---

## Phase 0, Freeze the Perimeter MVP

### Goal
Remove ambiguity before expanding.

### Tasks
- confirm 5 device families (Palo Alto, ASA, FortiGate, CEF, Suricata/Zeek) + 6 generic (syslog/JSON/CSV/XML/LEEF/ULPF OCSF);
- confirm 42 leaves sufficient for demo;
- confirm OCSF 4001 envelope (integrity + unmapped);
- freeze `vector.toml` + `normalize_perimeter.vrl` Phase 1 plug point;
- define success (paste→classify→ingest 2→3 live).

### Deliverable
Approved prototype spec (Prd/Architecture/Design locked in this docs folder).

---

## Phase 1, Data Foundation (Already Done in Prototype)

### Goal
Clean, versioned perimeter lake.

### Tasks
- ingest `perimeter.log` via Vector file source (multiline, 2 GB disk block);
- normalize via VRL 3 phases;
- produce `output/normalized/perimeter-*.ndjson`;
- convert via `storage/parquet_writer.py` to Hive `year/month/day/class=4001/vendor=…`;
- mirror to Postgres `events` (GIN on `raw`).

### Processing
- trim + `sha256(canonical)`;
- regex extraction (Phase 1 only);
- severity mapping `severity_id` → name;
- metadata `product.vendor_name` → `vendor`.

### Deliverable
Reproducible normalized NDJSON + Hive. `vector test` passes.

---

## Phase 2, Edge Classify + Dashboard

### Goal
Make any raw line understandable in ~5 ms.

### Tasks
- Go `ui/server.go`: load `models/model_quantized.onnx` once, pre-embed 42 leaves, warm latency;
- expose `GET /api/health`, `POST /api/classify`, `POST /api/ingest`, `POST /api/query`, `GET /api/stats`;
- `ui/dashboard.html` drop/paste, `Classify`, chips, Canonical NDJSON, Copy/Download, format menu `?format=`;
- wire `doClassify` → auto `POST /api/ingest` → `GET /api/stats` instant refresh;
- stub `Total Sources` 6 → `stats.sources` live; `Ingest Activity` buckets from `stats.buckets_*`.

### Deliverable
User can paste any perimeter log and see type/category/confidence + KPI move.

---

## Phase 3, Bridge to Search

### Goal
Normalized data usable by existing detection stacks without rewrite.

### Tasks
- `parsing/ulpf_ocsf.py` lift OCSF 4001 + lumber shape to `NormalizedEvent`;
- `parsing/decoders/perimeter.yml` 5 hot-swap decoders;
- `init.sql` indexes; `docker-compose.yml` `ulpf-server` + `postgres-alpine`;
- Vector `search_indexer` HTTP sink → Go ingest; optional ES mirror commented.

### Deliverable
`parse(content)` claims ULPF NDJSON; Wazuh `GET /decoders?decoder=perimeter` active.

---

## Phase 4, Query & Observability Slice

### Goal
Prove pruning & health.

### Tasks
- `POST /api/query` Hive glob prune + PG count;
- `GET /api/stats` 12×2h buckets;
- `ulpf-dashboard.json` (branch grafana) counters; miner metrics baseline.

### Deliverable
Queries prune 90% files on `WHERE class_uid=4001`; dashboard replicates file + PG counts.

---

## Phase 5, Integration + Live Demo

### Goal
Turn modules into one offline tar.

### Demo:
```text
Drop/paste
 ↓
Classify (chip + confidence)
 ↓
Total Ingested 2→3 (instant)
 ↓
Query prune
 ↓
Parquet promotion
 ↓
Wazuh/SIEM-Lite parse with raw intact
```

### Tasks
- CORS `*` for `file://` open;
- 30s `health` poll for badge;
- fallback mock when ONNX missing;
- `docs/offline-bundle.md` pinned images tar;
- error `unexpected end of JSON raw_len` handling (screenshot case).

### Deliverable
Stable air-gapped demo. `make download-models` + `docker compose up` or `go run./ui/server.go`.

---

## Phase 6, Security + Technical Review

### Goal
Defensible perimeter slice.

### Review
- input validation (bufio 10 MB limit, JSON tolerance);
- `when_full=block` not drop;
- GIN `raw` no secret leakage;
- mock never claims authority;
- `SHA256SUMS` pin.

### Deliverable
Security and review report (this doc set's Security and review.md PASS/WARN/FAIL).

---

# Post-MVP, Universal (All Devices, Anywhere, Decode→Fix)

## Phase 7, Unknown Solver + Small LLM Pod

- Drain3 `miner/` sim `0.5`;
- `unknown_solver/ai_engine.py` localhost:11434 + `prompt_builder` nonce + `rule_validator` → `rules/generated/solver_*.json`;
- **New:** pin small model for Azure free VM: default `qwen2.5.5b` 0.52GB (B1s), alternatives `llama3.2b`/`gemma2b`/`phi3.8b` via `SOLVER_OLLAMA_MODEL` env; none on phone.
- Validate `match≥0.8 fp≤0.1` before Git PR.

## Phase 8, Universal Auto-Catch (Every App, Every Device)

- `auto_capture/capture.py` bounded 10MB rotate + `dedup sha16 window 200` + `4096 cap`;
- `auto_capture/server.py` `/capture` `/capture/image` `/capture/launch` `/report`;
- Per-device agents (no per-app config):
 - Android APK `TileService` (Rethink-style) + crash file `filesDir/last_crash.log` + Shizuku `logcat` fallback
 - iOS Shortcuts + Share Extension → same `POST`
 - Win EventLog / macOS DiagnosticReports / Linux journald tails → Vector file source
- Auto-detect: header fingerprint (`OuterTune:`, `%ASA-`, `CEF:`) tags `source` automatically.

## Phase 9, Anywhere Connect + Fleet Observability

- **Azure free VM (Student Pack):** `education.github.com/pack` → `$100` + `B1s` 750h free; NSG `51820/udp` WireGuard; `10.0.0.0/24` pod network.
- WireGuard pod `wg-quick@wg0` (10.0.0.1) + phone `wireguard-android` tile tap = handshake everywhere; laptop `wg-quick`/Tailscale; `adb reverse` + Syncthing fallback for lab.
- `observability/grafana` 27 panels + `loki` + `prometheus` + `miner/metrics` 8000; `wazuh-main`/`lumber-master` scale; `ulpf-soham-outertune` taxonomy.

## Phase 10, Midnight Decode→Fix & Platform

- `auto_search_problem()` + small LLM → `{what, why, severity, fix_endpoint, curl}` toast.
- Fix buttons: `[Copy curl]` `[Open fix]` `[Open Grafana]`; no SSH at 3 AM.
- Platform: collaborative workspaces, RBAC, marketplace, national-scale ingestion.

---

## Timeline Guidance

**Perimeter polish (this iteration):** 1-2 days (the 2→3 wiring just shipped).

**Universal MVP:** 2-3 weeks from Phase 7 onward.

Highest risks:
1. Vector VRL regression on new device
2. Leaf taxonomy drift (42 → universal)
3. Parquet/pyarrow air-gap divergence
4. Integration polish (dashboard 5s poll → instant)

---

## 11. Ground Reality, Phases 2-6 & Custom ONNX Scale Phases

**Phase 2 Edge Classify (ground truth):** `ui/server.go` `ClassifyBatch` is real, measured 60 ms/100 lines → 1.6k/sec/instance. Not 1B/sec.

**Phase 3 Bridge (ground truth):** `ulpf_ocsf.py` 5 decoders hot-swap real. Not 400 leaves yet.

**Phase 4 Query (ground truth):** Hive prune 90% is real for `class=4001`, but on 4 NDJSON files, not on 1B/sec (needs ClickHouse).

**Phase 5 Demo (ground truth):** `go run./ui/server.go` + `dashboard.html` file:// works offline, mock fallback 503 real. Device demo not yet built, APK stub.

**Phase 6 Review (ground truth):** `SHA256SUMS` pin + `when_full=block` + `GIN` real, no fake pass.

**Custom ONNX scale phases (NEW, to reach 1B/sec honest):**

| Phase | What ships | Throughput honest | Cost honest |
|---|---|---|---|
| 6a | Distill `ulpf-onnx-hyper-4L-256d` (6L→4L, 384→256, seq 64, trim vocab 12k), quant int8 11 MB | 15k/sec/CPU (D4s_v3) | One-time training on 5M logs |
| 6b | + int4 AWQ 9 MB + ORT CUDA/TensorRT + HNSW 400 leaves PQ-64 + dynamic batch 512 | 45k/sec (A10G), 120k/sec (H100) per GPU | ~$3/hr per H100 |
| 6c | + Kafka 300 partitions + KEDA autoscale + gRPC batching → 100M/sec sharded (100 pods ×8 H100) | 100M/sec burst 10 sec | ~$2.4k/min (demo slide) |
| 6d | + 1000 partitions, ClickHouse, sampled store 1% raw → 1B/sec burst 10 sec | 1B/sec burst, not 24/7 | $10-20k/10 sec (benchmark only) |

Real prod loop after 6b is **100k-1M/sec on 1-10 GPUs**, that is the number to write on slides, not "1B on one VM".
