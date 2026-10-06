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
from urllib.error import URLError
from data_contract import attach_metadata, DataIssue


ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "public/data/official-data.json"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def failure_kind(error):
    """Classify known failures; an unexpected exception is not proof of outage."""
    if isinstance(error, (OSError, URLError)):
        return "retrieval"
    if isinstance(error, ValueError):
        return "validation"
    return "unknown"


def validate_result(result, key):
    if not isinstance(result, dict) or not isinstance(result.get("data"), dict):
        raise DataIssue("Adapter did not return a data object", "invalid_format", "failed")
    source = result.get("source", {})
    if not all(source.get(key) for key in ("label", "url", "period", "unit")):
        raise DataIssue("Missing source metadata", "invalid_format", "failed")
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
            month(data.get("releasePeriod")) and source["period"] == data["latestPeriod"] and \
            number(data.get("stockToUse")) and data["stockToUse"] >= 0 and number(data.get("priorStockToUse")) and \
            isinstance(data.get("history"), list) and len(data["history"]) >= 2 and all(
                isinstance(row, dict) and isinstance(row.get("year"), str) and number(row.get("ratio"))
                and row["ratio"] >= 0 for row in data["history"])
        if "grains" in data:
            def quantities(row):
                return isinstance(row, dict) and all(number(row.get(k)) for k in
                    ("production", "consumption", "endingStocks", "ratio")) and \
                    row["production"] > 0 and row["consumption"] > 0 and row["endingStocks"] >= 0 and \
                    abs(row["ratio"] - row["endingStocks"] / row["consumption"] * 100) < .001
            def grain(value):
                if not isinstance(value, dict):
                    return False
                rows = value.get("history")
                return isinstance(rows, list) and len(rows) >= 2 and all(
                    isinstance(row, dict) and quantities(row) and
                    bool(re.fullmatch(r"\d{4}/\d{4}", str(row.get("year", "")))) and
                    int(row["year"][5:]) == int(row["year"][:4])+1 and
                    (i == 0 or int(row["year"][:4]) == int(rows[i-1]["year"][:4])+1) and
                    (row.get("excludingChina") is None or (quantities(row["excludingChina"]) and
                        all(row["excludingChina"][k] <= row[k] for k in ("production", "consumption", "endingStocks"))))
                    for i, row in enumerate(rows)) and value.get("latestPeriod") == rows[-1]["year"] and \
                    value.get("stockToUse") == rows[-1]["ratio"] and value.get("priorStockToUse") == rows[-2]["ratio"]
            grains = data["grains"]
            valid = valid and isinstance(grains, dict) and all(grain(grains.get(k)) and
                grains[k]["latestPeriod"] == data["latestPeriod"] and
                grains[k].get("releasePeriod") == data["releasePeriod"] for k in ("wheat", "maize", "rice")) and \
                data["history"] == grains["wheat"]["history"]
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


def check_usda_publication(result, previous, stamp):
    """Compare publication vintages separately from marketing-year identities.

    Same-vintage content corrections are accepted and fingerprinted, not
    mistaken for a new publication. This does not establish official revision
    ordering within a month; the bulk source exposes only year/month here.
    """
    from macro_sources import usda_identity
    from usda_coverage import assess_coverage

    incoming = copy.deepcopy(result)
    data, old = incoming["data"], previous.get("data", {})
    vintage, old_vintage = data["releasePeriod"], old.get("releasePeriod")
    checked_month = datetime.fromisoformat(stamp.replace("Z", "+00:00")).strftime("%Y-%m")
    if vintage > checked_month:
        raise DataIssue("USDA publication vintage is in the future; retained cache")
    if old_vintage and vintage < old_vintage:
        raise DataIssue(f"USDA publication vintage regressed from {old_vintage} to {vintage}; retained cache", "publication_regression")
    codes = {"wheat": "410000", "maize": "440000", "rice": "422110"}
    observations = data.get("grains", {"wheat": data})
    prior_observations = old.get("grains", {"wheat": old})
    revised = False
    for name, observation in observations.items():
        if name not in codes:
            raise ValueError("Unknown USDA observation; retained cache")
        prior = prior_observations.get(name, {})
        prior_vintage = prior.get("releasePeriod", old_vintage)
        if prior_vintage and observation["releasePeriod"] < prior_vintage:
            raise DataIssue(f"USDA {name} publication vintage regressed; retained cache", "publication_regression")
        identity = usda_identity(observation, codes[name])
        for field, expected in identity.items():
            if field in observation and observation[field] != expected:
                raise ValueError(f"USDA {field} does not match observation content; retained cache")
        if prior.get("history") and identity["revisionId"] != usda_identity(prior, codes[name])["revisionId"]:
            revised = True
        observation.update(identity)
        observation["coverageAssessment"] = assess_coverage(observation, prior)
    if "grains" in data:
        # The existing top-level fields are the legacy wheat observation.
        identity = usda_identity(data, codes["wheat"])
        if any(field in data and data[field] != expected for field, expected in identity.items()):
            raise ValueError("USDA legacy wheat identity does not match observation content; retained cache")
        data.update(identity)
        data["coverageAssessment"] = data["grains"]["wheat"]["coverageAssessment"]
    if not old:
        kind = "first-publication"
    elif not old_vintage:
        kind = "publication-established"
    elif data["latestPeriod"] != old.get("latestPeriod"):
        kind = "new-market-year"
    elif vintage != old_vintage:
        kind = "new-publication"
    else:
        kind = "same-vintage-revision" if revised else "unchanged"
    incoming["refreshKind"] = kind
    return incoming


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
            parsed, failure = False, None
            try:
                result = future.result()
                parsed = True
                result = validate_result(result, key)
                new_period, old_period = observation_key(key, result), observation_key(key, old)
                if new_period and old_period and new_period < old_period:
                    raise DataIssue(f"Source regressed from {old_period} to {new_period}; retained cache", "publication_regression")
                if key == "usda":
                    result = check_usda_publication(result, old, stamp)
                records[key] = dict(result, status="ok", fetchedAt=attempted_at or utc_now(), lastAttemptAt=stamp)
            except Exception as exc:
                failure = exc
                message = f"{type(exc).__name__}: {exc}"[:350]
                failures[key] = message
                records[key] = dict(old, status="error", lastAttemptAt=stamp, error=message,
                                    failureKind=failure_kind(exc))
            attach_metadata(records[key], key, old, failure=failure, parsed=parsed)
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
