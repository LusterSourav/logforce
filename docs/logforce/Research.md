# Research, LogForce

**Topic:** Evidence Base for Roadmap Decisions (Device Auto-Catch, Small LLM Pod, 1B/sec Scale) 
**Method:** Local file:line evidence + referenced branch evidence + design-doc cross-check (no web scrape)

## 1. What was researched and why

| Question | Why it matters | Where evidence lives |
|---|---|---|
| Is Vector + VRL the right ingest for heterogeneous logs? | Need "one fingerprint string per new device" | `maincode/vector/transforms/normalize_outertune.vrl,74` + `vector/vector.toml` + `LogForce-Deep-Research-Report.md` |
| Can ONNX run on CPU for perimeter and on GPU for 1B/sec? | Need 5 ms today and 120k/s/GPU tomorrow | `lumber-master/internal/engine/embedder/onnx.go` + `ui/server.go` + `Architecture.md` Hyper bench |
| Does "phone thin, pod thick" actually hold? | Phones cannot load 58M ONNX + 0.52-4 GB LLM | `libonnxruntime.dylib` 34M + `model_quantized.onnx_data` 22M = 58M, `auto_capture/server.py` 4096 cap, `ai_engine.py` localhost |
| Is Rethink-style QS tile feasible? | User screenshot shows Refresh/Rethink/Orbot in QS | `maincode/docs/PHONE_TILE.md` `TileService`, `VpnService` pattern, `BIND_QUICK_SETTINGS_TILE` |
| Which small LLM fits free Azure B1s? | Student Pack $100 + B1s 1 GB free must host pod | `maincode/prototype/docker-compose.prototype.yml` `qwen2.5.5b 397 MB`, `offline/image-list.txt` pinned 5 |
| Is 1B/sec per second honest? | User asked "handling more than 1000 million per second" | Measured 1.6k/sec/instance, Hyper math 833 H100 (`Architecture.md`) |

## 2. Key findings (with references 2-6)

### 2.1 Vector + VRL is the correct perimeter ingestion (ground truth)

- `normalize_outertune.vrl` Phase 0 forensic seal `raw_event` + `sha2(canonical)` + `unmapped.raw_event` + `integrity` is already lossless per `LogForce-Deep-Research-Report.md` TC-09/10/21 pass.
- `vector.toml` `drop_on_abort=true` + disk buffer 2 GB `block` is forensic-safe (stall not drop), verified `vector.yaml` in `maincode/observability`.
- **Research takeaway:** Keep VRL Phase 1 as the only device plug point. For 1B/sec replace `file` source with `kafka` 1000 partitions, but keep same `.vrl`, no pipeline rewrite.

### 2.2 ONNX today (CPU) vs custom Hyper (GPU), both needed

- **Today (measured):** `lumber-master` 100 lines / 60 ms → **1.6k/sec/instance** (Go `intra_op 4` `onnx.go`, `ui/server.go` health `latencyMs` 1.98 ms warm). Model disk `model_quantized.onnx` 215K + `onnx_data` 22M + `lib` 34M.
- **Custom Hyper (designed, not yet shipped):** Distilled `MiniLM 6L→4L` `hidden 384→256` `seq 128→64`, vocab 30k→12k, HNSW PQ-64 for 400 leaves, int8 11 MB / int4 AWQ 9 MB, `onnxruntime-gpu 1.18` + `TensorRT 8.6`, dynamic batch 512 → **15k/sec CPU (D4s_v3), 45k/sec A10G, 120k/sec H100** per GPU. `Architecture.md` table cites this exact path.
- **Why custom, not just `mdbr-leaf-mt`:** `mdbr-leaf-mt` is 42 leaves general; Hyper needs 400 leaves universal (guide Issue #2 6-family schema `vector/schemas/ocsf_4001_reference.json`) + PQ index for scale. Distill teacher `bge-large` → student is standard.

### 2.3 Phone-thin, pod-thick (ground truth)

- `auto_capture/capture.py` `MAX_BYTES 10 MB` rotate + `capture.py` dedup `sha16 window200` + `server.py` `[]` cap proves phone never buffers large logs.
- `ai_engine.py` `SOLVER_OLLAMA_BASE_URL=http://localhost` + `config.py` `SanitizedEvent` only input proves AI never on phone, never cloud (`RUNBOOK.md` `ollama serve` localhost).
- `PHONE_TILE.md` `Thread.setDefaultUncaughtExceptionHandler → filesDir/last_crash.log` proves crash auto-capture without `READ_LOGS` (Shizuku optional).
- **Research takeaway:** WireGuard `10.0.0.0/24` is the auth (`VM_POD.md`), not a password. Phone tile tap = `wg` handshake, `POST` via `10.0.0.1`.

### 2.4 Which small LLM for the pod on free tier (ground truth)

| Model (Ollama) | Disk | RAM needed | LogForce fit (tested in `prototype/docker-compose.prototype.yml`) |
|---|---|---|---|
| `qwen2.5.5b-instruct` | 397 MB | ~1 GB | **Fits B1s 1 GB** if Loki disabled; valid JSON high |
| `qwen2.5.5b` | ~0.9 GB | ~1.8 GB | Fits B1ms 2 GB (recommended) |
| `llama3.2b` | 1.3 GB | ~2 GB | B1ms |
| `gemma2b` | 1.6 GB | ~3 GB | B2s 4 GB |
| `phi3.8b-mini-4k` | 2.2 GB | ~4 GB | B2s and above |

**Research takeaway:** Default `qwen2.5.5b` for student $0 path; upgrade via `SOLVER_OLLAMA_MODEL` env without code change (same `ai_engine.py` interface).

### 2.5 Rethink-style tile (ground truth)

- Screenshot Rethink/Orbot row rechecked: `Rethink` and `Orbot` are `VpnService` + `TileService` entries, appearing in QS after `BIND_QUICK_SETTINGS_TILE` permission. LogForce will add `LogForce` tile identically (`PHONE_TILE.md` manifest `<service android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">`).
- Our tile differs: routes only `10.0.0.0/24` (`Builder.addRoute`) vs Rethink `0.0.0.0/0` full-tunnel, more private, less battery.

### 2.6 1B/sec feasibility (ground truth, not marketing)

- CPU: 1B ÷ 1.6k = **625,000 instances** → impossible on one VM.
- GPU Hyper: H100 120k/s → **833 H100** for 1B/10 sec burst; A10G 45k/s → 22k A10G.
- Storage: 1B × 1 KB × 86400 = **86 PB/day** impossible → must sample **1% raw** + 100% `vendor_counts`/`category_counts` in `GET /api/stats`.
- Cost: 800 H100 × $3/hr ÷ 360 = **$6.6/sec** → **$66 per 10 sec** idle-free burst (docs conservatively $10-20k with Kafka + ClickHouse overhead, honest).

**Research takeaway:** 1B/sec is **a 10-sec burst on a sharded fleet**, not sustained on a single free VM. Honest slide: 100k-1M/sec on 1-10 GPUs for daily prod; 1B burst for benchmark only.

## 3. Methodology

- File inventory `ls -R` + `find` on `maincode/` + `lumber-master/` + `LogForce-Perimeter-Prototype/` + `Branch of logforce/` + `guide/` Docx metadata.
- Read `LogForce-Deep-Research-Report.md` full (local evidence only, no web).
- Grepped `ai_engine.py`, `pipeline.py` 10-step, `config.py` env, `vector.toml`, `normalize_outertune.vrl`, `miner_service.py` Drain3, `storage/parquet_writer.py`, `query/datafusion_engine.py`.
- Compared LogForce-Docs claims vs those bytes, hallucination if file:line missing.

## 4. Gaps Still Open (for next research spike)

- Shizuku vs `last_crash.log` only, measure `logcat` latency without `READ_LOGS` on Android 14.
- iOS Shortcuts entitlement count for `os_log` collection.
- Hyper training dataset: 5M logs not yet collected, need `LogForce-Deep-Research-Report.md` 29 parsers as seed.

## 5. Principle

> **Ground reality = file:line, not slide. If the line isn't in `maincode/`, it's a roadmap, not a claim.**
