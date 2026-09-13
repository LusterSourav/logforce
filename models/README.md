Models are not tracked in git due to size. Download once:

```bash
make download-models
sha256sum -c models/SHA256SUMS
```

Baked 23 MB quantized ONNX plus vocab and projection. SHA pin stops drift.
