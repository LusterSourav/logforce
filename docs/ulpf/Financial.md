# Financial, ULPF

**Topic:** Infrastructure Requirements, CPU Suitability, and Deployment Cost 
**Scope:** MVP Perimeter (`ULPF-Perimeter-Prototype/`) + Fleet Universal (`maincode/`) + Custom `ULPF-ONNX-Hyper` Scale Tier 
**Category:** Cost & Capacity Planning

## 1. What infrastructure does the MVP actually require?

**The perimeter MVP runs on a single ordinary host. Verified `docker-compose.yml` 8 services + 1 Go binary. No Kubernetes, no GPU.**

| Layer | Component (verified path) | Purpose | Mandatory? |
|---|---|---|---|
| **Ingest** | Vector `timberio/vector.38.0-debian` (`vector/vector.toml` + `vector.yaml`) | File tail `PERIMETER_LOG_PATH`, multiline `^\s+at\s+`, disk buffer 2 GB `block`, VRL `normalize_outertune.vrl` → OCSF 4001 | Yes |
| **Classify** | Go `ulpf-server` (`ui/server.go` 5 handlers) + `models/model_quantized.onnx` 215K + `model_quantized.onnx_data` 22M + `libonnxruntime.so/dylib` 34M = **58M total** (`lumber-master/models`) | WordPiece 128 → 3 tensors → mean-pool → 1024d → cosine 42 leaves → `POST /api/classify` `~5 ms` warm, `50-80 ms/100 lines` batch | Yes |
| **Store** | `init.sql` Postgres `postgres-alpine` + `events` table + `GIN raw jsonb_path_ops` + `pgdata` volume (`docker-compose.yml`) | Append-only `raw jsonb`, `class_uid`, `vendor`, `ingested_at` indexes; `GET /api/stats` + `POST /api/query` prune | Yes (file `output/normalized` works without PG, but PG gives GIN) |
| **Ship** | Python `storage/parquet_writer.py` Hive `year/month/day/class/vendor` Snappy (+ NDJSON fallback if no `pyarrow`) | `DataFusion` prune `WHERE class_uid=4001` | Yes (file sink + watcher) |
| **Observe** | Prometheus `prom/prometheus:v2.51.2`, Loki `grafana/loki.9.8`, Grafana `grafana/grafana.4.2`, Node Exporter `prom/node-exporter:v1.7.0` (`offline/image-list.txt`) + `miner`/`miner-api`/`auto_capture` (`docker-compose.yml,99,114`) | Metrics `/metrics`, `GET /health`, dashboards 18→27 panels, `POST /capture` for devices | Observability: optional for perimeter demo, mandatory for fleet |
| **Offline AI (stub)** | `ai_solver/unknown_solver/ai_engine.py` Ollama `localhost` (host, not container) `qwen2.5.5b` 0.52 GB (or `llama3.2b`) | Sanitized-only decode → `fix_endpoint` + rule synthesis | No for perimeter demo; Yes for "night panic" fix |
| **WireGuard** | `wg-quick@wg0` `10.0.0.0/24` (`docs/VM_POD.md`, `PHONE_TILE.md`) | Phone → pod `POST https://10.0.0.1/capture` from anywhere | No for localhost demo; Yes for remote device fleet |

**Minimum to show the "2→3 live" demo (laptop only):** `go run./ui/server.go` + `output/normalized/` (no Docker, no PG, no Vector) → `http://localhost/dashboard.html` already proves lifecycle. Add `docker compose up vector postgres` to prove lossless lake + GIN.

**Air-gap bundle:** `offline/offline-prepare.sh` + `image-list.txt` 5 pinned images + `pip download wheels` + `~/.ollama/models` copy + `make -C lumber-master download-model` (`lumber Makefile`). No HF pull at runtime (`README.md` Apache 2.0).

## 2. Is it intended to run on ordinary CPU machines?

**Yes, perimeter MVP is CPU-only by design. GPU is only for the future 1B/sec burst tier.**

| Mode | Where ONNX runs | CPU / RAM | Throughput measured |
|---|---|---|---|
| **Prototype (today)** | Go host CPU, int8, `intra_op 4` (`onnx.go`) | Any x86_64/ARM64 laptop: 2 vCPU / 2 GB free | ~1.6k lines/sec/instance (100 lines / 60 ms) |
| **VM-pod Free Tier** | Azure `B1s` 1 vCPU/1 GB or `B1ms` 1 vCPU/2 GB (Student Pack) + same int8 ONNX | Ordinary CPU | Same 1.6k/s; `qwen2.5.5b` decode 0.8s on same CPU, feasible |
| **Tuned CPU (no GPU)** | `D4s_v3` 4 vCPU, ONNX int8, batch 512, 8 threads, seq 64, trim vocab 12k | Ordinary CPU (no GPU) | **~15k/sec** (Hyper §14) |
| **Future 1B/sec burst** | `ULPF-ONNX-Hyper` 4L/256d int4 AWQ + CUDA/TensorRT EP + HNSW 400 leaves + gRPC batching | **GPU required**: A10G ~45k/s, H100 ~120k/s per GPU | 100M/sec = 800 H100, 1B/sec = 833 H100 (10-sec burst, not 24/7) |

**Why not phone:** `libonnxruntime.dylib` 34M + model 22M = 58M + no NNAPI delegation +电池 drain, phone stays thin `POST` via WireGuard (`SYSTEM_ARCH.md` `never phone`). So "ordinary CPU machine" = dev laptop + free Azure B1s is enough for the prototype and even for 100k logs/day.

## 3. Approximate deployment cost (honest, no fake "₹0 forever")

### 3.1 Perimeter MVP (today you demo locally)

| Hosting | Monthly | Notes |
|---|---|---|
| **Local laptop** | **₹0 / $0** | `go run` + Docker Desktop (free personal). No cloud. |
| **Azure Student, B1s (1 vCPU/1 GB, 750h/mo free 12 mo)** | **$0 for 12 mo** + $100 credit (no CC for initial $100, `education.github.com/pack`) | Enough for perimeter MVP + `qwen2.5.5b` if Loki disabled |
| **Azure Student, B1ms (1 vCPU/2 GB)** | $0 within $100 credit; after credit **~$12/mo** | Recommended min for `prom/loki` + small LLM together |
| **Azure B2s (2 vCPU/4 GB)** | **~$30/mo** (pay-as-you-go after credit) | Comfortable for `gemma2b` |
| **Oracle Always Free** `VM.Standard.E2.1.Micro` (1 OCPU/1 GB, forever) | **$0 forever** | Alternative, ARM `A1` 4 OCPU/24 GB also free tier |
| **Postgres + storage** | Included in VM disk (50 GB Standard SSD **~$4/mo**); `pgdata` volume local | No managed PG cost |
| **Public IP** | Free while VM running (Azure) | NSG only `51820/udp` WireGuard |
| **GitHub** | Free (2000 Actions min, private OK) | Runner ephemeral outbound 443 only |

**Cheapest honest student path:** Claim pack → `az vm create --size Standard_B1s` → `docker compose up -d` → **$0 for 12 months**. After 12 mo, either stay on Oracle free forever or pay ~$8-12/mo for B1s.

### 3.2 Fleet / Universal (when you add all-device auto-capture)

Same as above; no extra cost, `auto_capture` + `miner` already in `docker-compose.yml,114`.

### 3.3 1B/sec burst tier (custom Hyper, not for daily, for benchmark slide)

| Target sustained | Fleet to rent | Cost per burst (honest) | Storage reality |
|---|---|---|---|
| **100k/sec** | 1× H100 | ~$3/hr | PG GIN + Parquet OK |
| **100M/sec** | 800× H100 + 300-partition Kafka + ClickHouse | **~$2,400/min** → **$400 per 10-sec burst** | Sample 1% raw (0.86 TB/day raw vs 86 TB) |
| **1,000M/sec (1B)** | **833× H100** (120k/s each) **or** 22k× A10G, 1000 partitions, ClickHouse, sampled store | **$10-20k per 10-sec burst**, **demo slide only, not 24/7** | 86 PB/day at 1 KB/line → impossible to store 24/7 → `vendor_counts` 100% + 1% raw S3 |

**Ground truth:** Prototype 1.6k/s × 625,000 instances = 1B/s on CPU, impossible on one VM. Hyper GPU gets 120k/s/GPU, still needs 800+ GPUs. **Do not claim "1B on one free VM".** Claim: "Single GPU 120k/s; free VM 1.6k/s; fleet burst 1B/10 sec on 800 H100 (sampled store). Day-to-day prod target **100k-1M/s on 1-10 GPUs**, already beyond any campus SIEM."

**TL;DR for finance slide:**

- **Demo today:** ₹0 (laptop) or $0/12 mo (Azure B1s student).
- **Fleet universal with decode+fix:** $0-30/mo (B1s/B2s).
- **1B/sec burst benchmark:** $10-20k per 10-sec burst on 800 H100, cite as burst, not bill.
