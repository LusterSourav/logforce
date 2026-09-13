# Memory, ULPF

## 1. Project Identity

**Project:** Universal Log Pre-processing Framework (ULPF) 
**Problem:** Heterogeneous log normalization → OCSF 4001 → queryable lake + SIEM, lossless & offline 
**Prototype Folder:** `ULPF-Perimeter-Prototype/` (perimeter slice) 
**Full Codebase:** `maincode/` + branches + `SIEM-Lite-main/`, `wazuh-main/`, `lumber-master/` 
**Docs:** `SYSTEM_DESIGN.md`, `SYSTEM_ARCHITECTURE.md`, `README.md`, `ULPF-Deep-Research-Report.md`, this memory 
**Category:** Software, Data Engineering / Security Analytics 
**Theme:** Smart Automation

---

## 2. Product Direction

Positioned as:

> **The one auto-catcher that explains every log on every device and hands you its fix.**

The prototype demonstrates:

> **Ingest → Classify (42) → OCSF 4001 (integrity+unmapped) → Hive → Query → Dashboard**

The final demonstrates:

> **Any device auto-captures (laptop/phone/server/firewall, per-app auto-detected) → WireGuard to free Azure VM pod (Student Pack) → Drain3 + small LLM (0.52 GB on pod, never on phone) → OCSF 4001 → what/why + fix endpoint → Copy curl, no panic at night.**

---

## 3. Confirmed MVP, Perimeter

### Core modules (live)
- Edge Classify (Go ONNX, 23 MB, 42 leaves)
- Vector + VRL 3-phase normalization
- NDJSON + Hive Parquet (watcher 30s)
- Dashboard + API (:8081) with live KPI (2→3 wired)
- Postgres `events` + search mirror
- Parsing bridges (`ulpf_ocsf.py` + `perimeter.yml` 5 decoders)

### Initial corpus
Palo Alto Syslog, Cisco ASA, FortiGate, CEF, LEEF, Suricata EVE, Zeek TSV, Generic Syslog/JSON, CSV, XML, ULPF OCSF.

### Demo context
Single host air-gapped; `output/normalized/perimeter-*.ndjson` + `PG_DSN=postgres://ulpf:ulpf@postgres/ulpf`.

---

## 4. Product Principles

1. Never lose `raw`. Hash canonical, keep original under `unmapped`.
2. One regex per new device, not one pipeline.
3. Schema stability beats parser cleverness, always OCSF 4001 downstream.
4. Offline is non-negotiable (baked models, SHA pin).
5. Backpressure = block, not drop.
6. Batch = one ONNX call.
7. Every event traceable to `format` + `vendor` + `sha256`.
8. MVP stays narrow; universal lives in `maincode/`.

---

## 5. Ecosystem Considerations

Complement, not replace:
- Wazuh / Wazuh manager (decoders)
- SIEM-Lite (NormalizedEvent bridge + `generic_json` fallback)
- Grafana / Loki / Prometheus (full observability branch)
- Existing SIEM/storage, ULPF is the normalizer before them.

Differentiation: **lossless OCSF fabric with integrity + Hive pruning.**

---

## 6. Data Direction

Primary (prototype, DONE):
- perimeter.log + pasted raw lines
- NDJSON OCSF + lumber CanonicalEvent (ONNX 23 MB on host)
- Postgres `events` GIN + Hive `year/month/day/class/vendor` + decoders

Future (all devices, auto, via VM pod):
- **Every device**: Win EventLog, macOS DiagnosticReports, Linux journald, Android logcat + `last_crash.log`, iOS sysdiagnose, per-app fingerprint auto tag (no paste)
- **Path**: device `POST /capture` (4096 cap, Carb. via WireGuard 10.0.0.0/24) → `logs/auto_captured.log` (10 MB rotate, dedup) → `miner` Drain3 → `ai_solver` small LLM on pod `localhost` → `fix_endpoint` + `curl`
- **Storage**: same Hive + PG, now with `source=phone/laptop/firewall` + `device` + `app`
- **Observability**: same Grafana/Loki, now per-device `source` filter

---

## 7. Confirmed Decisions

### D1, Baked models + fallback mock
Prototype ships offline; missing model → 503 + mock, never crash.

### D2, Single VRL plug point
All device logic in Phase 1 regex; rest generic.

### D3, 42 leaves is enough for perimeter
Universal expansion is a data task in `maincode/`, not scope creep now.

### D4, Classify persists via Ingest
`doClassify()` auto `POST /api/ingest` so dashboard KPIs are live (fixed this iteration). No separate user step.

### D5, Reuse existing stack knowledge
Go + Vector + VRL + Python, no new framework unless benefit proven.

### D6, Hive fallback to NDJSON
If `pyarrow` absent, keep NDJSON under hive path, pipeline never stalls.

### D7, Thin device, thick pod
ONNX + small LLM run **only on VM pod** (Azure B1s/B1ms free). Phone is thin `POST` via WireGuard, never loads `libonnxruntime`. This keeps phone battery <1% and lets a 1 GB VM serve all devices.

### D8, Free-tier VM + Rethink tile
Student Pack → Azure `$100` + B1s 750h free; WireGuard QS tile (like Rethink/Orbot screenshot) gives one-tap anywhere connect. No public log ingress.

### D9, Midnight fix is the deliverable
Every auto-captured log returns `{what, why, severity, fix_endpoint, curl}`, copy-paste fix beats raw dump at 2 AM.

---

## 8. Open Questions

- Small model lock: `qwen2.5.5b` (0.52 GB) vs `llama3.2b`/`gemma2b` for log decode JSON validity on 1 GB VM.
- iOS Shortcuts vs native Share Extension for midnight auto-catch.
- Shizuku vs `last_crash.log` only for Android logcat without `READ_LOGS`.
- Postgres partitioning vs Citus for 100M+ device events.
- Storm vs Flink for universal fan-out.
- Prod auth for `8002` (WireGuard mTLS vs short-lived JWT).

---

## 9. Known Risks

- Dataset incompatibility (time formats, severity vocab).
- Invalid geometries / malformed NDJSON (`error: unexpected end of JSON input` seen in screenshot).
- Stale `SHA256SUMS` drift if models re-downloaded.
- Scope creep (universal parsers before perimeter is rock-solid).
- Dual-write divergence (file vs PG vs indexer).

---

## 10. MVP Completion Definition

MVP is complete when a user can:

```text
Paste/drop raw
 ↓
See CanonicalEvent with confidence
 ↓
See Total Ingested increment live
 ↓
Query with prune stats
 ↓
See Parquet promotion
 ↓
Parse via ulpf_ocsf.py with raw intact
 ↓
Verify hash echo -n canonical | sha256sum
```

with reproducible results, provenance, and no cloud call.

---

## 11. Deferred Features (now roadmapped, not deferred)

- ✅ Auto-capture `maincode/auto_capture/`, now Phase 8, not deferred (thin phone + pod decode)
- ✅ Small LLM pin, default `qwen2.5.5b` on Azure free pod, switchable via `SOLVER_OLLAMA_MODEL`
- ◻ Full Grafana 27 panels (branch `ulpf-soumita-grafana-observability`), per-device source filter pending
- ◻ Miner Drain3 at fleet scale beyond perimeter
- ◻ SIEM correlation Storm topology
- ✕ Grants/hackathon management, public social network, stays deferred

---

## 12. Project Philosophy

> **Ship one lossless perimeter loop, then widen the same lossless contract to every device, with a one-tap fix that lets no one panic at night.**

---

## 13. Ground Reality, Sections 2-6 & Custom ONNX

**2 Product Direction (ground truth):** `Ingest→Classify 42→OCSF→Hive` is shipped (`ui/server.go` + `vector.toml` + `parquet_writer.py`). `Any device auto → WireGuard → small LLM → fix` is roadmapped, `auto_capture/server.py` + `PHONE_TILE.md` stubs exist, APK not yet built. Not fake, but not DONE.

**3 Confirmed MVP:** 6 modules live, corpus 11 formats, demo on `output/normalized` + PG `ulpf:ulpf`. Verified by `go run./ui/server.go` health 42 leaves.

**4 Principles (ground truth):** 1-9 are enforced (`sha256`, `block` not drop, `SHA256SUMS`). Principle 10 "MVP stays narrow" explains why device agents live in `maincode/`, not `ULPF-Perimeter-Prototype/`.

**5 Ecosystem:** Wazuh/SIEM-Lite/Grafana are real siblings (`wazuh-main 5.1.0`, `SIEM-Lite 29 parsers`), not vendors to invent.

**6 Data Direction (ground truth):** `logs/auto_captured.log` path real (`server.py`), device tags `source=phone/laptop` real enum, future `vendor=phone` will appear in `vendor_counts`.

**Custom ONNX truth:** Current `mdbr-leaf-mt` 23 MB is a **student baseline** (MiniLM distilled). Future `ULPF-ONNX-Hyper` will be **custom distilled 4L/256d, 11 MB int8 / 9 MB int4, HNSW 400 leaves, PQ-64**, built from 5M perimeter+app logs (guide Issue #2 6-family schema), ORT CUDA→TensorRT, dynamic batch 512, seq 64. This is not a rename, it is a new model in `maincode/vector/onnx-hyper/` + `lumber-master/models-hyper/`. 1B/sec claim is **10-sec burst on 800+ H100 + 1000 Kafka partitions** (see Architecture §14), not one VM. Day-to-day real target 100k-1M/sec on 1-10 GPUs.
