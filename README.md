# ULPF Perimeter Prototype

Perimeter logs in, OCSF out. Keeps the raw, works offline, runs in a container.

## Quick start

```bash
# 1. models are already baked; re-download only if you wiped the folder
make download-models

# 2. run the API and open the dashboard
go run./ui/server.go
open http://localhost/dashboard.html
# also works as file:// open, dashboard falls back to mock if the Go server is not running

# 3. try Vector ingestion
export PERIMETER_LOG_PATH=./ingestion/sample.log
export PERIMETER_SINK_PATH=./output/normalized/perimeter-%Y-%m-%d.ndjson
vector --config ingestion/vector.toml --dangerously-allow-env-var-interpolation

# 4. watch NDJSON become Hive
python storage/parquet_writer.py --watch
```

## Folder tour

* `ui` ,  `dashboard.html` and `server.go`. One HTML file, no build step. Serves on:8081 with a real 23 MB ONNX model and a mock fallback.
* `models` ,  quantized ONNX (`model_quantized.onnx` + `onnx_data`), `vocab.txt`, `2_Dense/model.safetensors`, plus `SHA256SUMS` pin.
* `ingestion` ,  Vector config and VRL. Phase 1 regex is the only line you change per device.
* `parsing` ,  SIEM-Lite bridge `ulpf_ocsf.py` and Wazuh decoders `perimeter.yml` (5 hot-swap decoders).
* `storage` ,  Hive writer `year/month/day/class/vendor` with a 30s watcher. Drops to NDJSON under the hive path if pyarrow is missing.
* `docs` ,  `wiring-vector-to-wazuh.md` and `offline-bundle.md`.

## Design docs

* `SYSTEM_DESIGN.md` ,  why each folder exists, in order.
* `SYSTEM_ARCHITECTURE.md` ,  runtime, deployment and scaling, with diagrams.

## Verify

```bash
curl -s http://localhost/api/health | python -m json.tool
curl -s -X POST http://localhost/api/classify -H "Content-Type: application/json" \
  -d '{"logs":["ERROR UserService ,  connection refused host=db-primary"]}' | python -m json.tool
python -c "from parsing.ulpf_ocsf import parse; print(list(parse(open('output/normalized/perimeter-2026-09-11.ndjson').read()))[])"
vector validate --no-environment ingestion/vector.toml
vector test ingestion/vector.toml tests/test_normalize_perimeter.yaml
```

Air-gapped: models are baked into the image. No HF pull at runtime. See `docs/offline-bundle.md`.
