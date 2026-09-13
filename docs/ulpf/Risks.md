# Risks, ULPF

**Scope:** MVP Perimeter + Fleet Universal + 1B/sec Scale Tier 
**Category:** Risk Register and Mitigation

## 1. Technical Risks

| # | Risk | Likelihood | Impact | Ground truth | Mitigation & status |
|---|---|---|---|---|---|
| T-01 | **VRL Phase 1 regex regression**, new device fingerprint breaks existing one | High | High | `normalize_perimeter.vrl:74` single regex is the only plug point; `vector test` 21 TC is small | `vector validate` + `vector test` in CI (`pipeline.md:92`), add one TC per new device, `drop_on_error=true` keeps bad line from poisoning lake |
| T-02 | **ONNX taxonomy drift 42 → 400 leaves** dilutes `confidence 0.5` | Medium | High | `lumber/internal/engine/taxonomy/default.go:6` 42 leaves is tuned; universal 400-leaf HNSW PQ-64 not yet trained | Hyper training: teacher `bge-large` → student 4L/256d, 5M logs, `corpus.json 153 + 5k hyper` validation, keep 42 as root stage |
| T-03 | **1B/sec not on one VM**, over-claim | High if misstated | Fatal for credibility | 1.6k/sec/instance CPU, 120k/sec/H100 → 833 H100 for 1B/10 sec (`Architecture.md:14`) | Always state "10-sec burst on 800 H100, sampled 1% raw, 100% counts"; day-to-day claim 100k-1M/sec |
| T-04 | **pyarrow absent → Hive fallback silently NDJSON** | Medium | Medium | `storage/parquet_writer.py:22` fallback is real | Pin `pyarrow` in `requirements.txt` for universal; add `pytest` that asserts Snappy exists |
| T-05 | **Drain3 `sim_th 0.4` → `0.5` retune splits templates** | Medium | Medium | `miner/drain3.ini:22` 0.4, spec wants 0.5 (`ULPF-Deep-Research-Report.md:62`) | Retune + `tests/test_miner.py` vs LogChimera |
| T-06 | **Device agent battery / Shizuku READ_LOGS** | High | Medium | `auto_capture/capture.py:75` `last_crash.log` fallback, but `logcat` needs Shizuku on Android 13+ | Tile tap on-demand, not polling; document Shizuku optional; degrade to crash file without it |
| T-07 | **WireGuard single VM → single point of failure** | Medium | High at 1B/sec | One `B1s` VM dies → devices orphaned | For 1B tier: `Kafka 1000 partitions` + `KEDA` + `wg` peers per pod + `Tailscale` mesh; for MVP: `adb reverse` fallback |

## 2. Operational Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| O-01 | **WireGuard key leak (`.conf` committed)** | Medium | High | Only `wg0.conf.example` committed, real keys in `~/.config/wireguard/` + env, never in `auto_capture/server.py:106` logs |
| O-02 | **10 MB log/image cap abused to DoS pod** | Medium | Medium | Enforced `server.py:39` `[:4096]` + `capture.py:11` 10 MB rotate + `POST /capture/image` 10 MB cap + dedup `sha16 window200` |
| O-03 | **Postgres vs file divergence (dual-write)** | High | Medium | MVP file is source-of-truth; PG is index. `GET /api/stats` reads files + `pg_count` side-by-side to expose drift |
| O-04 | **Who is on-call for 1B burst cost spike?** | Medium | High | Burst is manual `az vmss scale` + KEDA, not always-on 833 H100; bill alarm at `arch/cost per burst` |
| O-05 | **Student Azure credit expires (12 mo / $100)** | High | Medium | Note expiry in `Financial.md:3.1`; fallback Oracle Always Free `E2.1.Micro` forever |

## 3. Market Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| M-01 | **SOC says "we already have Splunk/Sentinel parsing"** | High | Medium | Position as pre-processor, not replacement: "Wire ULPF before your SIEM, keep your SIEM" (Positioning `Prd.md:1`) |
| M-02 | **MSSP demands per-tenant isolation day one** | Medium | High | Add `vendor → tenant` tag as `Hive vendor=tenantX`; hide behind `vendor_counts` today, hard-isolate later |
| M-03 | **Open-source Vector/Lumber fork-ability** | High | Low | Moat is glue + 42→400 taxonomy + tile + fix, not Vector itself |
| M-04 | **SIEM operator prefers managed ClickHouse/Confluent** | Medium | Medium | Provide ClickHouse + Kafka recipe (`Architecture.md:14`), not mandatory bundle |

## 4. Security & Compliance Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| S-01 | **Prompt injection via log → small LLM** | High | High | `sanitizer.py:51` 21 redacts + 9 injection patterns, nonce delimiter `prompt_builder.py:42`, truncate 2048, `localhost:11434` only (`ai_engine.py:21`) |
| S-02 | **Raw → AI leak (secret in log)** | Medium | Fatal | `SanitizedEvent` is only AI input; `ai_engine.py` never imports `GitLabConfig` token |
| S-03 | **Phishing `fix_endpoint` curl** | Medium | High | `hint` validation `RuleValidator` 10 checks + `Tester` 0.8/0.1; Fix curl is `POST` to pod `10.0.0.1:8002` inside WG, not external |
| S-04 | **PII in mobile crash** | Medium | High | Minimize: `last_crash.log` ≤4096, `GET /report?limit=20` tail only, Hive retention `DROP PARTITION` (`schema.sql:74` unique `dedup_hash`) |

## 5. Financial Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| F-01 | **"₹0 forever" promise breaks after 12 mo** | High | High | Truth table in `Financial.md:3.1`, B1s free 12 mo only; Oracle free forever as fallback |
| F-02 | **1B/sec burst cost not budgeted** | High if demo promised 24/7 | Fatal | Gate 1B behind manual `az vmss` + sampled 1% raw; sell 100k-1M/sec sustained |

## 6. Risk Matrix (top 5 to fix now)

```
High impact ┌─────────┬─────────┐
 │ T-03 │ T-01 │
 │ F-01 │ S-01 │
 ├─────────┼─────────┤
 │ O-02 │ T-06 │
Low impact └─────────┴─────────┘
 Low likelihood High
```
Focus before next demo: T-01 (one extra VRL TC per device) + S-01 (keep sanitizer on) + F-01 (add Azure expiry footnote, already done).

## 7. Risk Principle

> **Sample the raw at 1B/sec, never sample the truth about the cost.**
