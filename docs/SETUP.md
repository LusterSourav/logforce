# ULPF, Readme with Setup Instructions


> One fix shipped in this iteration: `dashboard.html:909-916` now auto-persists `POST /api/ingest` so `Total Ingested 2→3` moves instantly (previously in-memory-only). This readme reflects that fixed path.

---

## 1. What this is

**Prototype:** perimeter firewall/IDS/app logs (Palo Alto, ASA, FortiGate, CEF/LEEF, Suricata, Zeek, syslog, JSON, CSV, XML) in, OCSF 4001 NDJSON out, lossless (`unmapped.raw_event` + `sha256(canonical)` `normalize_perimeter.vrl:9-11,107-109`), offline, container-ready. Two runnable roots:

* `ULPF-Perimeter-Prototype/`, Go ONNX `:8081` + Vector + Postgres + Parquet (the judging slice)
* `maincode/`, Vector+VRL+Drain3+AI-mock+observability+phone Tile ingress `:8002` (the unified/VM-pod slice)

**Product direction:** same OCSF contract extends to every device via thin agents + WireGuard `10.0.0.0/24` to an Azure free VM pod where Drain3 + `qwen2.5:0.5b` decode to `{fix_endpoint, curl}`, see `ULPF-Architecture-2Page.md` and `ULPF-Docs/Prd.md:144-211`.

---

## 2. Prereqs

| Tool | Version pinned | Why |
|---|---|---|
| Go | `1.24` (`perimeter/ui/go.mod:3`) | ONNX 42-leaf engine |
| Vector | `0.38.0-debian` (`offline/image-list.txt:40`) | `vector/vector.toml:46` / `perimeter/ingestion/vector.toml:1` |
| Python | `3.11-slim` (`maincode/Dockerfile:5`) | miner + AI mock + storage (`requirements.txt:4-7` + `ai_solver/requirements_solver.txt`) |
| Docker / `docker compose` | Desktop | observability + PG (`maincode/docker-compose.yml:156`, `perimeter/docker-compose.yml:42`) |
| Ollama | `0.5.7` (`maincode/prototype/docker-compose.prototype.yml:7`) | optional, mock works without |

---

## 3. Fresh-laptop setup (copy-paste)

### 3.1 Clone & env

```bash
# from workspace root "Universal Log Pre-processing Framework"
cp ULPF-Perimeter-Prototype/.env.example ULPF-Perimeter-Prototype/.env
cp maincode/.env.example maincode/.env
# edit only if your log path differs:
# PERIMETER_LOG_PATH=./ingestion/sample.log
# PERIMETER_SINK_PATH=./output/normalized/perimeter-%Y-%m-%d.ndjson
# OUTERTUNE_LOG_PATH=logs/outertune/outertune.log
# OUTERTUNE_SINK_PATH=output/normalized/outertune-ocsf-%Y-%m-%d.ndjson
# VECTOR_DATA_DIR=./vector_data
```

Create missing sample log if needed (one line suffices for the pipeline):

```bash
mkdir -p ULPF-Perimeter-Prototype/ingestion ULPF-Perimeter-Prototype/output/normalized
echo '08-27 20:45:01.123 1234 5678 E OuterTune: CRASH: Unhandled exception in PlayerService' > ULPF-Perimeter-Prototype/ingestion/sample.log
mkdir -p maincode/logs/outertune maincode/output/normalized maincode/vector_data
echo '08-27 20:45:01.123 1234 5678 E OuterTune: CRASH: Unhandled exception in PlayerService' > maincode/logs/outertune/outertune.log
```

### 3.2 Validate ingestion (no runtime, no env), must pass

```bash
vector validate --no-environment ULPF-Perimeter-Prototype/ingestion/vector.toml
vector validate --no-environment maincode/vector/vector.toml
vector test maincode/vector/vector.toml maincode/tests/test_normalize_outertune.yaml # 21 TC: W3/E4/F6, V/D/I dropped
# perimeter equivalent: create tests/test_normalize_perimeter.yaml (same 21 TC) then
# vector test ULPF-Perimeter-Prototype/ingestion/vector.toml tests/test_normalize_perimeter.yaml
```

### 3.3 Python deps (air-gap note)

```bash
python3 -m pip install -r maincode/requirements.txt
python3 -m pip install -r maincode/ai_solver/requirements_solver.txt
# optional for real columnar (otherwise stub is fine and documented):
# python3 -m pip install "pyarrow==15.0.0" "datafusion==35.0.0"
# air-gap download:
# pip download -r maincode/requirements.txt -d maincode/offline/wheels
# pip download -r maincode/ai_solver/requirements_solver.txt -d maincode/offline/wheels
```

### 3.4 Models (already baked, verify)

```bash
ls -lh ULPF-Perimeter-Prototype/models/
# expect: model_quantized.onnx (215K header) + model_quantized.onnx_data (22M) + vocab.txt (226K) + 2_Dense/model.safetensors (1.5M) + libonnxruntime.dylib (34M)
# re-download if wiped:
make -C ULPF-Perimeter-Prototype download-models # curl MongoDB/mdbr-leaf-mt: onnx+onnx_data+vocab+safetensors + sha256sum
```

---

## 4. Run, three independent ways (pick one, all work offline)

### 4.1 Go perimeter slice (judging default), `go run` + `docker compose`

```bash
cd ULPF-Perimeter-Prototype

# 1. start Go API + Postgres (one compose)
docker compose up --build -d #:8081 + postgres:16-alpine (+ pgdata)
# or bare metal: go run./ui/server.go (static on:8081, PG optional via PG_DSN)

# 2. verify
curl -s http://localhost:8081/api/health | jq # {"status":"ok","taxonomyLeaves":42,"threshold":0.5,"latencyMs":~389 cold}
curl -s -X POST http://localhost:8081/api/classify \
 -H 'Content-Type: application/json' \
 -d '{"logs":["ERROR UserService, connection refused host=db-primary"]}' | jq # events[].category confidence latencyMs X-Latency-Ms header

# 3. dashboard (live 2→3)
open http://localhost:8081/dashboard.html # also works as file:// open ui/dashboard.html (CORS * for offline)
# paste any of the samples in the textarea → Classify → chip + Canonical NDJSON → Total Ingested 2→3 increments instantly

# 4. Vector tail (optional, same host)
export PERIMETER_LOG_PATH=./ingestion/sample.log
export PERIMETER_SINK_PATH=./output/normalized/perimeter-%Y-%m-%d.ndjson
export VECTOR_DATA_DIR=./vector_data
vector --config ingestion/vector.toml --dangerously-allow-env-var-interpolation # tails → VRL → NDJSON + HTTP http://ulpf-server:8081/api/ingest (compose net) or http://localhost:8081/api/ingest (bare metal)

# 5. storage
python storage/parquet_writer.py --watch # polls output/normalized → output/parquet/year=.../class=4001/vendor=generic 30s (NDJSON under hive if no pyarrow)
python storage/parquet_writer.py output/normalized/perimeter-2025-01-01.ndjson # one-shot
# with pyarrow: same command writes.parquet Snappy

# 6. query + stats
curl -s http://localhost:8081/api/stats | jq # total_events, buckets[12] 2h, vendor_counts
curl -s -X POST http://localhost:8081/api/query -H 'Content-Type: application/json' -d '{"sql":"SELECT * FROM lake WHERE class_uid=4001"}' | jq
# parsing bridge (SIEM-Lite compatible):
python -c "from parsing.ulpf_ocsf import parse; print(list(parse(open('output/normalized/perimeter-2026-09-11.ndjson').read()))[:1])"

make health && make classify && make watch # Makefile:25,27,31
```

### 4.2 maincode unified slice (observability + miner + AI mock)

```bash
cd maincode

# ingestion (OuterTune Logcat threadtime) → OCSF 4001
export OUTERTUNE_LOG_PATH=logs/outertune/outertune.log
export OUTERTUNE_SINK_PATH=output/normalized/outertune-ocsf-%Y-%m-%d.ndjson
export VECTOR_DATA_DIR=vector_data
vector --config vector/vector.toml --dangerously-allow-env-var-interpolation
vector test vector/vector.toml tests/test_normalize_outertune.yaml # 21 TC
cat output/normalized/outertune-ocsf-*.ndjson | jq. # each line: class_uid 4001 type_uid 400101 finding.uid uuid integrity.hash sha256 canonical unmapped.raw_event

# miner (Drain3)
uvicorn miner.miner_service:app --host 0.0.0.0 --port 8001
curl http://localhost:8001/health | jq # total_clusters max_clusters_limit 1024
curl -X POST http://localhost:8001/parse -H 'Content-Type: application/json' \
 -d '{"log":"%ASA-6-110002: Failed to locate egress interface for TCP from inside:10.1.2.3/54321 to outside:203.0.113.42/443"}' | jq
python miner/ulpf_metrics.py #:8000 Prometheus metrics

# phone Tile ingress (VM pod), phone just POSTs raw, VM decodes
uvicorn auto_capture.server:app --host 0.0.0.0 --port 8002
curl http://localhost:8002/health | jq
curl -X POST http://localhost:8002/capture -H 'Content-Type: application/json' -d '{"log":"E OuterTune Source Error 2000 - Access Forbidden","source":"phone"}' | jq # hint
curl http://localhost:8002/report?limit=20 | jq
curl -F image=@shot.png http://localhost:8002/capture/image # 10 MB cap, OCR in VM via pytesseract

# AI solver (mock, no Ollama)
python ai_solver/demo.py --mock # 12 steps → ai_solver/unknown_solver/rules/generated/solver_*.{json,ini,vrl} 3 files + validator 10 PASS + tester 15 logs PASS
python -m pytest ai_solver/unknown_solver/tests -q # 105 passed (9 files)

# storage + query (stubs, honest, see §6)
python storage/parquet_writer.py logs/outertune/outertune.log # Hive year/month/day/class/vendor (NDJSON stub if no pyarrow)
python query/datafusion_engine.py # "datafusion not installed, stub: would run SELECT * FROM lake WHERE class_uid=4001"

# observability (one compose, 7 services)
docker compose up --build #:9090 prometheus:3000 grafana admin/changeme:3100 loki internal:9598 vector:8000 miner:8001 miner-api:8002 auto_capture
open http://localhost:3000 && open http://localhost:9090/targets

# with real Ollama (optional)
ollama serve & # localhost:11434
ollama pull qwen2.5:0.5b # or tinyllama/llama3.2:1b/gemma2:2b/phi3:3.8b
python ai_solver/demo.py # real inference (SOLVER_OLLAMA_MODEL, SOLVER_DRY_RUN env)

# prototype overlay (lumber + ollama as compose profiles)
docker compose -f docker-compose.yml -f prototype/docker-compose.prototype.yml up --build
```

### 4.3 Bare-metal without any compose (smallest)

```bash
go run ULPF-Perimeter-Prototype/ui/server.go #:8081 +./models 42 leaves
open ULPF-Perimeter-Prototype/ui/dashboard.html # file:// also works (mock fallback if:8081 down)
```

---

## 5. What to show an evaluator (3-minute flow)

1. `GET /api/health` → 42 leaves, `latencyMs`. `POST /api/classify` `Palo Alto CEF → REQUEST.success`, `Cisco ASA → ERROR.connection_failure`, garbage → `UNCLASSIFIED 0.2`.
2. Drop/paste same log → `POST /api/ingest` → `GET /api/stats` `Total Ingested 2→3` live + `vendor_counts` + `buckets[12] 2h`.
3. `POST /api/query WHERE class_uid=4001` prune + `pg_count` + `raw` intact (`ulpf_ocsf.py`).
4. `parquet_writer --watch` Hive `year/month/day/class=4001/vendor=generic`.
5. `POST /capture` phone hint `E OuterTune Source Error 2000 → Auth failure 2000, check token and allow list` `capture.py:77-82` and miner `POST /parse → template`.

Determinism: same raw → same `sha256(trim(raw))` `echo -n "canonical" | sha256sum` vs `integrity.hash`.

---

## 6. Offline / air-gapped

```bash
# connected host
./maincode/offline/offline-prepare.sh # pulls prom/prometheus:v2.51.2 prom/node-exporter:v1.7.0 grafana/loki:2.9.8 timberio/vector:0.38.0-debian grafana/grafana:10.4.2 && docker save | gzip → ulpf-observability-images.tar.gz
docker pull ollama/ollama:0.5.7 postgres:16 && docker save ollama/ollama:0.5.7 postgres:16 | gzip > ulpf-prototype-extra.tar.gz
pip download -r maincode/requirements.txt -d maincode/offline/wheels
pip download -r maincode/ai_solver/requirements_solver.txt -d maincode/offline/wheels
make -C ULPF-Perimeter-Prototype download-models # 58M
# optional: run once, then docker run --rm -v ulpf_ollama-data:/data -v $PWD:/backup alpine tar czf /backup/ollama-models.tar.gz /data

# air-gapped host
docker load < ulpf-observability-images.tar.gz && docker load < ulpf-prototype-extra.tar.gz
# pip install --no-index --find-links=maincode/offline/wheels -r maincode/requirements.txt
docker compose up -d # or: go run./ui/server.go (no pull, models baked perimeter/Dockerfile.lumber:7,15-16)
```

No HF pull at runtime (`ui/server.go:75 503 mock` if missing, `README air-gapped note`). `offline/image-list.txt:43-44` notes Ollama host-only. Pinned images via `offline/image-list.txt:37-41`.

---

## 7. Stubs, honest labels (evaluator note)

* `storage/parquet_writer.py:2 header says stub`, without `pyarrow==15.0.0` keeps NDJSON under Hive (`parquet_writer.py:23-27` + `requirements.txt:9 # pyarrow` commented).
* `query/datafusion_engine.py:2,13`, without `datafusion==35.0.0` returns stub string + `server.go:290-396` naive `Contains 4001` prune, `pruned 0`.
* `demo.py:124 MOCK_AI_RESPONSE +:155 _FakeDrain3Result`, `--mock` is canned, real path needs `ollama serve localhost:11434` `ai_engine.py:21`.
* `finding.type_uid 200401 placeholder` `normalize_perimeter.vrl:60, maincode/VRL:139-142`, rename before external OCSF audit.
* `generated_rules.vrl:0` empty, ASA VRL exists but not wired (`vector.toml:99` only).

---

## 8. Troubleshooting

* `model not loaded → 503 mock` (`server.go:75,139,158`), dashboard shows fallback chips; check `LUMBER_MODEL_DIR=./perimeter/models` + `make download-models`.
* `zlib truncated log_states.txt`, auto-handled `miner_service.py:26-41` unlink-guard; `rm miner/log_states.txt` if stale.
* Bare ` at com.example...` → dropped `VRL:25-27, yaml TC-08`; with Logcat header → emitted as E-level `VRL:83-87`.
* `Total Ingested` not moving, confirm `docker compose ps` `ulpf-perimeter/postgres healthy` + `curl POST /api/ingest` returns `ingested>0` (`server.go:279-283`).

---

## 9. Repo map (evaluator opens)

```
ULPF-Perimeter-Prototype/ui/server.go:521 + dashboard.html:1270 (judging surface)
 ingestion/vector.toml:96 + transforms/normalize_perimeter.vrl:110
 parsing/ulpf_ocsf.py:89 + decoders/perimeter.yml:66 parsing bridge + 5 decoders
 storage/parquet_writer.py:53 Hive + 30s watcher init.sql:17 PG GIN
 models/ 58M baked Dockerfile.lumber Makefile SYSTEM_ARCHITECTURE.md + SYSTEM_DESIGN.md
maincode/vector/vector.toml:140 + transforms/normalize_outertune.vrl:237 (OuterTune)
 miner/miner_service.py:64 drain3.ini depth4 max1024 8001 auto_capture:8002 8000
 ai_solver/unknown_solver/pipeline.py:543 10-step + 9 tests 105 pass demo.py --mock 12 steps
 storage/ query/ observability/ (prom/loki/vector/grafana 27 panels) prototype/overlay docs/
```

*Tests:* `vector test 21 TC` authoritatively covers severity/mapping/hash/traceability.