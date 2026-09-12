"""Refresh public official-data cache, preserving each source's last good result.

Run from the repository root: python3 scripts/refresh_data.py
No credentials, external Python dependencies or browser cross-origin fetches.
"""

import argparse
import copy
import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import tempfile


ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "public/data/official-data.json"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def validate_result(result, key):
    if not isinstance(result, dict) or not isinstance(result.get("data"), dict):
        raise ValueError("Adapter did not return a data object")
    source = result.get("source", {})
    if not all(source.get(key) for key in ("label", "url", "period", "unit")):
        raise ValueError("Missing source metadata")
    if not source["url"].startswith("https://"):
        raise ValueError("Source must use HTTPS")
    # allow_nan=False rejects NaN/Infinity anywhere before replacing the cache.
    json.dumps(result, allow_nan=False)
    if not result["data"]:
        raise ValueError("Empty source data")
    data = result["data"]
    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    def month(value):
        return isinstance(value, str) and bool(re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value))
    def headline(value):
        return isinstance(value, dict) and number(value.get("value")) and value["value"] > 0 and \
            month(value.get("period")) and isinstance(value.get("unit"), str) and \
            (value.get("momPct") is None or number(value["momPct"]))
    def series(rows, field):
        return isinstance(rows, list) and len(rows) >= 2 and all(
            isinstance(row, dict) and month(row.get("month")) and number(row.get(field)) and
            row[field] > 0 and (i == 0 or row["month"] > rows[i-1]["month"])
            for i, row in enumerate(rows))
    valid = False
    if key in ("fao", "eia"):
        valid = headline(data.get("headline")) and series(data.get("monthly"), "fao" if key == "fao" else "brent")
    elif key == "worldBank":
        valid = all(headline(data.get("headline", {}).get(field)) for field in ("brent", "urea")) and \
            series(data.get("monthly"), "brent") and all(
                isinstance(data.get(field), list) and len(data[field]) > 0 and all(
                    isinstance(row, dict) and number(row.get("price")) and row["price"] > 0 and
                    month(row.get("period")) and isinstance(row.get("nameEn"), str) and
                    isinstance(row.get("nameZh"), str) and
                    (row.get("momPct") is None or number(row["momPct"])) for row in data[field])
                for field in ("fertilizers", "agriculture"))
    elif key == "usda":
        valid = bool(re.fullmatch(r"\d{4}/\d{4}", str(data.get("latestPeriod", "")))) and \
            number(data.get("stockToUse")) and data["stockToUse"] >= 0 and number(data.get("priorStockToUse")) and \
            isinstance(data.get("history"), list) and len(data["history"]) >= 2 and all(
                isinstance(row, dict) and isinstance(row.get("year"), str) and number(row.get("ratio"))
                and row["ratio"] >= 0 for row in data["history"])
    elif key == "noaa":
        valid = number(data.get("latest", {}).get("value")) and isinstance(data.get("history"), list) and \
            len(data["history"]) >= 2 and all(isinstance(row, dict) and isinstance(row.get("period"), str) and
                (row.get("value") is None or number(row["value"])) for row in data["history"])
    if not valid:
        raise ValueError(f"Invalid {key} data shape; previous cache retained")
    return result


def observation_key(key, result):
    data = result.get("data", {})
    if key == "worldBank":
        return data.get("headline", {}).get("urea", {}).get("period", "")
    if key in ("fao", "eia"):
        return data.get("headline", {}).get("period", "")
    if key == "usda":
        return data.get("latestPeriod", "")
    if key == "noaa":
        return data.get("latest", {}).get("endMonth", "")
    return ""


def refresh_bundle(previous, fetchers, attempted_at=None):
    """Pure orchestration apart from supplied fetchers; failures never erase data."""
    stamp = attempted_at or utc_now()
    bundle = copy.deepcopy(previous)
    bundle.update(schemaVersion=1, generatedAt=stamp)
    records = bundle.setdefault("sources", {})
    failures = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fetcher): key for key, fetcher in fetchers.items()}
        for future in as_completed(futures):
            key = futures[future]
            old = records.get(key, {})
            try:
                result = validate_result(future.result(), key)
                new_period, old_period = observation_key(key, result), observation_key(key, old)
                if new_period and old_period and new_period < old_period:
                    raise ValueError(f"Source regressed from {old_period} to {new_period}; retained cache")
                records[key] = dict(result, status="ok", fetchedAt=attempted_at or utc_now(), lastAttemptAt=stamp)
            except Exception as exc:
                message = f"{type(exc).__name__}: {exc}"[:350]
                failures[key] = message
                records[key] = dict(old, status="error", lastAttemptAt=stamp, error=message)
    return bundle, failures


def write_cache(path, bundle):
    """Same-directory atomic replacement; a killed refresh cannot truncate JSON."""
    payload = json.dumps(bundle, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix=".official-", suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    from macro_sources import fetch_world_bank, fetch_fao, fetch_usda, fetch_eia
    from climate_sources import fetch_noaa

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=CACHE_PATH)
    args = parser.parse_args()
    previous = json.loads(args.output.read_text()) if args.output.exists() else {"sources": {}}
    if previous.get("schemaVersion", 1) != 1 or not isinstance(previous.get("sources"), dict):
        raise ValueError("Unsupported existing cache; refusing to overwrite")
    fetchers = {"worldBank": fetch_world_bank, "fao": fetch_fao,
                "eia": fetch_eia, "usda": fetch_usda, "noaa": fetch_noaa}
    bundle, failures = refresh_bundle(previous, fetchers)
    write_cache(args.output, bundle)
    for key in fetchers:
        record = bundle["sources"][key]
        print(f"{key}: {record['status']} | "
              f"{record.get('source', {}).get('period', 'no observations')} | "
              f"last success: {record.get('fetchedAt', 'never')}")
        if key in failures:
            print(f"  {failures[key]}")
    # The deployment workflow can still publish retained data with visible errors.
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
