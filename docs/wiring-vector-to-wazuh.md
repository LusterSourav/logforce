# Wiring Vector to Wazuh

Vector already writes NDJSON to `output/normalized`. A second sink can mirror
that NDJSON to the Wazuh indexer without touching the file path.

Uncomment in `ingestion/vector.toml`:

```toml
[sinks.wazuh_indexer]
type = "elasticsearch"
inputs = ["perimeter_normalized"]
endpoint = "${WAZUH_INDEXER_ENDPOINT}" # e.g. https //wazuh indexer
index = "logforce-ocsf-%Y-%m-%d"
auth.strategy = "basic"
auth.user = "admin"
auth.password = "${WAZUH_INDEXER_PASSWORD}"
tls.ca_file = "${CA_BUNDLE}"
```

Or keep it simple: the Go API already handles the search path. `POST
/api/ingest` writes to Postgres GIN (`raw jsonb`) and the file. The Wazuh
decoders in `parsing/decoders/perimeter.yml` read that same NDJSON. Pick one
path for the demo, not both.
