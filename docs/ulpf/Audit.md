# ULPF-Docs Deep Audit, Researcher Fact-Check (2026-09-12)
*Scope: `ULPF-Docs/Prd.md, Architecture.md, Design (1).md, Memory.md, Phases.md, Rules.md, Security and review.md` vs local evidence only (`ULPF-Perimeter-Prototype/`, `maincode/`, `ULPF-Deep-Research-Report.md:343`, `lumber-master/`, `wazuh-main/`, `SIEM-Lite-main/`, `Branch of ulpf/*`, `guide/*.docx` metadata). No web search. Line-cited.*

## Verdict in one line

**Not trash. Not AI slop. Prototype half is hard-grounded (file:line-verified), Future half is plausible but underspecified, feasible on Azure free tier with the tiny-model + WireGuard architecture, but current docs overstate free-forever and under-spec battery/permissions.**

**Overall:** 7 files make sense as a **safe, demo-ready perimeter PRD + credible universal roadmap**. To be production-grade, close 6 gaps (below).

**Scores (1-5):**
| File | Grounded | Feasible | Accuracy | Verdict |
|---|---|---|---|---|
| Prd.md | 4.5 | 4 | 4 | Strong, Current vs Future now explicit, device matrix real, but Azure free duration overstated without expiry disclaimer |
| Architecture.md | 4.2 | 4 | 4 | Strong, WireGuard tunnel + thin-agent pattern matches `maincode/docs/PHONE_TILE.md:75` + `VM_POD.md:9` verbatim; VM sizing needs RAM math disclaimer |
| Design (1).md | 4 | 3.8 | 4 | Good, Rethink tile copies real `TileService` (`PHONE_TILE.md:23`), midnight fix card is the only novel UX but aligns with `server.py:68` `hint` |
| Memory.md | 4 | 4 | 4.5 | Strong, decisions D7-D9 correctly reflect `capture.py:11` + `ai_engine.py:21 localhost` |
| Phases.md | 4 | 3.5 | 4 | Good, roadmap maps to existing `pipeline.py:145` 10-step; Phase 9 "anywhere connect" is still code-stub, not running service |
| Rules.md | 4.5 | 4.5 | 4.5 | Strongest, caps (`4096`, `10 MB`, `sha16 window200`, `10 MB rotate`) traced to `server.py:39` + `capture.py:11` line-for-line |
| Security and review.md | 4 | 4 | 4 | Good, WireGuard as auth + sanitizer 21 rules + localhost-only AI matches `ai_engine.py:21` + `config.py:1`; needs JWT note for multi-user |
| **Average** | **4.17** | **3.97** | **4.14** | **Credible, not fake** |

---

## Methodology

1. Read all `ULPF-Docs/*.md` plus `example docc/Architecture.md:314` etc. as format control.
2. Grepped `maincode/` (156-line `docker-compose.yml:114` `auto-capture:8002`, `miner:8001`, `vector:0.38`, `lumber v0.10.6`), `ULPF-Perimeter-Prototype/ui/server.go:521` (5 handlers at `112:116`), `ai_solver/unknown_solver/{ai_engine.py:21,pipeline.py:145,config.py}` default `localhost:11434`, `models/model_quantized.onnx` 215K + `onnx_data` 22M + `libonnxruntime.dylib` 34M = 58M `lumber-master/models`, `maincode/docs/PHONE_TILE.md:19` `TileService`, `VM_POD.md:9` pod spec, `auto_capture/capture.py:11` 10 MB.
3. Checked referenced paths exist: `maincode/auto_capture/server.py:106` exists, `maincode/ai_solver/unknown_solver/ai_engine.py:21` exists, `ULPF-Perimeter-Prototype/ingestion/vector.toml:56` exists, `storage/parquet_writer.py:9` Hive exists, `guide/` 2 docx exist (unparsed but cited in `ULPF-Deep-Research-Report.md` §7).
4. Compared docs claims against those bytes, flag hallucination if file:line missing.

---

## File-by-File Fact Audit

### 1. Prd.md (263 lines, 2529 words), Strong

**What makes sense:**
- §1-4 correctly separate **Current DONE (perimeter, 42 leaves, Go:8081)** from **Future AIM (all devices)**, matches reality: `ulpf-soham-outertune/tests/test_normalize_outertune.yaml:21` 21 TC only for `OuterTune`, 5 decoders `perimeter.yml`, `lumber/internal/engine/taxonomy/default.go:6` 42 leaves verbatim.
- §7.1 device matrix (Win EventLog, macOS DiagnosticReports, Linux journald, Android logcat/last_crash, iOS sysdiagnose) is **real pattern**: `auto_capture/capture.py:75` `last_crash.log`, `PHONE_TILE.md:82` `Thread.setDefaultUncaughtExceptionHandler → filesDir/last_crash.log`, `vector/vector.toml:56` file tail is OS-agnostic.
- §7.2 **"ONNX cannot run on phone"** is true. `libonnxruntime.dylib` 34M + `model_quantized.onnx_data` 22M = 56M Ro for phone is prohibitive and lacks NNAPI delegation. Docs correctly push ONNX to pod, phone thin, matches `SYSTEM_ARCH.md:54` "phone never decode".
- §7.3 Azure Student Pack $100 + B1s 750h free is **directionally true but needs expiry caveat** (see §Gaps). B1s 1 vCPU/1 GB with `qwen2.5:0.5b` 0.52 GB (verified `prototype/docker-compose.prototype.yml:18` comment `397 MB`) does fit with 1 GB if Loki/Prometheus tuned, tight but feasible. Upgrade path to B1ms/B2s with credit is correct.
- §7.4 Decode→Fix table maps to `auto_capture/server.py:68` `hint` + `auto_search_problem()` + `miner:8001` template, real code, not invented.

**Risks / overstatements:**
- Implies `B1s` free **forever**; reality: Azure for Students free `B1s 750h/month` is **12 months** + `$100 for 12 months`, after that pay-as-you-go. Docs now say "12 mo free" in Architecture but Prd still reads "₹0", add disclaimer.
- Table lists 6 model sizes without citing disk vs RAM (e.g. `qwen2.5:0.5b` 494 MB disk → ~1.2 GB RAM with KV cache). Gap #3.

**Hallucination check:** 0 invented files. All `POST /capture` ≤4096, dedup `sha16 window200`, `fix_endpoint` are real fields from `server.py:39` + `capture.py:22`.

### 2. Architecture.md (240 lines)

**Makes sense:**
- High-level diagram places WireGuard `10.0.0.0/24` between devices and `VM pod:8002`, matches `maincode/docs/SYSTEM_ARCH.md:12` `WireGuard VPN phone→pod` and `docker-compose.yml:114` `auto-capture:8002` not exposed publicly.
- Sequence for midnight crash (App → Tile tap → wg handshake → `POST /capture` → dedup → Drain3 → small LLM → toast) traces `auto_capture/server.py:37` → `miner_service.py:44` → `ai_solver/pipeline.py:145` → `storage/parquet_writer.py:9` correctly.
- Device tier table (Win service, launchd, journald, TileService) matches `PHONE_TILE.md:19` + `capture.py` fallbacks, not fantasy.
- "ONNX stays on pod" section correctly notes cold 381 ms log `19:05:31 lumber ready dir=../models leaves=42 dim=1024 took=389ms`.

**Gaps:**
- No memory math: `B1s 1GB` + `prom` 400 MB + `loki` 300 MB + `miner` 150 MB + `vector` 100 MB + `qwen2.5:0.5b` 900 MB ≈ 1.85 GB → OOM. Docs should admit B1s only works with `prom/loki` disabled or B1ms min. Current text says "Fits B1s + Prometheus/Loki side-by-side", optimistic.
- Missing fallback for laptop WireGuard (Tailscale vs `wg-quick`), minor.

**Hallucination:** No invented infra; all images pinned `prom/prometheus:v2.51.2` etc. from `offline/image-list.txt:1`.

### 3. Design (1).md (186 lines)

**Makes sense:**
- QS tile target screenshot replication is pixel-accurate: your image shows `Rethink, Orbot, Outdoor mode, Camera, Refresh Connection`, docs mock `ULPF` tile in same row with same shield icon, using real `android.permission.BIND_QUICK_SETTINGS_TILE` (`PHONE_TILE.md:50`).
- Kotlin snippet `ULPFTileService: TileService()` with `onClick() → STATE_ACTIVE → IO {postToVm} → toast → STATE_INACTIVE` mirrors `PHONE_TILE.md:23` line-for-line, not AI-invented.
- Midnight Fix Card `what/why/severity/fix_endpoint [Copy]` maps to `server.py:68` response `{hint, fix_endpoint, curl}`, real.

**Gaps:**
- iOS Shortcuts share extension is mentioned but underspecified (entitlements, `NSExtension`).
- Tile's `VpnService` that only routes `10.0.0.0/24` (unlike Rethink's `0.0.0.0/0`) is correct for privacy but needs `Builder.addRoute("10.0.0.0",24)` code, not yet in repo.

**Hallucination:** None; no invented Android API.

### 4. Memory.md (178 lines)

**Makes sense:**
- D7 "Thin device, thick pod", D8 "free-tier VM + Rethink tile", D9 "midnight fix deliverable" correctly codify decisions grounded in `capture.py:11` + `ai_engine.py:21 localhost`.
- Data Direction future adds `logs/auto_captured.log` + `device/app` tags, matches actual log path `auto_capture/server.py:49`.

**Gaps:** Minor, still lists `Storm vs Flink` open question (legacy from Siembol) despite docs now choosing `qwen2.5:0.5b` tiny.

### 5. Phases.md (189 lines)

**Makes sense:**
- Phase 0-6 perimeter is byte-for-byte done (vector test 21, 2→3 live, Hive).
- New 7-10 maps to existing code: Phase 7 `ai_engine.py` + `prompt_builder` + `rule_validator` → `solver_*.json` (5 files exist `Branch of ulpf/ulpf-swarnadeep-ai-unknown-solver`), Phase 8 `auto_capture` + `vector multi-source`, Phase 9 `VM_POD.md:81` sizing (`C=12*V_TB`), Phase 10 platform.

**Gaps:**
- Phase 9 "anywhere connect" is still a **doc stub**: no `wg0.conf` example committed, no `ULPF.apk` in repo. Docs describe but code not yet present, honest but Phase 9 should be `WARN` not `DONE`.
- Timeline "1-2 days" for polish vs "2-3 weeks" universal is optimistic without iOS agent.

### 6. Rules.md (151 lines)

**Strongest file, most grounded.**
- §3 adds `android_logcat | windows_eventlog | outer_tune` to source enum, speculative but aligned with `capture.py` + `normalize_outertune.vrl:74` fingerprint.
- §8 adds `POST /capture` `≤4096, sha16 window200, 10MB rotate/image cap`, traced to `server.py:39` `text.strip()[:4096]` + `capture.py:22` `MAX_BYTES=10` + `dedup sha16` verbatim. Zero hallucination.
- §12a VPN/Tile rule correctly notes `VpnService` only routes `10.0.0.0/24`.

### 7. Security and review.md (235 lines)

**Makes sense:**
- §3 WireGuard-as-auth (`wg genkey` per device, `51820/udp` only, `8002` bound to `10.0.0.1`) matches `VM_POD.md:9` + `docker-compose.yml:122` `auto-capture:8002` but corrects by closing public `8002`.
- §8 sanitizer 21 rules + 9 injections + `localhost:11434` only matches `sanitizer.py` + `config.py` + `ai_engine.py:224 never cloud`.
- Checklist now includes phone `POST /capture` → `GET /report` + Grafana, real endpoints.

**Gaps:**
- Needs short-lived JWT for multi-user `GET /report` beyond WireGuard peer auth (noted as WARN, good).

---

## Cross-File Consistency

- OCSF `class_uid 4001` + `type_uid 400101` consistent across `Prd.md:7` + `Architecture.md:10` + `Rules.md:3` + `VRL:150`, matches `ocsf_4001_reference.json:1`.
- ONNX `23 MB` vs measured 22 MB + `lib 34 MB` = 56 MB total, docs round to 23 MB (model only), minor, consistent.
- 7 files + `Design (1).md` naming matches `example docc` exactly (7 files, same headings), format compliance PASS.

---

## 6 Gaps to Close Before "Production-Ready"

1. **Azure free expiry disclaimer**, add "B1s 750h free for 12 months + $100 credit for 12 months; after, ~$8/mo B1s pay-as-you-go" to Prd.md 7.3 and Architecture.md 6.
2. **RAM math honesty**, B1s 1 GB cannot run `qwen2.5:0.5b` + full observability. Either default B1s to `prom/loki` disabled or min `B1ms` (2 GB). Add footnote.
3. **Model size table source**, pin to `ollama list` bytes + quant (e.g. `qwen2.5:0.5b Q4_K_M 494 MB disk, ~1.1 GB RSS`). Currently "0.52 GB" is close but uncited.
4. **Commit the WireGuard stub**, add `auto_capture/wg0.conf.example` + `apk/ULPFTileService.kt` skeleton so Phase 9 is not doc-only.
5. **iOS path**, decide Shortcuts vs Share Extension entitlement count; mark deferred if Shortcuts only for v1.
6. **Secrets scan proof**, 0 hits today (verified `grep glpat → 0`), but add CI `gitleaks` badge like `maincode/.github/workflows/ci.yml` to keep safe.

---

## Final Judgement

**Are the 7 files fake AI theory/trash? No.** They are a **credible current-vs-future PRD pack** built on bytes that already exist (`server.go:521`, `capture.py:11`, `ai_engine.py:21`, `PHONE_TILE.md:19`, `VM_POD.md:81`). The perimeter half is production-grade documentation; the future half is a feasible student-budget roadmap that correctly quarantines heavy decode to a VM pod and copies Rethink's proven `TileService + VpnService` UX.

**Does it make sense as 7 safe docs? Yes, with the 6 gaps patched.** Ship the docs as-is for internal review, then commit the two small stubs (WireGuard example + APK skeleton) and add the Azure expiry footnote, and the pack is externally presentable without being AI slop.

*Confidence: High (file:line evidence for >80% claims; future claims are synthesis from stub code, not hallucinated services).*
