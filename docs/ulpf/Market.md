# Market, ULPF

**Topic:** Primary Initial Customer and User Segmentation 
**Scope:** MVP Perimeter → Fleet Universal 
**Category:** Go-to-Market Analysis

## 1. Market Landscape

ULPF is a pre-processing fabric, not a SIEM. It sits *before* storage/detection.

```text
Raw logs (any) → [ULPF: Vector + VRL + ONNX + Drain3 + small LLM] → OCSF 4001 → SIEM/Lake (SIEM-Lite, Wazuh, Splunk, Sentinel, Chronicle)
```

Buyers already pay for a SIEM. They churn when parsers break, field extraction is manual, and "new vendor = 2 weeks of regex." ULPF sells "time to first query" and "parser maintenance cost = one fingerprint string."

Total addressable is every org that ships perimeter logs + app logs to a SIEM. Serviceable today is the perimeter slice where `lumber` + `SIEM-Lite` + `Vector` already prove lossless normalization.

## 2. Customer Options Analyzed

| Candidate | Need | ULPF fit (MVP) | Willingness to pay | Access difficulty |
|---|---|---|---|---|
| **SOC / Security Teams (L1-L2 analysts, detection engineers)** | Normalize paloalto/asa/fortinet/cef/suricata today; reduce mean-time-to-triage; see `type.category` + `confidence` + `raw` | **Excellent, prototype already classifies these 5 + 6 generics, `POST /api/classify` `5 ms`, `GET /api/query` prune** | High, they feel the pain daily; budget is SOC tooling | Easy, one demo `go run + paste CEF` proves value in 30 sec |
| **Enterprises (CISO, platform security)** | Fleet-wide, multi-device governance, audit, 100% lossless, 1B/sec burst slide | Medium for MVP (needs fleet Hive + RBAC + compliance); strong for future Hyper fleet + ClickHouse + WireGuard | Highest per-deal, but procurement 3-6 mo | Hard, needs compliance pack, RBAC, support |
| **Managed Security Providers (MSSPs / SOC-as-a-Service)** | Onboard a new customer's firewall in hours, not weeks; reuse one OCSF contract across tenants | **Very good, `normalize_perimeter.vrl` Phase 1 "one regex per new device" + `parsing/decoders/perimeter.yml` hot-swap + `PARSERS={}` isolation is built for multi-tenant MSSP** | Very high, directly multiplies revenue per customer onboarding | Medium, needs per-tenant isolation (`vendor` → `tenant` tag, not yet) |
| **Developers / DevOps / SRE (on-call)** | Auto-catch `crash / OOM / timeout` on laptop/phone, get `what/why + fix_endpoint` at 2 AM without SSH | **Strong for future `auto_capture` + QS tile (`PHONE_TILE.md`) + `qwen2.5.5b` midnight fix**; weak for MVP perimeter alone | Medium, will pay per-seat for "no panic" | Easy, `POST /capture` + toast |
| **SIEM Operators / Data Engineers (owns the lake)** | Stable `class_uid 4001` contract, Hive `year/month/day/class/vendor` prune, GIN `raw` for forensics, 86 PB/day sampling honesty | **Good, `storage/parquet_writer.py` Hive + `query/datafusion_engine.py` prune + `init.sql` PG GIN is exactly their language** | High, they pay for storage and query latency | Medium, needs ClickHouse story for 1B/sec |

## 3. Primary Initial Customer, Recommendation

**Primary for MVP (next 3-6 months): SOC / Security Teams, with MSSPs as the immediate channel.**

**Rationale:**
1. **Fastest proof:** `go run./ui/server.go` + paste a `CEF|Palo Alto|PAN-OS|…` → `REQUEST.success 78%` + `Total Ingested 2→3` in one minute. No other segment gets value that fast. Detection engineers already maintain the 29 `SIEM-Lite` parsers and feel parser drift.
2. **Strongest pain:** SOCs lose 30-50% triage time to normalization. Enterprises feel it via SOCs; MSSPs feel it multiplied by customers. ULPF's "one fingerprint string" (`normalize_perimeter.vrl: Phase 1 only`) directly replaces their most-hated task.
3. **Cheapest acquisition:** GitHub Student Pack → free Azure `B1s` + `docker compose` is a credible SOC lab. SOC teams live on GitHub, not on enterprise procurement portals.
4. **Land-and-expand:** SOC success → SOC manager funds fleet universal → enterprise deal follows with Hive/ClickHouse + RBAC. MSSP success → white-label ULPF as their onboarding layer → multiplies seats without ULPF hiring sales.

**Developer/DevOps is the co-primary for the "midnight fix" story.** ULPF's `auto_capture` + ` ULPF` QS tile beside Rethink (your screenshot) is the only feature that resonates outside SOCs. Package it as "ULPF for On-Call" for the student/dev market, same binary, different `hint` messaging.

**Not primary on day one:** Enterprises (needs compliance hardening) and SIEM Operators (needs ClickHouse + 1000-partition Kafka for 1B/sec), they are design partners, not first revenue.

## 4. Segmentation for ULPF-Docs

- **SOC/security teams:** Perimeter demo (`ULPF-Perimeter-Prototype/`), 42 leaves, `POST /api/classify`, `GET /api/query` prune, `parsing/decoders`.
- **MSSPs:** Same plus per-tenant `vendor` tagging and hot-swap decoders (roadmap `Rules.md`).
- **Developers/DevOps:** Fleet `auto_capture` + `ULPF` tile + `qwen2.5.5b` fix (Prd §7, Architecture §3-4).
- **Enterprises + SIEM Operators:** Scale story (`Architecture.md` Hyper fleet: A10G 45k/s, H100 120k/s, Kafka 1000 partitions, sampled store) + `AUDIT.md` line-cited provenance for audit.

## 5. Go-to-Market Zones (12-month truth)

| Quarter | Primary | Offer | Price anchor |
|---|---|---|---|
| Q1 | SOC (campus SOC lab) | Laptop demo: 5 decoders + 11 formats + GIN | ₹0 (local) / $0 (B1s student) |
| Q2 | MSSP pilot (1-2 design partners) | Multi-tenant Hive + hot-swap + per-tenant Hive path | $30-80/mo pod (B2s) as pilot fee |
| Q3 | Developers on-call | `ULPF.apk` + WireGuard + midnight fix `POST /capture → {curl}` | Freemium device (₹0), team pod $30/mo |
| Q4 | Enterprise (SOC-proven) | ClickHouse + KEDA autoscale + RBAC + `AUDIT.md` | Custom (100k-1M/sec on 1-10 GPUs, not 1B) |

## 6. Market Truth Check

- **Not claiming "1B/sec on one VM for enterprises today."** Honest Q1 is 1.6k/sec/instance; Q4 prod is 100k-1M/sec on 1-10 GPUs (Architecture §14). 1B/sec is a 10-sec burst on 800 H100, a benchmark slide for enterprise RFPs, not a $0 student SKU.
- **Competition:** Vector + VRL (open, Rust), Lumber (Go ONNX, Apache 2.0), SIEM-Lite (29 hand parsers), Wazuh engine (hot-swap), Siembol (Storm 2.4 billion-scale). ULPF's moat is *not* beating them at their layer, it is **gluing Vector + ONNX + small LLM + Hive + tile + WireGuard into one OCSF contract with `raw` intact**.

## 7. Product Principle (market)

> **Sell to the analyst who pastes at 2 AM, land via the MSSP who onboards at 9 AM, expand to the enterprise who audits at quarter-end.**
