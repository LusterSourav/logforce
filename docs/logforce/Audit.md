# Docs Audit

Checked `LogForce-Docs` against what is actually on disk. No web search, just local files.

I read `Prd.md`, `Architecture.md`, `Design (1).md`, `Memory.md`, `Phases.md`, `Rules.md`, `Security and review.md` and compared them to `LogForce-Perimeter-Prototype`, `maincode`, the deep research report, `lumber-master`, `wazuh-main`, `SIEM-Lite-main`, `Branch of logforce` and the two docx in `guide`. The goal was simple, does the doc match the code or is it just story.

Short answer, it matches. The perimeter half is solid. The future half is plausible but a bit thin. You can run the perimeter demo today, and the WireGuard plus tiny model idea for the full product could work on the Azure free tier, but the docs make the free tier sound forever and skip how the phone stays alive.

Overall the seven files are a safe set to demo. Close the six gaps below and they are fine to show outside.

**Scores** 1 to 5, higher is better

| File | Grounded | Feasible | Accuracy | Note |
|---|---|---|---|---|
| Prd.md | 4.5 | 4 | 4 | Splits current and future clearly, device table is real, but needs a note that Azure free is 12 months |
| Architecture.md | 4.2 | 4 | 4 | WireGuard tunnel matches the code in `maincode/docs/PHONE_TILE` and `VM_POD`, just add the RAM math |
| Design (1).md | 4 | 3.8 | 4 | Copies the real `TileService` for the quick settings tile, the midnight fix card is new but fits `server.py` |
| Memory.md | 4 | 4 | 4.5 | D7 to D9 line up with `capture.py` and the local `ai_engine` |
| Phases.md | 4 | 3.5 | 4 | Roadmap is honest, Phase 9 is still a doc not a running tunnel |
| Rules.md | 4.5 | 4.5 | 4.5 | Tightest doc, caps like `4096` and `sha16 window200` are literally in `server.py` |
| Security and review.md | 4 | 4 | 4 | WireGuard as auth and the 21 sanitizer rules are correct, just needs a JWT note for multi user |

Average 4.17 / 3.97 / 4.14. Not perfect, but credible.

---

## How I checked

1. Read the seven docs plus the example architecture as format check.
2. Grepped `maincode` — `docker-compose.yml` with auto-capture, `server.go` with five handlers, the ONNX files at 215K plus 22M plus 34M, the phone tile doc, the capture helper at 10 MB.
3. Made sure the paths actually exist — `server.py`, `ai_engine.py`, `vector.toml`, the Hive writer, the two docx.
4. Compared each claim to the bytes. If a claim had no file behind it, I marked it.

---

## What I found per file

### Prd.md

The split between what works now (perimeter, 42 leaves, Go on 8081) and what is next (all devices) is honest. The device table for Windows Event Log, macOS reports, journald, Android logcat and iOS sysdiagnose is not fantasy — you can see `last_crash.log` handling in `capture.py` and the crash handler that writes `filesDir/last_crash.log`. The note about ONNX not running on the phone is right, that `libonnxruntime` at 34M plus model data at 22M is too big for a phone and has no NNAPI path, so the doc is right to keep ONNX on the pod.

Two stretches though. The doc reads like B1s is free forever, but Azure student B1s at 750 hours a month is 12 months plus $100 for 12 months, then you pay. And the model table lists disk sizes but not RAM with the KV cache, so 494 MB on disk looks like 494 MB in RAM, when it is closer to 1.1 GB.

No invented files. The `POST /capture` limits and `fix_endpoint` are exactly in `server.py`.

### Architecture.md

The high level diagram puts WireGuard `10.0.0.0/24` between devices and the VM pod, which matches the VPN note in `SYSTEM_ARCH` and the compose file where auto-capture is not public. The midnight crash sequence — app crash, tile tap, WireGuard handshake, `POST /capture`, dedup, Drain3, tiny LLM, toast — traces the code correctly. Device table likewise is not made up. The section that says ONNX stays on the pod notes the correct cold start log around 389 ms.

Gaps, the RAM math is missing. Add 1 GB for B1s plus 400 MB for prom plus 300 for loki plus 150 for miner plus 100 for vector plus 900 for the half-b model and you are at about 1.85 GB, so you will OOM. The doc says it fits on B1s side by side with Prometheus and Loki, which is optimistic. Should say B1s only if you turn off those sidecars, otherwise B1ms minimum. Laptop WireGuard fallback is also thin.

No invented infra, the image pins like `prom/prometheus:v2.51.2` are literally in `image-list.txt`.

### Design (1).md

This one nails the quick settings tile. Your screenshot shows Rethink, Orbot, Outdoor mode etc., and the doc mocks a LogForce tile in the same row with the same shield icon, using the real `android.permission.BIND_QUICK_SETTINGS_TILE`. The Kotlin sketch for `LogForceTileService` with `onClick` going to `STATE_ACTIVE` then IO to the VM then toast then `STATE_INACTIVE` is the same as `PHONE_TILE.md`, not invented. The midnight fix card with `what/why/severity/fix_endpoint [Copy]` also matches `server.py`.

Gaps, iOS is vague. Shortcuts versus share extension and which entitlements are not pinned. The `VpnService` that only routes `10.0.0.0/24` is the right privacy choice but the doc should show `Builder.addRoute("10.0.0.0",24)` so reviewers know it is not a placeholder.

### Memory.md

D7 thin device thick pod, D8 free tier plus Rethink tile, D9 midnight fix all correctly come from `capture.py` and the local `ai_engine` at localhost. The future data direction that adds `logs/auto_captured.log` plus device and app tags matches the real log path in `server.py`.

Minor gap, still lists Storm versus Flink as open, but the docs already picked the tiny model, so that question is stale.

### Phases.md

Phases 0 to 6 are done for perimeter — vector test with 21 cases, 2 to 3 live, Hive. The later phases map to real code, Phase 7 to the unknown solver, Phase 8 to auto capture, Phase 9 to the VM pod sizing, Phase 10 to platform. So the roadmap is not fantasy.

Gap, Phase 9 anywhere connect is still just docs. No `wg0.conf` example in the repo, no APK built. The doc describes it correctly, but it should be marked as not yet running, not done. The timeline of a day or two to polish the perimeter versus two to three weeks for universal is a bit optimistic without an iOS agent.

### Rules.md

Strongest doc. The source enum that adds `android_logcat` etc. is speculative but fits `capture.py` and the fingerprint in `normalize_outertune.vrl`. The limits for `POST /capture` with 4096 and `sha16 window200` and 10 MB caps are literally in `server.py` and `capture.py`, zero hallucination. The VPN rule that the tile only routes `10.0.0.0/24` is also correct.

### Security and review.md

The WireGuard as auth section with `wg genkey` per device and `51820/udp` only and `8002` bound to `10.0.0.1` matches `VM_POD` and compose but fixes the earlier mistake where 8002 was public. Sanitizer 21 rules plus 9 injections plus localhost only matches the code. Checklist now includes the phone `POST /capture` and `GET /report` plus Grafana, which are real.

Gap, for more than one user on `GET /report` you will want a short lived JWT beyond just WireGuard peer auth. The doc notes it as a warning, which is fair.

---

## Consistency across files

OCSF `class_uid 4001` and `type_uid 400101` are consistent across `Prd`, `Architecture`, `Rules` and the VRL. ONNX is 23 MB for the model alone versus 56 MB total with the runtime, the docs round to 23 and that is consistent enough. The seven files plus `Design (1).md` naming matches the example docs exactly, so format is pass.

---

## Six gaps to close before calling it production ready

1. **Azure free note** — add to `Prd.md` 7.3 and `Architecture.md` 6 that B1s at 750 hours free is 12 months plus $100 for 12 months, then about $8 per month pay as you go.
2. **RAM honesty** — B1s at 1 GB cannot run the half-b model plus the full observability. Either run B1s with prom and loki off, or require B1ms at 2 GB. Add a footnote.
3. **Model table** — pin to `ollama list` bytes plus quant, e.g. `qwen2.5:0.5b Q4_K_M 494 MB disk, about 1.1 GB RSS`. Right now 0.52 GB is close but not cited.
4. **WireGuard stub** — commit `auto_capture/wg0.conf.example` plus `apk/LogForceTileService.kt` skeleton so Phase 9 is not docs only.
5. **iOS path** — pick Shortcuts versus Share Extension entitlement count, or mark as deferred for v1.
6. **Secrets scan** — no hits today, verified `grep glpat` is 0, but add a CI `gitleaks` badge like in `maincode/.github/workflows/ci.yml` so it stays safe.

---

## Final notes

Are the seven files fake? No. They are a believable perimeter PRD plus a roadmap that could run on a student budget. The perimeter half is backed by bytes that exist today — `server.go`, `capture.py`, `ai_engine.py`, the phone tile doc and the VM pod doc all check out. The future half correctly keeps heavy work on the VM pod and copies the Rethink proven tile pattern.

Do they make sense as seven safe docs? Yes, with the six gaps patched. Ship them as is for internal review, then add the two small stubs and the Azure footnote, and they read as not slop.
