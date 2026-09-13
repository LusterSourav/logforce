# Rules, ULPF

## 1. Core Rules

1. Keep the perimeter prototype narrow (42 leaves, 5 decoders).
2. Never lose `raw`, `integrity.sha256` + `unmapped.raw_event` are mandatory.
3. Prefer explainability (confidence + latency) over black-box claims.
4. Every event reproducible via `echo -n canonical | sha256sum`.
5. Every dataset/format has provenance (`format` qparam → `vendor`).
6. Clearly separate observed (NDJSON/PG) from simulated (none in prototype).
7. Deterministic code owns schema; mock/AI only assists ranking.
8. Fail safe: missing model → 503 mock, not crash.
9. No cloud at runtime; models baked + SHA pinned.
10. Do not add universal features to `ULPF-Perimeter-Prototype/`, use `maincode/`.

## 2. Technology Rules

### Preferred (prototype)
- Go 1.24 + `kaminocorp/lumber` + `onnxruntime_go`
- Vector 0.38 + VRL
- Python `parquet_writer.py` (pyarrow optional)
- Postgres 16 + GIN
- Single HTML + Tailwind CDN

### Avoid unless justified
- microservices / Kubernetes in prototype folder
- Elasticsearch as primary store (PG GIN + Parquet first)
- multiple DBs for same data
- custom GIS/tensor engines (lumber provides)

### Final stack (allowed outside prototype)
- Drain3, Ollama 0.5b, Siembol Storm, Loki/Prometheus/Grafana, PostGIS/pgvector, DataFusion.

## 3. Data Rules

For every NDJSON file:
```text
path: output/normalized/perimeter-%Y-%m-%d.ndjson or output/parquet/year=…/class=4001/vendor=…
 future also: logs/auto_captured.log (thin capture) → output/normalized/auto-*.ndjson Hive vendor=phone/laptop/firewall
source format: paloalto_syslog | cisco_asa | fortinet_fortigate | cef | leef | suricata_eve | zeek_tsv | generic_syslog | csv | xml | ulpf_ocsf
 future: android_logcat | android_crash | windows_eventlog | macos_diagnostics | linux_journald | ios_sysdiagnose | outer_tune
ingest path: Vector tail OR POST /api/classify → POST /api/ingest?format=
 future also: POST /capture (any device, 4096 cap via WireGuard 10.0.0.1:8002) → logs/auto_captured.log → miner → same OCSF
hash: sha256(trim(raw)) plus capture.py dedup sha16 window200
class: class_uid 4001 type_uid 400101
vendor/source: metadata.product.vendor_name → vendor → type fallback → ?format= → source (phone/laptop/firewall) + device + app tags
```

Keep `output/normalized` and `output/parquet` + `logs/auto_captured.log` separate; never overwrite raw. Auto-capture `logs/auto_captured.log` 10 MB rotate.

## 4. Data Quality

Validate:
- NDJSON line validity (tolerate `unexpected end of JSON raw_len:14` by skipping, logging `lastErr`);
- `time` vs `timestamp` (RFC3339 vs RFC3339Nano) with file mtime fallback for bucketing;
- `class_uid` presence (OCSF) else lumber shape `{type,category,confidence}`;
- bufio limit 10 MB per scanner line;
- duplicate via canonical hash.

Flag `UNCLASSIFIED` (confidence ~0.2) rather than invent category.

## 5. Ingestion Rules (Vector/VRL)

1. File source `read_from=beginning`, `glob_minimum_cooldown_ms=1000`.
2. Multiline `continue_through` `^\s+at\s+|^Caused by:|^.*Exception:` timeout 1000 ms.
3. Disk buffer `max_size=2147483648 when_full=block` (forensic block).
4. VRL `drop_on_abort=true drop_on_error=true`.
5. Phase 1 is the only device regex; Phase 0 hash + Phase 2 filter + Phase 3 OCSF stay generic.
6. Sinks: file NDJSON + HTTP `ulpf-server:8081/api/ingest` (retry 5, backoff 2s).

## 6. Edge Engine Rules

Expose:
- `taxonomyLeaves:42`, `threshold:0.5`, `embedDim:1024`, `latencyMs`.

Never:
- call low confidence a guaranteed prediction;
- hide `confidence`/`severity`;
- modify `raw`.

Always:
- return deterministic `events[]` for same input/model;
- honor batch = one ONNX call;
- provide `X-Latency-Ms` header.

## 7. Storage Rules

- Hive `year/month/day/class/vendor` so `WHERE class_uid=4001` prunes.
- Snappy if pyarrow present else NDJSON under same hive, never lose.
- `watch_and_convert` polls 30s; `seen` set prevents re-convert.
- Postgres indexes: `raw GIN`, `class_uid`, `vendor`, `ingested_at`.

## 8. API Rules

Validate every `POST`:
- `POST /api/classify` (Go:8081, ONNX on pod): `logs` array required, 10 MB scanner, 503 mock if model missing.
- `POST /api/ingest[?format=]`: NDJSON trim, `ingested` vs `pg_inserted`, never echo raw.
- `POST /api/query`: sanitize `sql`/`query`/`q` (substring `4001`), cap 200, placeholder `count`.
- `GET /api/stats`: read-only, file fallback if PG down.
- **Future device pod `POST /capture` (:8002 via WireGuard, NOT public):** `{log≤4096, source, device, app}` with `4096` cap + `sha16 dedup window200` + `10 MB` image cap; returns `{hint, fix_endpoint, curl}` (the midnight fix). No heavy work on phone, VM validates.
- **Future `GET /report` + `POST /parse` (miner 8001)**: read-only tail+clusters; `POST /parse` uses `add_log_message` + `exact_matching`.

Rate-limit/auth: prototype none (localhost/air-gapped); pod `:8002` behind WireGuard `10.0.0.0/24`, not public, auth is `wg` key + short JWT for `/report` in final.

## 9. Error Handling

- User: 400 bad JSON, 503 mock message `model not loaded…`.
- Data: skip malformed line, keep `lastErr` only when `pgCount==0`; surface `pg_error` once.
- Service: log `WARN lumber not ready` + `postgres ping failed`; dashboard degrades to mock chips.

## 10. Logging (Prototype)

Log:
- `lumber ready dir=… leaves=… took=…ms` / `WARN … not ready`;
- `postgres ready dsn=…` / `WARN ping failed`.

Never log:
- API keys, `PG_DSN` password beyond DSN string already in compose (move to secret in final), tokens.

## 11. Code Rules

- Go: validate all JSON decodes; `outDir()` probes `../output/normalized` + `output/normalized` + `/app/output/normalized`.
- Python: `hive_path` creates parents; `watch_and_convert` try/except per file.
- JS: `doClassify` always renders, then persists; `handleFiles` delegates; `refreshRealData`/`refreshAllCards` guard `stats==null`.

## 12. Scope Rule

A feature belongs in `ULPF-Perimeter-Prototype/` only if it supports:

> **Ingest → Classify 42 → OCSF NDJSON → Query → Dashboard live**

Everything else → `maincode/` (including `auto_capture/` thin device + `ai_solver` small LLM + WireGuard, which are intentionally thin so `android_artifact` < 5 MB).

**Device rule:** phone never runs ONNX/Ollama; VM pod does. Adding a new device = one agent + one WireGuard peer, not one model.

## 12a. VPN / Tile Rule (Rethink-style)

- QS tile (`TileService`, `BIND_QUICK_SETTINGS_TILE`) is a `VpnService` that only routes `10.0.0.0/24` (pod), not `0.0.0.0/0` (unlike Rethink which filters all). Handshake on tap, no always-on drain.
- Fallbacks documented: `adb reverse tcp:8002` for USB lab, `Syncthing` for `logs/auto_captured.log` if no VPN.

## 13. Definition of Done

Prototype done (today) when:
- drop/paste → chip + `Total Ingested 2→3` live;
- `GET /api/stats` counters correct; `POST /api/query` prune; `parquet_writer` Hive; `ulpf_ocsf.py` `raw` intact; `vector test` 21 pass.

Device done (next) when:
- Android APK tap on QS tile beside Rethink (your screenshot) → WireGuard → `POST /capture` → `{fix_endpoint,curl}` toast from `qwen2.5:0.5b` on Azure B1s;
- Same `logs/auto_captured.log` appears as OCSF `source=phone` in `GET /api/stats` vendor counts;
- Image share `POST /capture/image` OCR path also returns fix; `GET /report` tail visible;
- Laptop agent (Win/macOS/Linux) same `POST` works without phone.

---

## 14. Ground Reality, Rules 2-6 + Custom ONNX Rules

**Rule 2 Technology (ground truth):** `lumber v0.10.6` Go 1.24 + `onnxruntime_go` + Vector 0.38 + PG 16 are pinned (`go.mod`, `offline/image-list.txt:1`). Future `ulpf-onnx-hyper` adds: `onnxruntime-gpu 1.18`, `TensorRT 8.6`, `faiss-hnsw`, `quant awq int4`, but prototype stays CPU `23 MB`, no forced GPU for demo.

**Rule 3 Data (ground truth):** Source enum now includes `android_logcat | windows_eventlog | outer_tune`, fingerprint in `normalize_outertune.vrl:74` will be added, not yet live. Ingest path `POST /capture` already live (`server.py:39`).

**Rule 4 Quality:** NDJSON validity, `bufio 10 MB`, dupe hash, all enforced (`server.go:214`). `UNCLASSIFIED 0.2` fallback real.

**Rule 5 Ingestion:** File source + disk 2 GB `block` + VRL phases 0-3 real (`vector.toml:56`), but for 1B/sec, Rule 5 gains: `Kafka 1000 partitions, batch 10k, compression zstd, replication 3`, not file tail.

**Rule 6 Edge Engine (ground truth + Hyper):** Prototype exposes `taxonomyLeaves:42` + `latencyMs`. Hyper will expose `model: ulpf-onnx-hyper-4L-256d, leaves:400, dim:256, seq:64, quant:int4, leaves_hnsw: pq64, batch:512`. Never hide `confidence`, Hyper still returns it per leaf (HNSW distance → softmax).

**Custom ONNX Rule:** Hyper model lives in `maincode/vector/onnx-hyper/` + `lumber-master/models-hyper/` (new). Training: teacher `bge-large` → student 4L, 5M logs (perimeter+app), loss = MSE(hidden) + KL(logits) + contrastive (leaf desc). Quant: dynamic int8 for CPU pod, AWQ int4 for GPU fleet. Validation: same `corpus.json` 153 + new `ulpf-hyper-corpus.json` 5k. Storage of 1B burst must be sampled: keep 100% `vendor_counts` + `category_counts` in `stats`, 1% `raw` in ClickHouse, Rule 3 already allows `1% raw`.
