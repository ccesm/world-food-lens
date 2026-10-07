"""Phase 4B-2.2a informational VPD distribution over Level C mapped corn area.

Definitions: docs/PHASE4B2_2_VPD_SPEC.md §2–§3. The provider's daily-mean VPD
is used as published; WFL never derives VPD from temperature. Variable name,
units, method version and output names come from the evidence registry, and
any mismatch fails closed (unavailable), never guessed. No threshold, alert or
notification logic lives here.
"""
import json
from pathlib import Path

from corn_spatial import digest
from data_contract import DataIssue

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / "src/data/evidenceRegistry.json").read_text())
RULE = REGISTRY["rules"]["atmospheric_demand_vpd"]
METHOD = RULE["methodologyVersion"]
NC_VARIABLE = RULE["parameters"]["ncVariable"]
SOURCE_KEY = RULE["parameters"]["gridmetPath"]
UNITS = RULE["parameters"]["expectedUnits"]
MEAN_OUTPUT, MAX_OUTPUT = (next(k for k in RULE["outputs"] if k.startswith(prefix)) for prefix in ("vpdDailyMean", "vpdPeriodMaximum"))
VPD_METRICS = (MEAN_OUTPUT, MAX_OUTPUT)
SANITY_KPA = (0., 15.)  # Schema sanity only, not a physiological range.


def read_vpd(path, expected, coordinates):
    """(days x cells) array in kPa. Missing dates stay NaN; anything unexpected fails closed."""
    import netCDF4
    import numpy as np
    with netCDF4.Dataset(path) as source:
        if getattr(source, "geospatial_bounds_crs", None) != "EPSG:4326":
            raise DataIssue("VPD CRS must be evidenced EPSG:4326", "semantic_validation_failed")
        if NC_VARIABLE not in source.variables:
            raise DataIssue(f"VPD variable {NC_VARIABLE} absent; found {sorted(source.variables)}", "semantic_validation_failed")
        field = source.variables[NC_VARIABLE]
        if field.dimensions != ("day", "lat", "lon"):
            raise DataIssue("Unexpected VPD axes", "semantic_validation_failed")
        if getattr(field, "units", None) != UNITS:
            raise DataIssue(f"VPD units {getattr(field, 'units', None)!r}, expected {UNITS}", "semantic_validation_failed")
        day = source.variables["day"]
        actual = [d.isoformat()[:10] for d in netCDF4.num2date(day[:], day.units, calendar=getattr(day, "calendar", "standard"))]
        if not actual or len(set(actual)) != len(actual) or actual != sorted(actual) or any(d not in expected for d in actual):
            raise DataIssue("Empty, duplicated or out-of-period VPD dates", "weather_grid_incomplete")
        lat, lon = np.asarray(source.variables["lat"][:]), np.asarray(source.variables["lon"][:])
        if lat.tolist() != coordinates["lat"] or lon.tolist() != coordinates["lon"]:
            raise DataIssue("VPD geometry differs from the annual crop grid", "spatial_alignment_failed")
        raw = np.ma.asarray(field[:], dtype=np.float64).filled(np.nan)
        finite = raw[np.isfinite(raw)]
        if np.any((finite < SANITY_KPA[0]) | (finite > SANITY_KPA[1])):
            raise DataIssue("VPD values outside schema sanity range", "semantic_validation_failed")
        values = np.full((len(expected), len(lat), len(lon)), np.nan)
        for i, d in enumerate(actual):
            values[expected.index(d)] = raw[i]
        metadata = {"variable": NC_VARIABLE, "units": UNITS, "longName": getattr(field, "long_name", None),
                    "description": getattr(field, "description", None), "sourceEditionText": getattr(source, "date", None),
                    "dayDefinition": getattr(source, "note5", None), "expectedDates": expected,
                    "missingDates": [d for d in expected if d not in actual]}
    return values.reshape(len(expected), -1), metadata


def vpd_cell_values(vpd):
    """Per-cell window mean and maximum; a cell needs all days valid, else NaN."""
    import numpy as np
    vpd = np.asarray(vpd, dtype=float)
    complete = np.all(np.isfinite(vpd), axis=0)
    with np.errstate(invalid="ignore"):
        return {MEAN_OUTPUT: np.where(complete, np.mean(vpd, axis=0), np.nan),
                MAX_OUTPUT: np.where(complete, np.max(vpd, axis=0), np.nan)}, complete


def summarize_vpd(distributions):
    from corn_spatial_geo import weighted_stats
    import numpy as np
    if not distributions:
        return {k: None for k in VPD_METRICS}
    weights = np.concatenate([d[1] for d in distributions])
    return {k: weighted_stats(np.concatenate([d[0][k] for d in distributions]), weights) for k in VPD_METRICS}


def build_artifact(level_c, state_results, combined_summary, at):
    """state_results: {state: {"validVpdAreaM2", "vpdSummary", "weatherVersions"} or {"reason"}}.

    Denominator is Level C mappedCornAreaM2; VPD-missing area stays in it.
    """
    states = []
    for s in level_c["states"]:
        mapped = s.get("mappedCornAreaM2")
        result = state_results.get(s["state"]) or {"reason": "vpd_not_attempted"}
        valid = result.get("validVpdAreaM2", 0.) if "reason" not in result else 0.
        ok = "reason" not in result and valid > 0
        states.append({"state": s["state"], "status": "ok" if ok else "unavailable", "mappedCornAreaM2": mapped,
                       "validVpdAreaM2": valid if ok else 0.,
                       "missingAreaM2": None if mapped is None else max(0., mapped - (valid if ok else 0.)),
                       "coverage": None if not mapped else (valid if ok else 0.) / mapped,
                       "vpdSummary": result["vpdSummary"] if ok else {k: None for k in VPD_METRICS},
                       "weatherVersions": result.get("weatherVersions"),
                       "reasons": [] if ok else [result.get("reason") or "weather_grid_incomplete"]})
    combined = level_c["combined"]
    known, mapped = combined.get("knownMappedCornAreaM2"), combined.get("mappedCornAreaM2")
    valid = sum(s["validVpdAreaM2"] for s in states)
    deterministic = {
        "schemaVersion": 1, "methodVersion": METHOD, "registryVersion": REGISTRY["registryVersion"],
        "rules": [RULE["ruleId"]], "parameters": dict(RULE["parameters"]), "threshold": None,
        "gridVersion": level_c["gridVersion"], "period": level_c["period"], "denominator": "mappedCornAreaM2",
        "localStageEligibility": "insufficient", "stageWeighting": "none; all mapped corn area regardless of stage",
        "baseArtifact": {"file": "corn-spatial.json", "methodVersion": level_c["methodVersion"], "analysisHash": level_c["analysisHash"]},
        "states": states,
        "combined": {"includedStates": [s["state"] for s in states if s["status"] == "ok"],
                     "unavailableStates": [s["state"] for s in states if s["status"] != "ok"],
                     "knownMappedCornAreaM2": known, "mappedCornAreaM2": mapped, "validVpdAreaM2": valid,
                     "coverage": valid / mapped if mapped else None, "scope": combined.get("scope"),
                     "vpdSummary": combined_summary},
    }
    return {**deterministic, "analysisHash": digest(deterministic), "generatedAt": at}
