# ULPF, Expected Solution / Deliverables for Evaluation


---

## 1. What evaluators expect to receive

| # | Deliverable | Must contain | Where we deliver it | Status |
|---|---|---|---|---|
| **D1** | **Working prototype** (runnable, offline) | `raw → hash → OCSF 4001 → NDJSON → dashboard` one-command demo | `ULPF-Perimeter-Prototype/` + `maincode/` | **~84% done**, missing §5 gaps |
| **D2** | **Readme + Setup Instructions** | `setup → test → run → verify` that an evaluator can follow on a fresh laptop (no secrets) | `ULPF-README-Setup.md` (this pack) + `maincode/README.md` + `perimeter/README.md` | To be handed in (see companion file) |
| **D3** | **Architecture Document (max 2 pages)** | Strategy + high-level + sequence + device tier + frontend/backend + data/storage + deploy + scaling + prototype-vs-final delta, all on 2 pages | `ULPF-Architecture-2Page.md` (companion) + `perimeter/SYSTEM_ARCHITECTURE.md` + `SYSTEM_DESIGN.md` | To be handed in |
| **D4** | **Audit + Evidence Pack** | Line-by-line audit, % done/left, throughput honesty, reuse truth | `ULPF-Audit-Report-Detailed.md` + `ULPF-Docs/AUDIT.md` | Done |
| **D5** | **Offline / Air-Gapped bundle** | Pinned images + wheels + `models/` SHA pin, no HF pull at runtime | `maincode/offline/image-list.txt` 5 pins + `perimeter/models/` baked 58M + `offline/offline-prepare.sh` | 80%, tags not digests |
| **D6** | **Module docs (supporting)** | Design, Memory, Rules, Security & Review, Phases, References, Research, Operational, Financial, Market, Risks | `ULPF-Docs/` | Done, 6 gaps in `AUDIT.md` still noted |

**Submission layout evaluators open:**

```
ULPF-README-Setup.md ← D2 (your setup instructions)
ULPF-Architecture-2Page.md ← D3 (2-page arch)
ULPF-Audit-Report-Detailed.md ← D4 (this audit's line-by-line)
ULPF-Expected-Solution-Deliverables.md ← D1 described here + checklists
ULPF-Perimeter-Prototype/ ← D1 runnable perimeter slice (go + ingest + PG + parquet)
maincode/ ← D1 unified + observability + AI mock + phone Tile ingress
ULPF-Docs/ + ULPF-Deep-Research-Report.md ← D6
```

---

## 2. D1, What "Solution" means (and must demonstrably do)

### 2.1 Prototype solution (today, perimeter slice)

**Ingest → Classify → Store → Query → Dashboard loop:**

```
Firewall/IDS/App (Palo Alto/ASA/FortiGate/CEF/LEEF/Suricata/Zeek/syslog/JSON/CSV/XML)
 → Vector file source `perimeter/ingestion/vector.toml` (beginning, multiline, 2GB block)
 → VRL 3-phase `normalize_perimeter.vrl` (Phase0 hash `sha256(trim(raw))` → Phase1 one regex → Phase2 W/E/F → Phase3 OCSF 4001 type 400101 category 2 activity 1 severity F6/E4/W3 finding 200401 + integrity + unmapped)
 also `maincode/vector/transforms/normalize_outertune.vrl` (OuterTune Logcat threadtime), same contract
 → NDJSON `output/normalized/perimeter-%Y-%m-%d.ndjson` (also `maincode/output/normalized/`)
 → `storage/parquet_writer.py` poll 30s → Hive `year/month/day/class=4001/vendor=generic` (Snappy if pyarrow else NDJSON fallback) + `init.sql` PG `events(raw jsonb GIN)`
 → Go `:8081` 5 handlers `health|classify|ingest|query|stats` (`perimeter/ui/server.go`), classifies via Lumber `pkg/lumber 5ms: server.go,388ms cold:79` (42 leaves `lumber v0.10.6: go.mod:6`), then ingest persists
 → `ui/dashboard.html:909-916` paste/drop → `POST /api/classify` → `POST /api/ingest` → `refreshRealData 5s:992-1053`, KPI `Total Ingested 2→3` moves instantly, `POST /api/query:290-396` prunes, `GET /api/stats:398-513` 12×2h buckets
 → Bridges `parsing/ulpf_ocsf.py` OCSF + Lumber → `NormalizedEvent` GIN searchable, `decoders/perimeter.yml` 5 hot-swap decoders (Wazuh Engine shape)
```

**Non-functional constraints (hard):** air-gapped single binary, raw never lost (`unmapped.raw_event` + `integrity.canonical+hash` repro via `echo -n canonical | sha256sum`), when_full=block not drop (`vector.toml`), no cloud, 10 MB scanner, `file://` CORS `*: server.go`, fallback 503 mock `server.go,139,158`.

**Device signal:** header fingerprint (`OuterTune:`, `%ASA-`, `CEF:`), **one regex** adds the next firewall (`Rules.md` `paloalto_syslog | cisco_asa | … | ulpf_ocsf`).

### 2.2 Product solution (universal, what evaluation judges as vision, not blocker)

* **Any device auto-catch** (`Prd.md`): Win EventLog / macOS DiagnosticReports / Linux journald / Android `logcat+last_crash.log` via `TileService` / iOS `os_log` + Shortcuts, all `POST /capture {log≤4096, source, device, app} caps 4096 + sha16 window200 + 10MB image` `maincode/auto_capture/server.py,71` via **WireGuard `10.0.0.0/24`** to Azure free B1s/B1ms (`Architecture.md`, `Prd.md`).
* **VM-pod decode:** `capture.py` 6 keyword hints + `miner Drain3` + 10-step `pipeline.py` (sanitizer 21+9 → `localhost` `qwen2.5.5b` → validator 10 → tester 0.8/0.1 → Git PR → loader sentinel), **VM-only, never phone** (`ai_engine.py 127.0.0.1`).
* **Decode→Fix toast** (`Prd.md`): `{what, why, severity, fix_endpoint, curl}`, midnight `Copy curl → fixed`.
* **Custom `ULPF-ONNX-Hyper`** (`Architecture.md`): distilled 4L/256d/int4 + HNSW 400 leaves/PQ64 + ORT CUDA/TensorRT + dynamic batch 512 → single H100 120k/s, `maincode/vector/onnx-hyper/` + `lumber-master/models-hyper/` future.
* **Lakehouse + scale:** Parquet → DataFusion/ClickHouse, Kafka 300→1000 partitions + KEDA, `100k-1M/s on 1-10 GPUs` sustained, `1B 10-sec burst` only (`Prd.md`), sampled store (86 PB/day at 1B `Architecture.md`).

---

## 3. Grading checklist, what evaluators tick

### 3.1 Functional (prototype, must pass on evaluator laptop)

- [ ] `vector validate --no-environment.../vector.toml` + `vector test... 21 PASS` (`maincode/tests/test_normalize_outertune.yaml`, `perimeter` equivalent missing file noted)
- [ ] `go run./ui/server.go` → `lumber ready leaves=42: server.go` → `GET /api/health taxonomyLeaves 42`
- [ ] Paste CEF → `REQUEST.success`, ASA `%ASA-6-302013` → `ERROR.connection_failure`, JSON garbage → `UNCLASSIFIED 0.2` (`Security and review.md`)
- [ ] `Total Ingested 2→3` live after `POST /api/classify` (`dashboard.html`, previously in-memory-only, now fixed)
- [ ] NDJSON line has `class_uid 4001 type_uid 400101 severity_id F6/E4/W3 integrity.hash=sha256(trim) unmapped.raw_event` (repro via `sha256sum`)
- [ ] `POST /api/ingest?format=paloalto_syslog cisco_asa fortinet... ulpf_ocsf` → vendor cascade + `pg_inserted`
- [ ] `GET /api/stats` 12 buckets + `GET /api/query WHERE class_uid=4001` prune (90% claim for `class=4001` on Hive)
- [ ] `parquet_writer --watch` Hive `year/month/day/class/vendor` (`parquet_writer.py`, `31-45`), stub-aware (NDJSON under hive if no pyarrow)
- [ ] `ulpf_ocsf.py:parse()` yields `NormalizedEvent` + `raw` intact; `perimeter.yml` decoders hot-swappable
- [ ] `docker compose up` (perimeter `42L` + `maincode 156L` + `prototype.yml 33L`), healthchecks pass: `server.go` PG, `maincode docker-compose 25,43,57,79,97,112,129`
- [ ] `curl POST /capture {log:"E OuterTune Source Error 2000", source:"phone"} → hint` (`auto_capture/server.py` + `capture.py` auth failure)

### 3.2 Architecture & design (D3)

Evaluators read `ULPF-Architecture-2Page.md` expecting: strategy (modular monolith + Vector/VRL + Go ONNX edge, thin device + VM pod), high-level diagram (edge→ingest→core→store→view), midnight sequence (tile→WG→/capture→Drain3→LLM→toast), device tier table, frontend+backend tables, data shape, stack, deployment (day file:// vs night WireGuard), scaling path, prototype-vs-final delta, all on **2 pages** (mirrors `SYSTEM_ARCHITECTURE.md` + `SYSTEM_DESIGN.md` but trimmed). Mark for: one-regex plug, forensic block choice, offline bake + SHA pin.

### 3.3 Setup & reproducibility (D2)

Evaluators grade `ULPF-README-Setup.md` on: prereqs (Go 1.24, Vector 0.38.0-debian, Python 3.11, Docker), env exports, one-command offline tar (`offline-prepare.sh docker save | gzip`, `offline/image-list.txt` 5 pins, `perimeter/models/` 58M baked), test commands that actually pass, and **honest stub labels** (`Storage + Query stubs: pip install pyarrow/datafusion for real`).

### 3.4 Security & review (supporting)

Per `Security and review.md,42-51`: `raw+sha256` provenance, PG `$1` only (`server.go`), no secret commit (`.env.example` only), `SHA256SUMS` pinned, 10 MB scanner (`server.go`), `4096` cap + `sha16 window200` + `10MB` image (`server.py,74`), WireGuard `51820/udp` only + `8002` on `10.0.0.1` (`VM_POD.md`), sanitizer 21+9 before `localhost` (`ai_engine.py`), CORS `*` intentional for `file://`. PASS/WARN/DEFERRED table `Security and review.md`.

---

## 4. Gaps, how evaluation risk is mitigated

| Gap (the 16% prototype left) | Evaluator sees as… | Mitigation handed in |
|---|---|---|
| `generated_rules.vrl` empty, plug-and-play 0% | "pluggable?" unverified | Labelled as stub in audit + `PLAN.md`, fix is one `include` (1h, not a scope miss) |
| `finding.type_uid 200401 placeholder` + `1.3.0 vs 1.4.0` | "standard drift?" | Flagged in audit `§2.2` + `ocsf_4001_reference.json`, OCSF rename before external demo |
| Zero `*.parquet` (pyarrow commented) | "columnar missing?" | Hive+watcher done `§2.1`; fallback documented as intentional air-gap behaviour `parquet_writer.py` |
| Mock AI only | "learning missing?" | 10-step code proven `§2.1`; `prototype/docker-compose.prototype.yml` ollama exists but untested offline, mark as next sprint |
| `docs/ SHA256SUMS sample.log test_perimeter.yaml` missing, hardcoded `2026/09/11` | "repro?" | Listed in audit `§2.2 #8-9`, trivial stubs, not architectural |
| Throughput `1.6k/s vs 1B` | "inflated?" | Honest table §3 of this file + `Risks.md T-03` + `Prd.md` `1.6k prototype, 120k/H100, 100k-1M target, 1B 10-sec burst only` |

**The 70% product-universal left is NOT scored against the prototype grade**, it is `Phases 7-10` roadmap (`Phases.md`). Branch evidence (`Branch of ulpf/ 99 files` 5 branches merged) proves incremental delivery model, not vapour.

---

## 5. Acceptance criteria for hand-in

* **Hands-in that pass:** `vector validate+test 21 PASS`, health `leaves=42`, paste→chip, `2→3` live, NDJSON `class_uid 4001` + `sha256` repro, `format→vendor` cascade, `?format` 11 values, file fallback if PG down, one-regex doc, air-gapped bake + no HF pull, `docker compose ps` healthy, `POST /capture` hint. All line-cited above.
* **Stubs that are allowed to remain:** NDJSON-under-Hive, DataFusion string fallback, mock fallback 503, `owl:NG` tile not built, provided they are **labelled** (`parquet_writer.py header says stub`).
* **Must fix before external judging:** OCSF `200401` rename, generate `SHA256SUMS` + docs stubs, wire `generated_rules.vrl` include.

---

## 6. Deliverables manifest (what to zip)

```
ULPF-README-Setup.md
ULPF-Architecture-2Page.md
ULPF-Audit-Report-Detailed.md
ULPF-Expected-Solution-Deliverables.md ← this file
ULPF-Perimeter-Prototype/ (models baked, output fixtures, init.sql)
maincode/ (vector+VRL 21TC, miner 8001, ai_solver 10-step mock, storage stubs, observability 27 panels, auto_capture 8002, prototype overlay, docs)
ULPF-Docs/ + guide/ + example docc/
lumber-master/ + SIEM-Lite-main/ + wazuh-main/ + siembol-main/ (reference reuse, not submission bulk, cite `Report`)
```
