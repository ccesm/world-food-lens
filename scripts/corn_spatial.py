"""Production Level C contract and area accounting (no hazard or alert rules).

Raw inputs/annual grids are external. This module is deliberately stdlib-only;
the optional geospatial runtime is confined to preprocessing and weather IO.
"""
import hashlib
import json
import math
from datetime import date, timedelta
from pathlib import Path

from data_contract import DataIssue, attach_metadata, SPEC

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "research/cornbelt_spatial/config.json").read_text())
STATES = json.loads((ROOT / "src/data/cornPilot.json").read_text())["regions"]
GRID = CONFIG["grid"]
METHOD = "mapped-corn-weather-production/1"
ANNUAL_METHOD = "native30m-corn-fraction-exact-overlap/1"
METRICS = ("tmaxDailyMeanC", "tmaxPeriodMaximumC", "tminDailyMeanC", "tminPeriodMinimumC", "precipitation14DayMm")
VARIABLES = {"tmmx": "air_temperature", "tmmn": "air_temperature", "pr": "precipitation_amount"}
REGISTRY = json.loads((ROOT / "src/data/cornSpatial.json").read_text())["datasets"]
# Add dataset registrations, not another metadata schema/health interpreter.
# Frozen Phase 4A contract files remain byte-identical and reproducible.
for dataset, definition in REGISTRY.items():
    SPEC["providers"][dataset] = definition["provider"]
    SPEC["datasets"][dataset] = {k: v for k, v in definition.items() if k != "provider"}
REASON_MAP = {"crop_grid_unavailable": "coverage_incomplete", "crop_grid_version_mismatch": "semantic_validation_failed",
              "weather_grid_incomplete": "coverage_incomplete", "spatial_alignment_failed": "semantic_validation_failed",
              "partial_spatial_coverage": "coverage_incomplete"}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def file_hash(path):
    sha = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    partial.write_text(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n")
    partial.replace(path)


def external_cache(path):
    path = Path(path).resolve()
    if path in (Path("/"), Path.home(), ROOT) or ROOT in path.parents:
        raise ValueError("Raw inputs and annual spatial caches must remain outside the repository")
    path.mkdir(parents=True, exist_ok=True)
    return path


def dates(start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if (last - first).days != 13:
        raise DataIssue("Production spatial weather requires exactly fourteen days")
    return [(first + timedelta(days=i)).isoformat() for i in range(14)]


def annual_identity(state, year, source_hash, boundary_hash, geometry_hash):
    # Real source identities, not paths or file modification/retrieval clocks.
    return {"crop": "corn-class-1", "state": state, "cropYear": year, "cdlHash": source_hash,
            "boundaryHash": boundary_hash, "weatherGeometryHash": geometry_hash,
            "grid": GRID, "methodVersion": ANNUAL_METHOD, "referenceImplementationHash": reference_hash()}


def reference_hash():
    return digest({"geometry": file_hash(ROOT / "research/cornbelt_spatial/geometry.py"),
                   "nativeFootprints": file_hash(ROOT / "research/iowa_spatial/spatial.py")})


def validate_manifest(directory):
    directory = Path(directory)
    try:
        manifest = json.loads((directory / "manifest.json").read_text())
        identity = manifest["identity"]
        if (identity["methodVersion"] != ANNUAL_METHOD or identity["grid"] != GRID or
                identity["state"] not in {s["id"] for s in STATES} or identity["crop"] != "corn-class-1" or
                not isinstance(identity["cropYear"], int) or not 2008 <= identity["cropYear"] <= 2023 or
                manifest["key"] != digest(identity) or identity.get("referenceImplementationHash") != reference_hash()):
            raise DataIssue("Annual crop-grid version/identity mismatch", "crop_grid_version_mismatch")
        if set(manifest["artifacts"]) != {"cells.json", "overlap.npz", "coordinates.json"}:
            raise ValueError("Incomplete annual package")
        for name, sha in manifest["artifacts"].items():
            if file_hash(directory / name) != sha:
                raise ValueError("Annual crop-grid checksum failure")
        cells = json.loads((directory / "cells.json").read_text())
        if not cells or len({c["id"] for c in cells}) != len(cells):
            raise ValueError("Empty/duplicate crop grid")
        for c in cells:
            if not all(isinstance(c[k], (int, float)) and not isinstance(c[k], bool) and math.isfinite(c[k])
                       for k in ("cornAreaM2", "validAreaM2", "cornFraction")) or not (
                    0 <= c["cornAreaM2"] <= c["validAreaM2"] <= GRID["cellSizeM"] ** 2 + .01) or abs(
                    c["cornFraction"] - c["cornAreaM2"] / GRID["cellSizeM"] ** 2) > 1e-12:
                raise ValueError("Impossible annual crop area")
        total = sum(c["cornAreaM2"] for c in cells)
        if total <= 0 or abs(total - manifest["mappedCornAreaM2"]) > .01:
            raise ValueError("Invalid annual mapped denominator")
        coords = json.loads((directory / "coordinates.json").read_text())
        if digest({"lat": coords["lat"], "lon": coords["lon"], "crs": "EPSG:4326"}) != identity["weatherGeometryHash"]:
            raise ValueError("Annual weather geometry mismatch")
        return manifest, cells, coords
    except DataIssue:
        raise
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise DataIssue(str(error), "crop_grid_unavailable") from error


def record(key, state, data, at, period, *, failure=None, previous=None):
    url = "https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php" if key == "cornSpatialCrop" else "https://www.climatologylab.org/gridmet.html"
    result = {"status": "error" if failure else "ok", "fetchedAt": at if not failure else None,
              "lastAttemptAt": at, "source": {"url": url, "period": period, "publishedAt": None}, "data": data or {}}
    if failure:
        result.update(error=str(failure), failureKind="validation" if failure.reason != "retrieval_failed" else "retrieval")
        # No failed attempt ever appears as an accepted current zero-area value.
        if previous and previous.get("data"):
            result["data"] = previous["data"]
            result["fetchedAt"] = previous.get("fetchedAt")
            result["source"] = previous["source"]
    canonical_failure = DataIssue(str(failure), REASON_MAP.get(failure.reason, failure.reason), failure.format_state) if failure else None
    attach_metadata(result, key, previous, point_id=state, failure=canonical_failure, parsed=bool(data))
    result["metadata"]["extensions"] = {"methodVersion": METHOD, "gridVersion": GRID["version"],
                                          "informationalOnly": True, "localStageEligibility": "insufficient",
                                          "spatialReason": failure.reason if failure else None}
    return result


def combine(states, distributions=None):
    """Known failed-state geography stays in denominator; unknown stays unknown."""
    included = [s for s in states if s["status"] == "ok"]
    unknown = [s["state"] for s in states if s.get("mappedCornAreaM2") is None]
    known = sum(s["mappedCornAreaM2"] or 0 for s in states)
    valid = sum(s["validWeatherAreaM2"] for s in included)
    if known <= 0 and not unknown or valid < 0 or valid > known + max(.01, known * 1e-9):
        raise DataIssue("Impossible combined spatial areas", "spatial_alignment_failed")
    result = {"includedStates": [s["state"] for s in included],
              "unavailableStates": [s["state"] for s in states if s["status"] != "ok"],
              "unknownGeographyStates": unknown, "knownMappedCornAreaM2": known,
              "mappedCornAreaM2": None if unknown else known, "validWeatherAreaM2": valid,
              "coverage": None if unknown or not known else valid / known,
              "missingAreaM2": None if unknown else max(0., known - valid),
              "weatherSummary": {k: None for k in METRICS},
              "spatialMethod": "mapped-corn-area-weighted", "scope": "ten-state-corn-belt-only",
              "contributingInputs": [{"state": s["state"], "annualKey": s["annualKey"],
                                      "weatherVersions": s["weatherVersions"]} for s in included]}
    if distributions:
        import numpy as np
        from corn_spatial_geo import weighted_stats
        for metric in METRICS:
            values = np.concatenate([d[0][metric] for d in distributions])
            weights = np.concatenate([d[1] for d in distributions])
            result["weatherSummary"][metric] = weighted_stats(values, weights)
    return result
