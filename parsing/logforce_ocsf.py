# logforce_ocsf.py
# Fast path for logs already normalized by LogForce. Vector and Lumber both emit
# OCSF 4001 NDJSON. This parser skips re parsing and just lifts fields.

from __future__ import annotations
from typing import Iterator
from pathlib import Path
import sys

# small helper to make imports work when file is run standalone
try:
    from app.models import NormalizedEvent
    from app.util import clean_ip, parse_ts, to_int, iter_json_records
except ImportError:
    # fallback for prototype standalone testing. Real SIEM Lite provides app.models
    NormalizedEvent = None
    clean_ip = lambda x: x
    parse_ts = lambda x: None
    to_int = lambda x: None
    iter_json_records = lambda x: []

# OCSF severity numbers to human names. SIEM Lite stores the name.
_SEV = {0: "unknown", 1: "informational", 2: "low", 3: "medium", 4: "high", 5: "critical", 6: "fatal", 99: "other"}

def _sev_name(rec: dict):
    # OCSF sends severity_id, fall back to string severity if missing
    sid = rec.get("severity_id")
    if sid in _SEV:
        return _SEV[sid]
    s = rec.get("severity")
    return str(s).lower() if s else None

def parse(content: str) -> Iterator:
    # import locally so the module can be inspected without a full SIEM Lite install
    try:
        from app.util import iter_json_records as _iter
        from app.models import NormalizedEvent as NE
        from app.util import clean_ip as _cip, parse_ts as _pts, to_int as _ti
    except ImportError:
        return
        yield  # make it a generator

    for rec in _iter(content):
        # some lumber outputs wrap under event key. Unwrap once.
        r = rec.get("event") if isinstance(rec.get("event"), dict) else rec

        # quick check. If this is not OCSF 4001, try lumber shape. If neither, skip so generic_json can handle it.
        is_ocsf = r.get("class_uid") == 4001
        is_lumber = {"type", "category", "confidence", "summary"} <= set(k.lower() for k in r.keys()) if isinstance(r, dict) else False
        if not is_ocsf and not is_lumber:
            continue

        if is_lumber and not is_ocsf:
            # lumber CanonicalEvent. Already has type/category, just lift.
            yield NE(
                event_time=_pts(r.get("timestamp") or r.get("time")),
                vendor="lumber",
                product=r.get("type"),
                log_type=r.get("category"),
                severity=str(r.get("severity") or "unknown").lower(),
                action=r.get("category"),
                message=r.get("summary") or r.get("raw"),
                raw=rec,
            )
            continue

        # OCSF path. Pull the blocks that matter and keep everything in raw.
        meta = r.get("metadata") or {}
        finding = r.get("finding") or {}
        proc = r.get("process") or {}
        msg = finding.get("title") or r.get("message") or (r.get("unmapped") or {}).get("raw_event")

        yield NE(
            event_time=_pts(r.get("time") or meta.get("time")),
            vendor="logforce",
            product=meta.get("product", {}).get("name") if isinstance(meta.get("product"), dict) else meta.get("product"),
            log_type=finding.get("types", [None])[0] if isinstance(finding.get("types"), list) else finding.get("types"),
            severity=_sev_name(r),
            action=finding.get("types", [None])[0] if isinstance(finding.get("types"), list) else None,
            src_ip=_cip(r.get("src_ip")),
            dst_ip=_cip(r.get("dst_ip")),
            src_port=_ti(r.get("src_port")),
            dst_port=_ti(r.get("dst_port")),
            protocol=(r.get("protocol") or "").lower() or None,
            host_name=proc.get("name") or r.get("host_name"),
            rule_name=finding.get("title"),
            message=str(msg) if msg else None,
            raw=rec,
        )
