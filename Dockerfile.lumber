FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache build-base
COPY ui/go.mod ui/go.sum* ./
RUN go mod download || true
COPY ui/server.go ./
COPY models ./models
RUN go build -o /out/logforce-server server.go

FROM alpine:3.19
RUN apk add --no-cache ca-certificates libgomp
WORKDIR /app
COPY --from=builder /out/logforce-server /usr/local/bin/logforce-server
COPY ui/dashboard.html /app/ui/dashboard.html
COPY models /app/models
ENV LUMBER_MODEL_DIR=/app/models
ENV STATIC_DIR=/app/ui
ENV PORT=8081
EXPOSE 8081
ENTRYPOINT ["logforce-server"]
