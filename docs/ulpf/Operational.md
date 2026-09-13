# Operational, ULPF

## 1. Who operates ULPF?

| Stage | Operator | What they run | Evidence |
|---|---|---|---|
| **Prototype (today)** | **You, the perimeter developer on your laptop** | `go run./ui/server.go` (`:8081`), optional `docker compose up vector postgres` (`docker-compose.yml:1`), `python storage/parquet_writer.py --watch` | `ulpf-server:8081` health `lumber ready dir=../models leaves=42` `19:05:31` log |
| **Fleet universal (next)** | **Platform / SRE in the VM pod** (student or on-call engineer) | Single Azure free VM `Standard_B1s/B1ms` (Student Pack) running `maincode/docker-compose.yml:156` 8 services: `auto_capture:8002`, `miner:8001`, `miner:8000`, `vector:0.38`, `loki:3100`, `prometheus:9090`, `grafana:3000`, `node-exporter` + host `ollama:11434` `qwen2.5:0.5b` | `docs/VM_POD.md:9` pod spec, `docs/SYSTEM_ARCH.md:48` tier map |
| **At scale (1B burst)** | **Platform team + KEDA autoscaler + Kafka ops** | 800 H100 fleet + 1000-partition Kafka + ClickHouse, **burst only, not daily** | `Architecture.md:14` Hyper fleet |

**Off-hours:** No NOC. WireGuard tile (`PHONE_TILE.md:19` `TileService`) lets the device itself trigger `POST /capture` → pod returns `fix_endpoint` + `curl` toast, the engineer on call taps **Copy**, not SSH.

---

## 2. How does a new log source get added? (plug-and-play)

**Principle:** One fingerprint string, not one pipeline. Prototype proves this.

### 2.1 Prototype path (perimeter, 1 minute)

1. Add one **Phase 1 regex** (the only device-specific line) in `ingestion/transforms/normalize_perimeter.vrl:74`:
 ```vrl
 # was: r'^(?P<date>\d{2}-\d{2})\s+(?P<time>\d{2}:\d{2}:\d{2}\.\d+).*OuterTune.*'
 # add: | (?P<fortigate>LEEF:2.0\|Fortinet\|.*) | (?P<cisco>%ASA-\d+-\d+.*)
 ```
2. Optionally add one **decoder** child in `parsing/decoders/perimeter.yml` (5 exist: Palo Alto/ASA/FortiGate/CEF/Suricata), `<decoder name="myfw"><parent>perimeter</parent><prematch>LEEF:</prematch><regex>(.+)</regex>`, hot-swap via `GET /decoders?decoder=perimeter` (no restart, `wazuh/src/engine/source/router/README.md:1` `Orchestrator` pattern).
3. Or add one **SIEM-Lite parser** in `app/parsers/__init__.py:15` `PARSERS={}` with `parse(content)->Iterator[NormalizedEvent]`, SIEM-Lite's 29 parsers work this way.
4. Verify without restart of the lake:
 ```bash
 vector validate --no-environment vector/vector.toml
 vector test vector/vector.toml tests/test_normalize_outertune.yaml # 21 TC
 curl -X POST http://localhost:8081/api/classify -d '{"logs":["LEEF:2.0|Fortinet|…"]}' | jq.events[0].category
 ```

### 2.2 Universal path (all devices, zero paste, per-app auto)

1. Device agent auto-detects `source` from header/prefix, `auto_capture/server.py:37` already does `source` enum (`phone`/`laptop`/`firewall` + `app` + `device`). Adding a new app = one substring in `normalize_outertune.vrl:Phase 1` and one entry in `auto_search_problem()` keyword map (`capture.py:44`), no new agent, no new VM.
2. If the app's format is truly unknown (new vendor), Drain3 creates `cluster_created` (`miner/miner_service.py:47` `TemplateMiner`), `SkippedLogs` → `ai_solver/unknown_solver/pipeline.py:145` 10-step (sampler dedup → sanitizer → Ollama `localhost:11434` → OCSF 4001 → validator 10 checks → tester 0.8/0.1 → Git PR → loader sentinel `generated_rules.vrl`). Next time auto-matched, no AI call.

**Who does it:** Developer adds one regex/fingerprint; PR reviewer checks `vector test` + `pytest`; loader appends `.vrl` via `.ulpf_reload_requested` sentinel (no Vector hot-reload, restart or `SIGHUP`).

---

## 3. What happens when parsing fails?

ULPF never crashes on a bad line. Every tier has a **fail-safe that preserves raw**.

| Layer | Failure signal | What happens | What the user sees | Where raw goes |
|---|---|---|---|---|
| **Vector VRL** | `parse_regex` abort or `abort` for level `I/D/V` | `drop_on_abort=true drop_on_error=true` (`vector.toml:79`), line dropped from sinks | Nothing, silent drop (by design for `I/D/V < W`); for true parse abort, counted as `dropped` in Vector metrics | Not stored (VRL has no raw yet) |
| **Go ingest** | `bufio.Scanner` 10 MB limit exceeded or `json.Unmarshal` `unexpected end of JSON raw_len:14` (your screenshot) | Skip line, `lastErr = err.Error()`, `pgCount==0` → response `{"ingested":n,"pg_error":lastErr}` (`server.go:214`); `output/normalized/*.ndjson` still appends raw line before PG attempt | `GET /api/stats` `failed` increments, `vendor_counts` not incremented, `GET /api/query` still returns line's `raw` | `output/normalized/perimeter-*.ndjson` (raw line appended before PG) |
| **Edge ONNX** | confidence < 0.5 | `type=UNCLASSIFIED category="" confidence~0.2 severity=warning` (`classifier.go:24`) | Chip `UNCLASSIFIED 20%` (grey) | `raw` field in `CanonicalEvent` + stored as NDJSON |
| **Drain3** | `change_type == cluster_created` / `cluster_template_changed` (`miner_service.py:53`) | Counts as unknown → `detector.py:1` queues to `SkippedLogs` DLQ | `GET /report` shows `cluster_id` + `template` | `logs/syslog.log` + `logs/parametes.log` + `log_states.txt` persistence |
| **AI solver** | Sanitizer injection / low confidence <0.30 / regex compile fail / `fp_rate>0.1` | `RuleValidator` FAIL → `REJECTED`, `RuleTester` FAIL → `REJECTED`, never committed (`pipeline.py:268`) | `POST /capture` still returns keyword `hint` (fallback), no PR | `pipeline_run.json` error logged, raw kept in DLQ for retry |
| **SIEM-Lite fallback** | All 29 `parse()` returned empty | `generic_json` / `generic_syslog` catch-all (`parsers/__init__.py:15` last) claims it | Event normalized as `vendor=generic` | `raw jsonb` in `events` table (GIN) |

**Midnight panic rule:** No bad line ever loses the original bytes, either `unmapped.raw_event` (VRL) or `raw` (Go/CanonicalEvent) or `raw jsonb` (PG) retains it, and `sha256(canonical)` preserves dedup.

---

## 4. What happens during high input volume?

### 4.1 Prototype (file tail, no Kafka)

| Volume | Mechanism | Behavior | What user sees |
|---|---|---|---|
| Burst ≤ 500 events/batch | `sinks.perimeter_ocsf_file.buffer type=memory max_events 500 when_full=block` (`vector.toml:68`) | Tail latency flat, not loss | `X-Latency-Ms` header 50-80 ms for 100 lines |
| Sustained tail > disk buffer 2 GB | `sources.perimeter_raw.buffer type=disk max_size 2147483648 when_full=block` (`vector.toml:40`) | **Stall, not drop**, producer blocks | `vector top` shows lag; `GET /api/stats` `buckets` stall then spike after drain |
| Go ingest 10 MB line limit | `bufio.Scanner` 64KB init → 10 MB max (`server.go:224`) | Oversize line split (scanner error) → skipped | `pg_error: token too long` once |
| Single Go instance | ~1.6k/sec (100/60 ms) | CPU saturates `intra_op 4` | `health.latencyMs` rises |

### 4.2 Fleet / high volume (the honest path)

- **Ingest:** Replace `file` source with `kafka` 300→1000 partitions (`Architecture.md:14`), `Vector buffer disk 2 GB per partition when_full=block`.
- **Classify:** `ULPF-ONNX-Hyper` 4L/256d int8 (CPU 15k/s) → int4 + HNSW + GPU (A10G 45k/s, H100 120k/s) + gRPC `batch 512, seq 64` + `KEDA` autoscale on Kafka lag (not prototype's single Go).
- **Store:** PG `events` partitioned monthly (`schema.sql:59` `PARTITION BY RANGE`) is for perimeter TBs; at 100M+/sec switch to **ClickHouse `ReplicatedMergeTree` + S3 Hive** (`storage/parquet_writer.py:9` already Hive, `query/datafusion_engine.py:15` is demo).
- **Backpressure at 1B/sec:** Cannot store 86 PB/day (1 KB×1B×86400). **Sample:** 100% counts in `GET /api/stats` (`vendor_counts`/`category_counts`), 1% raw in ClickHouse, `Rules.md:14` permits `1% raw`.
- **Observability:** `KEDA` scales `ulpf-onnx-hyper` pods on `kafka_lag`; `Grafana` panel shows `Shards: 12/83 healthy • Throughput: 118k/GPU • Dropped: 0% sampled 1% raw` (not fake "1B on one VM").

### 4.3 Runbook (when lag spikes at 3 AM)

1. Tap **ULPF** QS tile → `GET /report` shows `clusters` vs `lag`.
2. Grafana `3000` → Loki `Live Logs` + Prometheus `8000/metrics` → check `vector_top lag` and `miner log_states.txt` `total_clusters`.
3. If `Kafka lag > threshold` → KEDA already scaled; if GPU lag, `az vmss scale` or `docker compose --profile gpu up`.
4. Fix is still **Copy curl** from `POST /capture` response, volume does not block decode of the one log you tapped.

---

## 5. Who operates during "high" vs "normal"

- **Normal (perimeter):** You. One `docker compose up -d` + `go` + `Vector` + `watcher`.
- **High (universal fleet):** SRE / platform team watches Grafana + `vector top` + `KEDA`; student just taps tile, VM pod autoscale does rest.
