# Design, ULPF

## 1. Design Objective

The product must feel like a **professional SOC normalization workspace by day, and a calm midnight debugger by night**, not a raw log dump.

### Design principles

> **Lossless first. One schema. One tap. One fix. No panic.**

The user should always know:
- what the raw line was;
- what it became (CanonicalEvent / OCSF 4001) + confidence + latency;
- **what it means** (plain English: what happened, why);
- **what to tap** to fix it (endpoint + copyable curl/button);
- whether it persisted (`Total Ingested 2→3`) and where (`raw` intact).

---

## 2. Core UX

```text
ANY DEVICE (auto) VM POD (decode, not phone)
 auto-capture → classify (ONNX 5ms on pod) + Drain3 template
 VPN auto-connect → decode (small LLM 0.52GB) → what/why/severity
 ↓
 FIX endpoint + curl
 ↓
 Phone toast/laptop notification ← live → Grafana deep link
```

Edge classify is synchronous on pod (phone→WireGuard→pod); fleet ingest is async via Vector. Both converge on same NDJSON contract.

---

## 3. Main Screens

### 3.1 Perimeter Live Pipeline (hero card, still the day view)

Dark card `#14161b` (single file `ui/dashboard.html` ~1215 lines):

- Header `Perimeter Log Ingest, Live Pipeline` + badge `42 leaves • 5 ms • Offline`.
- Drop zone `Drop log file here or paste below, live output/multi → POST /api/ingest` with format menu (`Palo Alto`, `Cisco ASA`, `FortiGate`, `CEF`, `LEEF`, `Suricata`, `Zeek`, `syslog`, `JSON`, `CSV`, `XML`, `ULPF OCSF`) → `?format=`.
- Left `textarea#input` + `Classify • ~5 ms` (lime `#c8f51d`), `Batch`, `Clear` + chips `TYPE.category 76%`.
- Right `pre#output` Canonical NDJSON, `Copy`/`Download`, footer `RawLog → cosine 42 → CanonicalEvent`.
- Behavior: `doClassify()` → `/api/classify` → auto `POST /api/ingest?format=` → live KPI.

### 3.2 All-Device Auto-Capture, The Rethink-Style Tile (NEW, your screenshot target)

**Goal:** Exactly like your screenshot where `Rethink` and `Orbot` appear in Quick Settings.

**What the user sees (before install → after):**
- Settings → Quick Settings → `+` → tiles list shows new tile **ULPF** (shield icon, like Rethink) beside `Refresh Connection`.
- Tap once: tile animates `inactive → active → inactive` (Rethink does same), status bar shows `VPN ULPF` key icon, toast: `ULPF Capture, connected to Azure pod 20.193.x.x`.
- Crash at 2 AM: app shows `Report?` dialog → `Send` → same path, or user taps **ULPF** tile → log auto-attached → toast `OuterTune Error 2000, Auth expired, FIX ready → Copy`.

**QS tile row (target layout, matching your screenshot):**
```
[ Outdoor mode | Camera | High performance | One-Tap Search ]
[ Select to Sp.. | Bedtime | Rethink | Orbot ]
[ Refresh Connection | ULPF ← ours together with Rethink ]
```

**Implementation (Kotlin, ponytail minimal):**
```kotlin
// app/src/main/java/com/ulpf/capture/ULPFTileService.kt
class ULPFTileService: TileService() {
 override fun onClick() {
 val t = qsTile ?: return
 t.state = Tile.STATE_ACTIVE; t.updateTile()
 CoroutineScope(Dispatchers.IO).launch {
 try {
 val tail = captureLogcatTail(500) // Shizuku if granted else filesDir/last_crash.log 4096 cap
 val (hint, curl) = postToVm(tail) // POST https://10.0.0.1:8002/capture via WireGuard
 showToast(hint + "\n" + curl) // "Source Error 2000, check token\nCopy: curl …"
 } finally { t.state = Tile.STATE_INACTIVE; t.updateTile() }
 }
 }
}
```
Manifest `BIND_QUICK_SETTINGS_TILE`, `android.permission.INTERNET`, no `READ_LOGS` (Shizuku optional). WireGuard tunnel `wg-quick@wg0` (`10.0.0.0/24`) is a `VpnService` like Rethink, but our tunnel only carries `10.0.0.1:8002` (no full-device VPN, unlike Rethink which filters all).

**Non-Android (future):**
- iOS: Shortcuts action `ULPF Capture` + Share Extension `Send to ULPF`; same `POST` via WireGuard App.
- Laptop: tray icon `ULPF` (macOS menu bar / Win system tray) → click → tails `DiagnosticReports`/`EventLog`, same toast.

### 3.3 Midnight Decode → Fix Panel (what you see after tap)

Replaces the chip-only insight with a fix card:

```
┌─────────────────────────────────────────┐
│ ⚠ E OuterTune Source Error 2000 │ ← raw, one line
├─────────────────────────────────────────┤
│ What: Source token expired (trust) │ ← ai_engine + auto_search_problem
│ Why: Firewall allow-list missing │
│ Severity: F6 (fatal) → red chip │
│ Source: phone pixel-7 / app outer_tune │ ← auto tag
├─────────────────────────────────────────┤
│ FIX, copy and run: │
│ curl -X POST https://10.0.0.1:8002/… │ [Copy], the endpoint to fix
│ or: POST /api/token/refresh on pod │ [Open fix]
│ Fallback: check logs/outertune/ │ [Open Grafana]
└─────────────────────────────────────────┘
```

Phone toast shows first line + `Copy`; full card lives at `GET /report` and Grafana Live Logs.

### 3.4 Dashboard Grid (still sports dark, Tailwind)

- Top bar `+` → scroll to drop, `bell` → console, `tune` → `POST /api/query`, `history` → `alert( /api/stats )`.
- Left: `kpi-total-ingested`, `kpi-total-sources`, `kpi-avg-latency`, donut `donut-center`, `Top 5 Parsers`.
- Center: `Total Normalized`, `Normalization Rate`, `Palo Alto` feature card.
- Right: `last-ingest-time`, `Ingested/Failed` duo, `Ingest Activity` chart, `Recent Ingests +N`.
- Bottom ONNX card + new device badge row: `📱 3 phones 💻 4 laptops 🖥 2 servers 🧱 1 firewall, auto`.

---

## 4. AI Insight Panel (Prototype vs Future)

- Prototype: chip + NDJSON confidence.
- Future (vm pod): `auto_capture/server.py:8002` returns `{template, hint, fix_endpoint, curl}` from Drain3 + `qwen2.5:0.5b` decode, validated, not raw LLM. `GET /report` shows recent tails + clusters for toast; Grafana shows full.

---

## 5. Visual Language

Radial `#2e342a → #151815`; cards `#14161b` border `#1f242b`; lime `#c8f51d` for active tile + live badge; olive `#68782a` / gold `#d49429` for charts; monospace for NDJSON; severity chips red/amber/green.

Tile icon: shield with `U` (matches Rethink shield in screenshot), lime ring when active.

Avoid: full-device VPN chrome; phone-heavy decode spinners.

---

## 6. Typography

Inter 400-800. Page 28-32, section 14, KPI 16-20, metadata 10-11, code 11.

---

## 7. Reusable Components

```text
DashboardShell (main 1480, rounded 36)
DropZone / PasteArea / Chips / CanonicalView / HealthBadge / StatPollers
TileService (ULPFTileService.kt, BIND_QUICK_SETTINGS_TILE)
AutoCaptureClient (POST /capture 4096 cap, dedup sha16)
FixCard (what/why/fix_endpoint/curl + Copy/Open)
```

---

## 8. Accessibility

Tile has `android:contentDescription="ULPF Capture"`, TalkBack reads hint; chart has text counts; keyboard focus on input.

---

## 9. Responsive

Desktop 12-col grid; mobile single column via `col-span-12 lg:col-span-4`. Tile is OS-level, not web-responsive.

---

## 10. UX Rules

Always show: freshness `Last ingest …`, model `42 leaves • 5 ms`, persisted `+N`, provenance `raw` + `vendor`, **and fix endpoint** after auto-capture.

Prefer: `CanonicalEvent type.category confidence%` + `Fix: curl …`
Avoid: raw log wall without decode.

---

## 11. Three-Minute Demo Flow (updated)

```text
Day: 1. Open dashboard → health 42 leaves
 2. Paste CEF → Classify → chip + 2→3 live
 3. Drop file → same; Query prune; Parquet Hive
Night:4. Android: QS → Add tile ULPF beside Rethink (your screenshot)
 5. Trigger crash → tap ULPF → WireGuard → toast "Error 2000, token, FIX Copy curl"
 6. Paste curl → fixed → Grafana shows 0 new clusters
```
```


---

## 12. Ground Reality, Sections 2-6 (honest UX)

**2 Core UX:** Prototype `paste → Classify → 2→3` is real (measured 60 ms/100 lines). Future `any device auto → WireGuard → pod → fix` is not yet fully wired, `auto_capture/server.py:8002` + `PHONE_TILE.md:23 TileService` exist, but no `ULPF.apk` built yet. Design shows intent, not shipped APK.

**3 Main Screens:** Pipeline hero card is shipped (`ui/dashboard.html:1215` exact). QS tile row `ULPF beside Rethink` is a **mock in the design image**, real Rethink screenshot shows Refresh/Rethink/Orbot, ULPF tile will appear there only after APK install + `BIND_QUICK_SETTINGS_TILE`. Not fake, but not installed on your phone today.

**4 AI Insight:** Prototype chip confidence is deterministic cosine, not LLM. Future `fix_endpoint` panel will be powered by `qwen2.5:0.5b` on pod (0.52 GB), ~0.8s, not on phone. Phone never runs Ollama (`ai_engine.py:21` binds `127.0.0.1` only).

**5 Visual Language / 6 Typography:** Tailwind dark is real (prototype). Future midnight `red chip F6` will use same `severity` → color map, not invented.

**Custom ONNX impact on Design:** To keep 1B/sec, Design must show a **sharded progress UX**: `Shards: 12/83 healthy • Throughput: 118k/sec/GPU • Dropped: 0% sampled 1% raw` instead of pretending one VM does 1B. The fix card for 1B burst will show `Fix applies to template <X> (1.2M occurrences sampled)` not per-line.

