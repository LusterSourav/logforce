# References, ULPF

**Category:** Provenance and Traceability for All 7 Docs

## 1. Local Codebase (authoritative)

| Ref | Path | What it proves |
|---|---|---|
| R01 | `ULPF-Perimeter-Prototype/ui/server.go,136,154,214,290,398,521` | 5 handlers `health/classify/ingest/query/stats` + live `2→3` |
| R02 | `ULPF-Perimeter-Prototype/models/model_quantized.onnx` 215K + `onnx_data` 22M + `libonnxruntime.dylib` 34M = 58M | ONNX 23 MB claim (model only ~22 MB, total 58M) |
| R03 | `lumber-master/internal/engine/embedder/onnx.go,126` + `pkg/lumber/lumber.go` + `taxonomy/default.go` 42 leaves | int8 `23 MB` + `intra_op 4` + pre-embed 42 |
| R04 | `ULPF-Perimeter-Prototype/ingestion/vector.toml,79` + `transforms/normalize_perimeter.vrl,74` | File tail + VRL 3-phase + Phase 1 plug point |
| R05 | `ULPF-Perimeter-Prototype/storage/parquet_writer.py` + `query/datafusion_engine.py` | Hive `year/month/day/class/vendor` + Snappy + DataFusion prune |
| R06 | `ULPF-Perimeter-Prototype/init.sql` | `events` PG GIN `raw jsonb_path_ops` |
| R07 | `maincode/auto_capture/server.py,39` + `capture.py,22` | `POST /capture` 4096 cap, 10 MB rotate, dedup `sha16 window200` |
| R08 | `maincode/miner/miner_service.py` + `drain3.ini` | Drain3 `add_log_message` + `sim_th 0.4` |
| R09 | `maincode/ai_solver/unknown_solver/{ai_engine.py,pipeline.py,config.py}` | Ollama `localhost` + 10-step + `SanitizedEvent` only |
| R10 | `maincode/docker-compose.yml,99,114,156` + `offline/image-list.txt` | 8 services `vector.38` + `prom.51.2` + `loki.9.8` + `grafana.4.2` pinned |
| R11 | `maincode/docs/PHONE_TILE.md,23,50` + `VM_POD.md` + `SYSTEM_ARCH.md` | `TileService` + WireGuard `10.0.0.0/24` + pod spec |
| R12 | `maincode/prototype/docker-compose.prototype.yml` | `qwen2.5.5b 397 MB` small LLM pin |
| R13 | `Branch of ulpf/ulpf-swarnadeep-ai-unknown-solver/unknown_solver/rules/generated/` 5× `solver_*.json` | Rule synthesis output exists |
| R14 | `SIEM-Lite-main/app/parsers/__init__.py` 29 parsers | Perimeter parser library |
| R15 | `wazuh-main/src/engine/source/router/README.md` + `VERSION.json` `5.1.0` | Hot-swap `Orchestrator` + tree decoders |
| R16 | `guide/Universal Log Pre-processing Framework (ULPF) - Production Grade Project Specification.docx` + `Design Specification_ Issue #2 Pattern Mining Tier.docx` | Original guide specs (unparsed docx, cited via `ULPF-Deep-Research-Report.md`) |

## 2. External References (public, used for student free tier + model sizes)

| Ref | Source | What was used (not a link, but provenance note) |
|---|---|---|
| E01 | GitHub Student Pack `education.github.com/pack` (claim flow) | Azure for Students $100 + 12 mo B1s 750h/mo free → `az vm create Standard_B1s` |
| E02 | Azure pricing calculator Sept 2026 (consumed in `Financial.md`) | B1s free 12 mo, B1ms ~$12/mo after credit, B2s ~$30/mo, H100 `NC24ads_H100_v5` ~$3/hr |
| E03 | Ollama registry `ollama.com/library/qwen2.5, llama3.2, gemma2, phi3` (size via `ollama list`) | Disk 397 MB-2.2 GB table in `Prd.md.2`, `Architecture.md`, `Research.md.4` |
| E04 | RethinkDNS + Orbot (Google Play) | VpnService + QS Tile pattern your screenshot shows (Refresh/Rethink/Orbot row) → copied for `ULPF` tile |
| E05 | ONNX Runtime docs `onnxruntime.ai` (EP CUDA/TensorRT, `SessionOptions` `intra_op`/`graph_optimization_level`) | Hyper EP `CPU→CUDA→TensorRT` + `graph_optimization_level ALL` (`Architecture.md`) |

No web scrape at runtime; offline pod has no HF pull (`lumber/README.md` Apache 2.0, `ai_engine.py never cloud`).

## 3. How to cite these docs

Each of the 7 ULPF-Docs cites local `file:line` instead of URLs so an auditor can `grep` without internet:

```text
Example: "ONNX int8 23 MB (R03) + VRL Phase 1 (R04) + WireGuard 10.0.0.0/24 (R11)"
```

## 4. Audit trail

- `ULPF-Docs/AUDIT.md` is the line-cited audit of all 7 docs (scores 4.17/3.97/4.14, 6 gaps to close).
- This `References.md` is the source-of-truth index for that audit.

## 5. Principle

> **If the line isn't in `maincode/` or `ULPF-Perimeter-Prototype/`, it's a roadmap, the docs mark it as future, not done.**
