# ui
Dashboard and Go API for perimeter prototype. Dashboard is a single HTML file. Server wraps the 23 MB ONNX.

Open `dashboard.html` directly if you only need the mock. Run the Go server for real 5 ms inference.

```bash
# from this folder
go run server.go
# open http://localhost:8081/dashboard.html
# or http://localhost:8081/api/health
```

Env
- LUMBER_MODEL_DIR defaults to ./models or ../models. Put the quantized ONNX there.
- PORT defaults to 8081
- STATIC_DIR defaults to .
