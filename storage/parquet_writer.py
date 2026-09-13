# parquet_writer.py
# NDJSON from Vector or Lumber becomes columnar Parquet under Hive layout.
# Hive is year/month/day/class/vendor so DataFusion can prune 90 percent of files
# when you query with WHERE class_uid equals 4001 and year equals 2025.

from pathlib import Path
import datetime

def hive_path(base: Path, class_uid: int = 4001, vendor: str = "generic"):
    # dated hive directory, create it if missing
    now = datetime.datetime.utcnow()
    p = base / f"year={now:%Y}" / f"month={now:%m}" / f"day={now:%d}" / f"class={class_uid}" / f"vendor={vendor}"
    p.mkdir(parents=True, exist_ok=True)
    return p

def write_ndjson_to_parquet(ndjson_path: Path, parquet_base: Path):
    # Try pyarrow first. If it is not installed, keep NDJSON under the hive dir
    # so the watcher still moves data and you do not lose events air gapped.
    try:
        import pyarrow.json as pj
        import pyarrow.parquet as pq
        table = pj.read_json(str(ndjson_path))
        out = hive_path(parquet_base) / f"{ndjson_path.stem}.parquet"
        pq.write_table(table, str(out), compression="snappy")
        return str(out)
    except ImportError:
        out = hive_path(parquet_base) / f"{ndjson_path.stem}.ndjson"
        out.write_bytes(ndjson_path.read_bytes())
        return str(out) + " (pyarrow missing so kept as NDJSON)"

def watch_and_convert(ndjson_dir: Path = Path("output/normalized"), parquet_base: Path = Path("output/parquet"), interval: int = 30):
    # poll loop for air gapped demos. Vector keeps writing, this keeps converting.
    import time
    seen = set()
    print(f"watching {ndjson_dir} to {parquet_base} every {interval}s")
    while True:
        for f in ndjson_dir.glob("*.ndjson"):
            if str(f) not in seen and f.stat().st_size > 0:
                try:
                    out = write_ndjson_to_parquet(f, parquet_base)
                    print(f"{f.name} becomes {out}")
                    seen.add(str(f))
                except Exception as e:
                    print(f"failed {f.name} with {e}")
        time.sleep(interval)

if __name__ == "__main__":
    import sys
    if "--watch" in sys.argv:
        watch_and_convert()
    else:
        src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("output/normalized/perimeter-2025-01-01.ndjson")
        print(write_ndjson_to_parquet(src, Path("output/parquet")))
