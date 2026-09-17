FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache build-base
COPY ui/go.mod ui/go.sum* ./
RUN go mod download || true
COPY ui/server.go ./
COPY models ./models
RUN go build -o /out/logforce-server server.go

FROM alpine:3.19
RUN apk add --no-cache ca-certificates libgomp curl tar
WORKDIR /app
COPY --from=builder /out/logforce-server /usr/local/bin/logforce-server
COPY ui/dashboard.html ui/dashboard-v2.html ui/docs.html ui/team.html /app/ui/
COPY ui/sourav.png ui/souvik.jpeg ui/swarnadeep.jpeg /app/ui/
COPY models /app/models
# fetch binaries excluded from git plus the linux onnxruntime lib matching go.mod v1.26.0
RUN curl -fSL -o /app/models/model_quantized.onnx https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/onnx/model_quantized.onnx \
 && curl -fSL -o /app/models/model_quantized.onnx_data https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/onnx/model_quantized.onnx_data \
 && curl -fSL -o /app/models/vocab.txt https://huggingface.co/MongoDB/mdbr-leaf-mt/resolve/main/vocab.txt \
 && curl -fSL -o /tmp/ort.tgz https://github.com/microsoft/onnxruntime/releases/download/v1.26.0/onnxruntime-linux-x64-1.26.0.tgz \
 && tar -xzf /tmp/ort.tgz -C /tmp \
 && cp /tmp/onnxruntime-linux-x64-1.26.0/lib/libonnxruntime.so.1.26.0 /app/models/libonnxruntime.so \
 && rm -rf /tmp/ort.tgz /tmp/onnxruntime-linux-x64-1.26.0
ENV LUMBER_MODEL_DIR=/app/models
ENV STATIC_DIR=/app/ui
ENV PORT=8081
EXPOSE 8081
ENTRYPOINT ["logforce-server"]
