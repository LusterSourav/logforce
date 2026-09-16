# Offline Bundle

Models are baked into `Dockerfile.lumber` (`COPY models /app/models`, no HF
pull at runtime). If the bundle was wiped, re-download once on a connected
host:

```bash
make download-models  # pulls MongoDB/mdbr leaf mt onnx, onnx_data, vocab, safetensors
sha256sum models/model_quantized.onnx models/vocab.txt | head
```

For containers:

```bash
docker compose build
docker save logforce-perimeter logforce-postgres | gzip > logforce-perimeter.tar.gz
# air gapped host
docker load < logforce-perimeter.tar.gz
docker compose up
```

No extra secrets. `PG_DSN` is `postgres://logforce:logforce@postgres/logforce` in compose.
