-- init.sql
-- Postgres backing for the C path. Vector http sink POSTs NDJSON here via Go /api/ingest.
-- Keeps the perimeter demo at one compose file and stays compatible with SIEM-Lite queries.

create table if not exists events (
    id bigserial primary key,
    ingested_at timestamptz default now(),
    raw jsonb not null,
    class_uid int,
    vendor text,
    severity text
);

create index if not exists events_raw_gin on events using gin (raw);
create index if not exists events_class_uid on events (class_uid);
create index if not exists events_vendor on events (vendor);
create index if not exists events_ingested on events (ingested_at desc);
