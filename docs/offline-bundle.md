# Offline Bundle

Models are baked into `Dockerfile.lumber` (`COPY models /app/models`, no HF
pull at runtime). If the bundle was wiped, re-download once on a connected
host:

```bash
make download-models  # pulls MongoDB/mdbr-leaf-mt onnx, onnx_data, vocab, safetensors
sha256sum models/model_quantized.onnx models/vocab.txt | head
```

For containers:

```bash
docker compose build
docker save ulpf-perimeter ulpf-postgres | gzip > ulpf-perimeter.tar.gz
# air-gapped host
docker load < ulpf-perimeter.tar.gz
docker compose up
```

No extra secrets. `PG_DSN` is `postgres://ulpf:ulpf@postgres:5432/ulpf` in compose.
