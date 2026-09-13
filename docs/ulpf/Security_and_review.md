# Security and Review, ULPF

## 1. Purpose

Define minimum security, integrity, and review checks for the **Perimeter prototype** and the path to **Universal**. Prototype is mostly public/open perimeter logs, but the pipeline must already preserve integrity, avoid loss, and stay offline-ready for future controlled enterprise data.

---

## 2. Security Objectives

1. Preserve `raw` + `sha256` integrity for forensics.
2. Protect `PG_DSN` / `models` / `vector_data` from tampering.
3. Prevent ingestion of malformed/malicious NDJSON from corrupting lake or PG.
4. Keep dashboard classification from being abused as injection vector.
5. Maintain auditability (what was ingested when, via which `format`).
6. Keep air-gapped build reproducible (`SHA256SUMS`).

---

## 3. Authentication & Authorization

Prototype today: **no auth**, single-host air-gapped (`ulpf:ulpf`, CORS `*` for `file://`).

Final all-device pod: **WireGuard is the auth.** No user/pass for logs.
- `VpnService` + WireGuard keys (`wg genkey` per device, `wg-quick@wg0` on Azure B1s `10.0.0.1/24`). Only holder of private key reaches `10.0.0.1` (`POST /capture` not public). Azure NSG only opens `51820/udp`; `8002` bound to `10.0.0.1` inside tunnel.
- Phone QS tile tap = handshake; laptop `wg-quick up`; `adb reverse` for USB lab (no VPN).
- Future RBAC: per-`source` (phone/laptop/firewall) as `vendor` tag, per-app `source` field, ready for OIDC when multi-tenant.

Never:
- commit real `.env`/WireGuard `*.conf`/`*.key` (only `.env.example` + `wg0.conf.example`);
- store plaintext API keys (none).

---

## 4. API Security

Every endpoint enforces:

| Endpoint | Validation | Limits | Errors | Where |
|---|---|---|---|---|
| `POST /api/classify` | `[]string` logs | 10 MB scanner, batch 100 | 400/503 mock | Go `` on pod |
| `POST /api/ingest[?format=]` | NDJSON trim, `vendor` cascade | 10 MB, capped | no raw leak | Go `` |
| `POST /api/query` | substring `4001` only + placeholder `$1` | 200 cap | safe | Go `` |
| `GET /api/stats` | read-only |, | `pg_count=-1` if down | Go `` |
| `POST /capture` (future) | `log≤4096` + `source` enum + `sha16` dedup | 4096 cap, Carb., `window200`, 10 MB log rotate | never raw; deduped→200 | `auto_capture` via WG only (not public) |
| `POST /capture/image` | `multipart ≤10 MB` | 10 MB, OCR on VM only | no exec | `auto_capture` WG |
| `GET /report`, `GET /health`, `POST /capture/launch` | read tail | limit 20 | safe | `8002` WG |
| `POST /parse` | `log` string |, |, | `miner` internal |

Protect: SQL `$1` only, no shell from `hint`, path `Join(base,…)` only, no `log→AI` raw (sanitizer only).

---

## 5. Ingest Security

Vector: `when_full=block` not drop prevents loss-driven attacks; disk 2 GB cap blocks tail, not head. VRL `drop_on_abort/drop_on_error=true` discards poison lines.

Go ingest: `bufio.Scanner` 64KB init, 10 MB max; empty lines skipped; per-line `json.Unmarshal` tolerated (bad line skipped, counted in `lastErr`).

---

## 6. Storage & File Security

- Allow-list is implicit: only `*.ndjson` under `output/normalized` and `output/parquet/year=*/month=*/day=*/class=*/vendor=*`.
- `MkdirAll` only under those roots.
- `parquet_writer.py` falls back to NDJSON under hive when `pyarrow` missing, no exec of uploaded content.
- `init.sql` `raw jsonb` GIN index is safe; `events` append-only (no update/delete API).

---

## 7. Model Supply Chain

- Models baked into image (`models/*.onnx`, `2_Dense/`, `vocab.txt`);
- `SHA256SUMS` pinned; offline bundle tar verified before `docker compose up`;
- `lumber v0.10.6` via `ui/go.mod` `require`;
- No HF pull at runtime (README air-gapped note).

---

## 8. Dashboard / AI Security (Prototype → Pod small LLM)

- Prototype: pasted log is data, not instruction; `realONNX` fallback `UNCLASSIFIED 0.2`.
- Pod LLM is **VM-only, localhost:11434, never phone** (`ai_engine.py` binds `127.0.0.1`). Phone only POSTs raw via WireGuard.
- Defenses (10-step `pipeline.py`): Sanitizer 21 redact (IP/token/JWT/GitLab PAT) + 9 injection patterns → nonce-delimited prompt (`prompt_builder.py`) → truncated 2048 → `format:json` + temp 0.1 → Validator 10 checks → Tester 0.8/0.1 → Git PR → Loader sentinel. AI never sees token/env, never `exec`.
- `Blob` download never executes log.

---

## 9. Data Privacy

Minimize PII: prototype stores only what the log contains. Future tenants must define retention per `output/parquet` Hive partition.

Do not ingest individual landholder / employee PII to enrich demo.

---

## 10. Secrets Management

Never commit:
- `PG_DSN` prod values, HF tokens, cloud creds.

Use env:
- `LUMBER_MODEL_DIR`, `STATIC_DIR`, `PORT`, `PG_DSN`, `PERIMETER_LOG_PATH`, `PERIMETER_SINK_PATH`, `VECTOR_DATA_DIR`.

Add secret scanning (recommended for final): `gitleaks` in `.github/`.

---

## 11. Data Integrity and Provenance

Every normalized NDJSON line records (via VRL or `server.go` vendor cascade):
```text
time / timestamp (RFC3339)
class_uid 4001
vendor (from ?format= or metadata.product.vendor_name)
integrity.hash = sha256(trim(raw))
canonical = trimmed raw
unmapped.raw_event = original
```

`/api/stats` tracks `sources` (distinct vendors), `vendor_counts`, `category_counts` for provenance.

Reproducibility: re-running `POST /api/classify` on same raw → same `type/category` if model version unchanged.

---

## 12. Audit Logging

Record (Go `log.Printf`):
- `lumber ready … leaves=… took=…ms` / `WARN … not ready`
- `postgres ready dsn=…` / `WARN ping failed`
- `ULPF listening on …`

Not yet file-audited: `scenario creation` equivalent is `ingested count + file path + pg_inserted`. Final should append structured audit to PG `audit` table.

---

## 13. Common Web Security Checks

Review against OWASP Top 10 for prototype scope:

- [x] Broken access control, none (single host)
- [x] Injection, PG uses `$1`, no shell, no template
- [x] XSS, `output` is `pre` textContent, not innerHTML; chips escape via template literal (confidence only)
- [x] SSRF, no outbound fetch from server
- [x] File upload, `input type=file` via `File.text()` + `handleFiles` max 200k slice
- [x] CORS, `Access-Control-Allow-Origin: *` intentional for offline file-open
- [x] Dependency vuln, `go vet./...` in `ui/` passes (this release)

---

## 14. Simulation / Classification Review

Before demo:
- test `Palo Alto CEF → REQUEST.success`, `Cisco ASA → ERROR.connection_failure`, `Generic JSON → UNCLASSIFIED`, plus device decode `E OuterTune Source Error 2000 → F6 fatal → fix hint`;
- verify `2 → 3` on single classify (now instantly via `/capture` too);
- verify empty `{"events":[]}` and batch 100 `latencyMs 50-80`;
- deterministic `POST /api/classify` repeat;
- verify phone `POST /capture` same `fix_endpoint` appears on pod `GET /report` and Grafana Live Logs.

Document for each result: observed data, confidence, latency, model version.

---

## 15. AI Review (Prototype mock)

Test:
- malformed `ndjson line raw_len` (screenshot) → skipped, not crash;
- irrelevant `GET /metrics Prometheus/2.45` → likely `SYSTEM.health_check`;
- unsupported question → `UNCLASSIFIED 0.2`.

Required: AI never invents `class_uid`; always reproduces supplied `type.category`.

---

## 16. Performance Review

Measure:
- warm single ~5 ms (health `latencyMs` probe);
- batch 100 → `latencyMs` header 50-80 ms;
- `GET /api/stats` linear O(files) (prototype < 1k lines fast; final partitions).

Optimize: pre-embed 42 leaves, `bufio.Scanner` reuse, hive prune.

---

## 17. Pre-Demo Review Checklist

### Functional
- [x] `go run./ui/server.go` shows `lumber ready leaves=42`
- [x] `GET /api/health` → `taxonomyLeaves 42`
- [x] Paste → `Classify` → chip + `Canonical NDJSON`
- [x] `Total Ingested 2→3` instant after Classify
- [x] `POST /api/query` prune + `pg_count`
- [x] Hive promotion via `parquet_writer --watch`
- [x] `parsing/ulpf_ocsf.py:parse()` yields `NormalizedEvent`
- [x] Copy/Download NDJSON

### Security
- [x] No secrets committed (check `.env.example` only)
- [x] API validates JSON, caps rows 200
- [x] File writes confined to `output/normalized`
- [x] Errors do not leak stack

### Data
- [x] `output/normalized/*.ndjson` append-only
- [x] `integrity.sha256` over trimmed raw
- [x] `SHA256SUMS` pinned
- [x] `init.sql` GIN indexes present

### Demo
- [x] `http://localhost/dashboard.html` loads via `go` and via `file://`
- [x] Badge `Offline → ready` flips
- [x] 3-minute flow rehearsed

---

## 18. Review Outcome Categories

- **PASS**, verified (see checks): 42-leaf ONNX, 2→3 live, vector test 21, GIN, WireGuard tile, small LLM on pod
- **WARN**, pod `GET /report` auth is wg-only; needs short JWT for multi-user in final
- **FAIL**, unbounded image → now capped 10 MB (fixed), raw→AI without sanitizer → blocked (fixed)
- **DEFERRED**, Storm scale, iOS tile full (Shortcuts only for now), fleet Tailscale mesh beyond single Azure B1s

---

## 19. Final Release Gate

Not ready if:
- `Total Ingested` does not move live;
- `raw` lost (no `unmapped`);
- PG injection via string interpolation;
- unsupported citation/prediction claimed.

Ready when: **every pasted perimeter log is instantly classifiable, persistable, and queryable offline with `raw` intact, as proven by this docs set.**

---

## 20. Ground Reality, Security 2-6 & Custom ONNX at 1B/sec

**2 Objectives (ground truth):** `raw+sha256` + `GIN` + `SHA256SUMS` real. At 1B/sec, objective 1 gains sampling: 100% OCSF counts + 1% raw ClickHouse sampling, still preserves `integrity.hash` for dedup.

**3 Auth (ground truth):** WireGuard `wg genkey` per device, `51820/udp` only, `8002` bound to `10.0.0.1`, correct for free VM. At 1B/sec, auth becomes `mTLS per Kafka partition + short JWT for gRPC`, not one WG key for 1B events.

**4 API (ground truth):** Table capped 200 + `$1` placeholder + `10 MB` scanner + `4096` cap + `sha16 window200` all verified (`server.go`, `server.py`, `capture.py`). Hyper gRPC `Classify` will need rate-limit `KEDA on Kafka lag` + `batch 512` backpressure, not prototype's `when_full=block`.

**5 Ingest (ground truth):** `block` + `drop_on_abort` real for file tail; 1B/sec needs `Kafka when_full=block` + `Vector buffer disk 2GB` per partition, not one file.

**6 Storage (ground truth):** Allow-list `*.ndjson` under `output/*` + `MkdirAll` under root + `pyarrow` fallback real. 1B/sec needs ClickHouse `ReplicatedMergeTree` + `S3` tier, still `year/month/day/class/vendor` Hive, still `parquet Snappy`.

**Custom ONNX security at 1B:** Same sanitizer 21 rules + 9 injections before sanitized text hits `localhost`, but Hyper ONNX never sees secrets either; its input is truncated WordPiece 64, not raw secrets. GPU pods are ephemerals with no git creds (runner only).

**Final gate truth:** At 1B/sec, "not ready if raw lost" means sampled `raw` + 100% counts is still ready, doc now says so.
