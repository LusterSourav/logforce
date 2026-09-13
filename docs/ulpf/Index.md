# Docs Index — ULPF

Two views over the same docs. No file was moved; this index is the map.

## By deliverable (what evaluators open)

* **Setup** — `../ULPF-README-Setup.md` (or `../maincode/README.md` for the unified stack)
* **Architecture (2 pages)** — `../ULPF-Architecture-2Page.md` (also `Architecture.md` here, same content trimmed)
* **Audit** — `../ULPF-Audit-Report-Detailed.md` + `AUDIT.md` here
* **Deliverables** — `../ULPF-Expected-Solution-Deliverables.md`

## By architect layer (where each doc lives)

* **Architecture** — `Architecture.md`, `../ULPF-Perimeter-Prototype/SYSTEM_DESIGN.md`, `../ULPF-Perimeter-Prototype/SYSTEM_ARCHITECTURE.md`, `../maincode/docs/SYSTEM_ARCH.md`
* **Product** — `Prd.md`, `Phases.md`, `Memory.md`, `Rules.md`
* **Ops & Risk** — `Operational.md`, `Financial.md`, `Market.md`, `Risks.md`, `Security and review.md`
* **Evidence** — `Research.md`, `References.md`, `AUDIT.md`, `../ULPF-Deep-Research-Report.md`

## Pattern decisions (so docs line up with code)

* **Prototype pattern:** modular monolith — `Prd.md §4` + `SYSTEM_DESIGN.md §2` (assessor flagged unstructured 0%; fix is module boundaries, not microservices).
* **Full product pattern:** event-driven + microservices — `Architecture.md:241` + `SYSTEM_ARCHITECTURE.md §7` (Kafka, WireGuard pod, Hyper ONNX).
* **DB choice:** Postgres for prototype (<1M, GIN), ClickHouse added later for burst — `SYSTEM_ARCHITECTURE.md §5`.

## Large-file note (assessor flagged)

* `maincode/ai_solver/models.py 848L`, `rule_generator.py 633L`, `pipeline.py 544L`, `demo.py 503L`, `perimeter/ui/server.go 525L`. Split is `server.go -> api.go + ingest.go + stats.go` sharing `store`. Not done yet so the demo diff stays reviewable; see `SYSTEM_DESIGN.md §4`.
