.PHONY: download-models verify health classify watch clean

MODEL_DIR := models
PORT ?= 8081

download-models:
	@mkdir -p $(MODEL_DIR)
	@echo "fetch 23 MB quantized ONNX from HuggingFace"
	@curl -fSL --progress-bar -o $(MODEL_DIR)/model_quantized.onnx https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/onnx/model_quantized.onnx || echo "download failed, check network"
	@curl -fSL --progress-bar -o $(MODEL_DIR)/model_quantized.onnx_data https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/onnx/model_quantized.onnx_data || true
	@curl -fSL -o $(MODEL_DIR)/vocab.txt https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/vocab.txt || true
	@mkdir -p $(MODEL_DIR)/2_Dense
	@curl -fSL --progress-bar -o $(MODEL_DIR)/2_Dense/model.safetensors https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/2_Dense/model.safetensors || true
	@sha256sum $(MODEL_DIR)/model_quantized.onnx $(MODEL_DIR)/vocab.txt 2>/dev/null | head

verify:
	@echo "vector syntax"
	@vector validate --no-environment ingestion/vector.toml 2>&1 | head -n 20 || echo "vector not installed, skipping"
	@echo "parsing import"
	@python -c "from parsing.logforce_ocsf import parse; print('logforce_ocsf ok')" 2>&1 | head
	@echo "wazuh decoders"
	@ls parsing/decoders/perimeter.yml 2>&1 | head

health:
	@curl -s http://localhost:$(PORT)/api/health | python -m json.tool

classify:
	@curl -s -X POST http://localhost:$(PORT)/api/classify -H "Content-Type: application/json" -d '{"logs":["ERROR UserService - connection refused host=db-primary","GET /api/users 200 OK 12ms"]}' | python -m json.tool | head -n 40

watch:
	@python storage/parquet_writer.py --watch

clean:
	@rm -rf output
