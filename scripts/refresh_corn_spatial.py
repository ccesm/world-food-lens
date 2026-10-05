#!/usr/bin/env python3
"""State-isolated rolling Level C refresh. No alert evaluation or delivery."""
import argparse
import json
import resource
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from corn_spatial import (GRID, METHOD, STATES, VARIABLES, METRICS, combine, dates, digest,
                          external_cache, file_hash, record, validate_manifest, write_json)
from data_contract import DataIssue, timestamp
SETTINGS = json.loads((Path(__file__).resolve().parents[1] / "src/data/cornSpatial.json").read_text())


def fetch_weather(cache, url, identity, checked_day, *, attempts=3, deadline=None):
    """Daily recheck of the rolling preliminary window; same-day warm reuse.

    Date clocks control retrieval freshness, NOT scientific identity. Exact raw
    checksum plus query/input identity validates reuse. Source content hashes
    and edition text in the published artifact identify the consumed weather.
    """
    key = digest(identity)
    path, manifest_path = cache / (key + ".nc"), cache / (key + ".json")
    try:
        m = json.loads(manifest_path.read_text())
        if m["identity"] == identity and m["url"] == url and m["checkedDay"] == checked_day and file_hash(path) == m["rawHash"]:
            return path, m, 0
    except (OSError, ValueError, KeyError, TypeError):
        pass
    last = None
    for attempt in range(attempts):
        partial = path.with_suffix(".part")
        try:
            remaining = deadline - time.monotonic() if deadline is not None else 60
            if remaining <= 0:
                raise TimeoutError("Spatial weather retrieval budget exhausted")
            size = 0
            with urlopen(url, timeout=min(60, remaining)) as response, partial.open("wb") as stream:
                length = int(response.headers.get("Content-Length", 0))
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    if deadline is not None and time.monotonic() >= deadline:
                        raise TimeoutError("Spatial weather retrieval budget exhausted")
                    size += len(chunk)
                    if size > 20_000_000:
                        raise ValueError("Weather subset exceeds bounded request budget")
                    stream.write(chunk)
                if not size or length and size != length:
                    raise ValueError("Incomplete weather download")
                headers = {k: response.headers.get(k) for k in ("ETag", "Last-Modified")}
            partial.replace(path)
            m = {"identity": identity, "url": url, "checkedDay": checked_day, "rawHash": file_hash(path),
                 "bytes": size, "headers": headers}
            write_json(manifest_path, m)
            return path, m, size
        except Exception as error:
            last = error
            if partial.exists():
                partial.unlink()  # Exact incomplete file owned by this collector.
            if deadline is not None and time.monotonic() >= deadline:
                break
            if attempt + 1 < attempts:
                time.sleep(min(2 ** attempt, 4))
    raise DataIssue(str(last), "retrieval_failed", "unknown")


def process(state, annual_dir, weather_cache, period, at, level_a, previous, *, offline_raw=None, deadline=None):
    from corn_spatial_geo import load_annual, read_weather, summarize, point_comparison
    import numpy as np
    manifest, coords, weights = load_annual(annual_dir)
    year = manifest["identity"]["cropYear"]
    if year > int(period[-1][:4]):
        raise DataIssue("Future crop geography cannot be used for an earlier weather period", "publication_regression")
    if manifest["publicationDate"] > period[0] and offline_raw is None:
        raise DataIssue("Crop map publication is later than weather window", "publication_regression")
    source_versions, arrays, downloaded = {}, {}, 0
    for key, variable in VARIABLES.items():
        pieces, versions = [], []
        # Cross-year windows use their real source years, never substitute dates.
        for weather_year in sorted({d[:4] for d in period}):
            subset = [d for d in period if d.startswith(weather_year)]
            params = {"var": variable, **coords["bounds"], "time_start": subset[0] + "T00:00:00Z",
                      "time_end": subset[-1] + "T00:00:00Z", "accept": "netcdf"}
            url = f"https://thredds.northwestknowledge.net/thredds/ncss/MET/{key}/{key}_{weather_year}.nc?" + urlencode(params)
            identity = {"dataset": "gridMET", "variable": key, "period": subset, "geometry": manifest["identity"]["weatherGeometryHash"],
                        "query": url, "readerVersion": "gridmet-native-masked/1"}
            if offline_raw:
                path = Path(offline_raw) / state["id"] / (key + ".nc")
                acquisition = json.loads((path.parent / "acquisition.json").read_text())
                if file_hash(path) != acquisition[key + ".nc"]["sha256"]:
                    raise DataIssue("Offline weather input checksum mismatch")
                downloaded_now = 0
                url = acquisition[key + ".nc"]["url"]
            else:
                path, _, downloaded_now = fetch_weather(weather_cache, url, identity, at[:10], deadline=deadline)
            array, version = read_weather(path, variable, subset, coords)
            version.update(sourceUrl="https://www.climatologylab.org/gridmet.html", downloadUrl=url)
            pieces.append(array)
            versions.append(version)
            downloaded += downloaded_now
        arrays[key] = np.concatenate(pieces, axis=0)
        source_versions[key] = versions
    summaries, diagnostics, joint, values, joint_weights = summarize(arrays, weights, period)
    mapped = manifest["mappedCornAreaM2"]
    if joint > mapped + max(.01, mapped * 1e-9):
        raise DataIssue("Valid weather area exceeds mapped crop area", "spatial_alignment_failed")
    state_result = {"state": state["id"], "status": "ok" if joint else "unavailable", "spatialMethod": "mapped-corn-area-weighted",
                    "mappedCornAreaM2": mapped, "validWeatherAreaM2": joint, "missingAreaM2": max(0., mapped - joint),
                    "coverage": joint / mapped, "weatherSummary": summaries, "coverageDiagnostics": diagnostics,
                    "annualKey": manifest["key"], "cropGeographyYear": year, "cropGeographyPublicationDate": manifest["publicationDate"],
                    "geographyUse": "year-specific" if year == int(period[-1][:4]) else "validated-older-geography-proxy",
                    "geographyReason": "validated-year-specific-cdl" if year == int(period[-1][:4]) else "older-validated-native30m-proxy; newer-native10m-not-validated",
                    "weatherVersions": source_versions, "gridVersion": GRID["version"], "methodVersion": METHOD,
                    "period": {"start": period[0], "end": period[-1]}, "localStageEligibility": "insufficient",
                    "availability": "retrospective-validation-only" if offline_raw else "operational-observation",
                    "pointComparison": point_comparison(state, coords, values, weights, summaries, level_a, period),
                    "areaValidation": manifest.get("areaValidation"),
                    "reasons": [] if joint >= mapped - max(.01, mapped * 1e-9) else ["partial_spatial_coverage"]}
    if not joint:
        state_result["reasons"] = ["weather_grid_incomplete"]
    data = {"crop": {"annualKey": manifest["key"], "cropGeographyYear": year, "mappedCornAreaM2": mapped,
                     "publicationDate": manifest["publicationDate"], "cdlHash": manifest["identity"]["cdlHash"],
                     "sourceUrl": manifest["cdlSourceUrl"], "metadataHash": manifest["metadataHash"], "gridVersion": GRID["version"]},
            "weather": {"period": state_result["period"], "versions": source_versions, "coverageDiagnostics": diagnostics},
            "intersection": {k: state_result[k] for k in ("annualKey", "cropGeographyYear", "period", "mappedCornAreaM2",
                "validWeatherAreaM2", "missingAreaM2", "coverage", "weatherSummary", "gridVersion", "methodVersion", "localStageEligibility")}}
    previous_records = (previous or {}).get("records", {})
    failure = None if joint else DataIssue("No complete crop/weather support", "weather_grid_incomplete")
    state_result["records"] = {component: record(dataset, state["id"], data[component], at,
        str(year) if component == "crop" else period[-1], failure=failure if component != "crop" else None,
        previous=previous_records.get(component)) for component, dataset in
        (("crop", "cornSpatialCrop"), ("weather", "cornSpatialWeather"), ("intersection", "cornSpatial"))}
    return state_result, (values, joint_weights), downloaded


def refresh(annual, weather_cache, start, end, at, *, previous=None, official=None, offline_raw=None, fail_state=None, network_budget=None):
    period = dates(start, end)
    deadline = time.monotonic() + network_budget if network_budget is not None else None
    results, distributions, measurements = [], [], []
    for state in STATES:
        begun = time.perf_counter()
        old = next((s for s in (previous or {}).get("states", []) if s["state"] == state["id"]), None)
        mapped, manifest = None, None
        crop_record = None
        try:
            try:
                index = json.loads((Path(annual) / "index.json").read_text())
            except (OSError, ValueError, TypeError) as error:
                raise DataIssue("Annual index unavailable/corrupt", "crop_grid_unavailable") from error
            if (index["methodVersion"] != SETTINGS["annualMethodVersion"] or index["grid"] != GRID or
                    (not offline_raw and (index["cropYear"] != SETTINGS["cropGeographyYear"] or digest(index) != SETTINGS["annualIndexHash"]))):
                raise DataIssue("Unapproved annual vintage/methodology", "crop_grid_version_mismatch")
            # Recover verified geography independently of weather retrieval.
            manifest, _, _ = validate_manifest(Path(annual) / state["id"])
            if manifest["key"] != index["states"].get(state["id"]) or manifest["identity"]["cropYear"] != index["cropYear"]:
                raise DataIssue("Annual index/state version mismatch", "crop_grid_version_mismatch")
            mapped = manifest["mappedCornAreaM2"]
            if fail_state == state["id"]:
                raise DataIssue("Explicit validation-only simulated state outage", "retrieval_failed", "unknown")
            result, distribution, downloaded = process(state, Path(annual) / state["id"], weather_cache, period, at,
                (official or {}).get("cornPilot", {}).get("weather", {}).get(state["id"]), old, offline_raw=offline_raw, deadline=deadline)
            if result["status"] == "ok":
                distributions.append(distribution)
        except Exception as error:
            issue = error if isinstance(error, DataIssue) else DataIssue(str(error), "spatial_alignment_failed")
            # Detailed paths belong in runner diagnostics, not public JSON.
            print(f"{state['id']}: internal diagnostic: {issue}", file=__import__('sys').stderr)
            issue = DataIssue(f"Spatial source unavailable: {issue.reason}", issue.reason, issue.format_state)
            result = {"state": state["id"], "status": "unavailable", "spatialMethod": "unavailable", "mappedCornAreaM2": mapped,
                      "validWeatherAreaM2": 0., "coverage": 0. if mapped else None, "missingAreaM2": mapped,
                      "period": {"start": start, "end": end}, "reasons": [issue.reason], "error": str(issue),
                      "annualKey": manifest["key"] if manifest else None, "cropGeographyYear": manifest["identity"]["cropYear"] if manifest else None,
                      "geographyUse": ("year-specific" if manifest["identity"]["cropYear"] == int(end[:4]) else "validated-older-geography-proxy") if manifest else "unavailable",
                      "geographyReason": ("validated-year-specific-cdl" if manifest["identity"]["cropYear"] == int(end[:4]) else "older-validated-native30m-proxy; newer-native10m-not-validated") if manifest else "crop-map-not-validated",
                      "cropGeographyPublicationDate": manifest["publicationDate"] if manifest else None,
                      "areaValidation": manifest.get("areaValidation") if manifest else None,
                      "gridVersion": GRID["version"], "methodVersion": METHOD, "localStageEligibility": "insufficient"}
            old_records = (old or {}).get("records", {})
            crop_data = {"annualKey": manifest["key"], "cropGeographyYear": manifest["identity"]["cropYear"], "mappedCornAreaM2": mapped,
                         "publicationDate": manifest["publicationDate"], "cdlHash": manifest["identity"]["cdlHash"],
                         "sourceUrl": manifest["cdlSourceUrl"], "metadataHash": manifest["metadataHash"], "gridVersion": GRID["version"]} if manifest else None
            result["records"] = {"crop": record("cornSpatialCrop", state["id"], crop_data, at,
                str(result["cropGeographyYear"]) if manifest else None, failure=None if manifest else issue,
                previous=old_records.get("crop"))}
            for component, dataset in (("weather", "cornSpatialWeather"), ("intersection", "cornSpatial")):
                result["records"][component] = record(dataset, state["id"], None, at, end, failure=issue,
                                                       previous=old_records.get(component))
            downloaded = 0
        results.append(result)
        measurements.append({"state": state["id"], "seconds": time.perf_counter() - begun, "downloadBytes": downloaded})
        print(f"{state['id']}: {result['status']} coverage={result['coverage']}", flush=True)
    combined = combine(results, distributions)
    combined.update(period={"start": start, "end": end}, gridVersion=GRID["version"], methodVersion=METHOD,
                    cropGeographyYears=sorted({s["cropGeographyYear"] for s in results if s.get("cropGeographyYear")}),
                    localStageEligibility="insufficient")
    combined["record"] = record("cornSpatial", "ten-state", dict(combined), at, end,
        failure=None if combined["validWeatherAreaM2"] else DataIssue("No usable state weather", "weather_grid_incomplete"),
        previous=(previous or {}).get("combined", {}).get("record"))
    deterministic = {"schemaVersion": 1, "methodVersion": METHOD, "gridVersion": GRID["version"],
                     "period": {"start": start, "end": end}, "states": results, "combined": combined}
    # Operational attempt clocks are outside the analytical content identity.
    projection = {**deterministic, "states": [{k: v for k, v in s.items() if k != "records"} for s in results],
                  "combined": {k: v for k, v in combined.items() if k != "record"}}
    deterministic.update(generatedAt=at, analysisHash=digest(projection), release=None)
    performance = {"states": measurements, "seconds": sum(m["seconds"] for m in measurements),
                   "downloadBytes": sum(m["downloadBytes"] for m in measurements),
                   "maximumMemoryBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if __import__("sys").platform == "darwin" else 1024)}
    return deterministic, performance


def prune_weather(cache, checked_day):
    """Bound external operational cache; never touch files outside owned hash names."""
    import re
    cutoff = (__import__("datetime").date.fromisoformat(checked_day) - timedelta(days=60)).isoformat()
    for path in cache.glob("*.json"):
        if not re.fullmatch(r"[a-f0-9]{64}\.json", path.name):
            continue
        try:
            metadata = json.loads(path.read_text())
            expired = metadata["checkedDay"] < cutoff
        except (ValueError, KeyError, TypeError):
            expired = False
        if expired:
            path.with_suffix(".nc").unlink(missing_ok=True)
            path.unlink()


def archive_inputs(cache, artifact, output):
    """Retain exactly consumed dynamic bytes in an Actions artifact, not Pages."""
    import tarfile
    import gzip
    import io
    hashes = {v["rawFileHash"] for s in artifact["states"] for versions in s.get("weatherVersions", {}).values() for v in versions}
    selected = {}
    for path in cache.glob("*.json"):
        try:
            m = json.loads(path.read_text())
            nc = path.with_suffix(".nc")
            if m.get("rawHash") in hashes and file_hash(nc) == m["rawHash"]:
                selected[path.name] = path
                selected[nc.name] = nc
        except (OSError, ValueError, KeyError):
            continue
    matched = {file_hash(p) for p in selected.values() if p.suffix == ".nc"}
    if matched != hashes:
        raise DataIssue("Consumed weather input archive incomplete", "coverage_incomplete")
    output = Path(output)
    if output.resolve() == Path(__file__).resolve().parents[1] or Path(__file__).resolve().parents[1] in output.resolve().parents:
        raise ValueError("Weather source archive must remain outside the repository")
    partial = Path(str(output) + ".part")
    with partial.open("wb") as destination, gzip.GzipFile(fileobj=destination, mode="wb", mtime=0, filename="") as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for name, path in sorted(selected.items()):
                raw = path.read_bytes()
                entry = tarfile.TarInfo(name)
                entry.size, entry.mtime, entry.mode = len(raw), 0, 0o644
                archive.addfile(entry, io.BytesIO(raw))
    partial.replace(output)
    return {"sha256": file_hash(output), "bytes": output.stat().st_size,
            "retention": "GitHub Actions artifact: 90 days; not a permanent research archive"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--annual-cache", required=True)
    parser.add_argument("--weather-cache", required=True)
    parser.add_argument("--output", default="public/data/corn-spatial.json")
    parser.add_argument("--performance")
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--now")
    parser.add_argument("--offline-raw")
    parser.add_argument("--fail-state", choices=[s["id"] for s in STATES])
    parser.add_argument("--input-archive")
    parser.add_argument("--network-budget-seconds", type=float, default=180,
                        help="Shared retrieval budget; existing valid same-day entries remain usable")
    args = parser.parse_args()
    if not __import__('math').isfinite(args.network_budget_seconds) or args.network_budget_seconds <= 0:
        parser.error("--network-budget-seconds must be finite and positive")
    if args.now and not timestamp(args.now):
        parser.error("--now must be a canonical UTC timestamp")
    now = datetime.fromisoformat(args.now.replace("Z", "+00:00")) if args.now else datetime.now(timezone.utc)
    at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    end = args.end or (now.date() - timedelta(days=SETTINGS["weatherLagDays"])).isoformat()
    start = args.start or (__import__("datetime").date.fromisoformat(end) - timedelta(days=13)).isoformat()
    if end > now.date().isoformat():
        parser.error("Weather observations cannot be in the future")
    annual, weather_cache = external_cache(args.annual_cache), external_cache(args.weather_cache)
    output = Path(args.output)
    try:
        previous = json.loads(output.read_text())
    except (OSError, ValueError):
        previous = None
    try:
        official = json.loads((output.parent / "official-data.json").read_text())
    except (OSError, ValueError):
        official = None
    artifact, performance = refresh(annual, weather_cache, start, end, at, previous=previous, official=official,
                                    offline_raw=args.offline_raw, fail_state=args.fail_state, network_budget=args.network_budget_seconds)
    if args.input_archive:
        artifact["inputArchive"] = archive_inputs(weather_cache, artifact, args.input_archive)
    write_json(output, artifact)
    prune_weather(weather_cache, at[:10])
    if args.performance:
        write_json(args.performance, performance)
