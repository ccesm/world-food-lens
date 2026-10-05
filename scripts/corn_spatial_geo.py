"""Optional numerical IO. Same native-footprint weighting as Phase 4B-1.8."""
import json
import sys
from pathlib import Path

import netCDF4
import numpy as np
from scipy.sparse import load_npz

from corn_spatial import METRICS, VARIABLES, digest, validate_manifest
from data_contract import DataIssue

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "research/iowa_spatial"))
from spatial import load_weather, weighted_stats


def load_annual(directory):
    manifest, cells, coordinates = validate_manifest(directory)
    matrix = load_npz(Path(directory) / "overlap.npz")
    expected = np.array([c["cornAreaM2"] for c in cells])
    if (matrix.shape != (len(cells), len(coordinates["lat"]) * len(coordinates["lon"])) or
            np.any(~np.isfinite(matrix.data)) or np.any(matrix.data < 0)):
        raise DataIssue("Invalid crop/weather overlap matrix", "spatial_alignment_failed")
    support = np.asarray(matrix.sum(axis=1)).ravel()
    # Reference geometric tolerance only. Residual remains in missing-area output.
    if np.any(support > expected + np.maximum(.01, expected * 1e-9)):
        raise DataIssue("Crop/weather overlap is not area-conserving", "spatial_alignment_failed")
    # Uncovered area is permitted, NEVER scaled back to the mapped denominator.
    # In particular the frozen densified-footprint engine has tiny positive
    # residuals at some shared edges; the original 1.8 guard is upper-bound only.
    return manifest, coordinates, np.asarray(matrix.sum(axis=0)).ravel()


def read_weather(path, variable, expected, coordinates):
    """Missing dates stay NaN. Never silently choose another state-specific window."""
    with netCDF4.Dataset(path) as nc:
        day = nc.variables["day"]
        actual = [d.isoformat()[:10] for d in netCDF4.num2date(day[:], day.units, calendar=getattr(day, "calendar", "standard"))]
    if not actual or len(set(actual)) != len(actual) or actual != sorted(actual) or any(d not in expected for d in actual):
        raise DataIssue("Empty, duplicated, out-of-period weather dates", "weather_grid_incomplete")
    source = load_weather(path, variable, actual)
    if source["lat"].tolist() != coordinates["lat"] or source["lon"].tolist() != coordinates["lon"]:
        raise DataIssue("Weather geometry differs from annual crop grid", "spatial_alignment_failed")
    values = np.full((len(expected), len(coordinates["lat"]), len(coordinates["lon"])), np.nan)
    for i, d in enumerate(actual):
        values[expected.index(d)] = source["values"][i]
    source["metadata"]["expectedDates"] = expected
    source["metadata"]["missingDates"] = [d for d in expected if d not in actual]
    return values.reshape(len(expected), -1), source["metadata"]


def summarize(arrays, weights, period_dates):
    if set(arrays) != set(VARIABLES) or any(a.shape != (14, len(weights)) for a in arrays.values()):
        raise DataIssue("Incompatible weather arrays", "spatial_alignment_failed")
    pair = np.isfinite(arrays["tmmn"]) & np.isfinite(arrays["tmmx"])
    if np.any(arrays["tmmn"][pair] > arrays["tmmx"][pair]):
        raise DataIssue("Tmin exceeds Tmax")
    eligible = np.logical_and.reduce([np.all(np.isfinite(v), axis=0) for v in arrays.values()])
    values = {"tmaxDailyMeanC": np.mean(arrays["tmmx"], axis=0), "tmaxPeriodMaximumC": np.max(arrays["tmmx"], axis=0),
              "tminDailyMeanC": np.mean(arrays["tmmn"], axis=0), "tminPeriodMinimumC": np.min(arrays["tmmn"], axis=0),
              "precipitation14DayMm": np.sum(arrays["pr"], axis=0)}
    joint_weights = weights * eligible
    summary = {k: weighted_stats(v, joint_weights) for k, v in values.items()}
    coverage = {"missingWeatherCellsWithCorn": int(np.count_nonzero(~eligible & (weights > 0))),
                "missingValueDates": {k: [d for i, d in enumerate(period_dates) if np.any(~np.isfinite(v[i]) & (weights > 0))]
                                      for k, v in arrays.items()},
                "variableCoveredAreaM2": {k: float(weights[np.all(np.isfinite(v), axis=0)].sum()) for k, v in arrays.items()}}
    return summary, coverage, float(joint_weights.sum()), values, joint_weights


def point_comparison(state, coords, values, weights, summary, level_a, period_dates):
    r, c = int(np.argmin(abs(np.array(coords["lat"]) - state["lat"]))), int(np.argmin(abs(np.array(coords["lon"]) - state["lon"])))
    index = r * len(coords["lon"]) + c
    if abs(coords["lat"][r] - state["lat"]) > 1 / 48 or abs(coords["lon"][c] - state["lon"]) > 1 / 48:
        raise DataIssue("Representative coordinate outside grid", "spatial_alignment_failed")
    # Eligibility is based on weather, not whether this point contains corn.
    point = {k: float(v[index]) if np.isfinite(v[index]) else None for k, v in values.items()}
    days = [d for d in (level_a or {}).get("days", []) if d.get("date") in period_dates]
    power = None
    if [d["date"] for d in days] == period_dates and all(
            isinstance(d.get(k), (int, float)) and np.isfinite(d[k]) for d in days for k in ("min", "max", "rain")):
        power = {"tmaxDailyMeanC": sum(d["max"] for d in days) / 14, "tmaxPeriodMaximumC": max(d["max"] for d in days),
                 "tminDailyMeanC": sum(d["min"] for d in days) / 14, "tminPeriodMinimumC": min(d["min"] for d in days),
                 "precipitation14DayMm": sum(d["rain"] for d in days)}
    return {"coordinate": {"lat": state["lat"], "lon": state["lon"]}, "sameProviderGridmetPoint": point,
            "pointMinusAreaMean": {k: point[k] - summary[k]["mean"] if point[k] is not None and summary[k] else None for k in METRICS},
            "powerUtcReference": power, "powerContentHash": (level_a or {}).get("metadata", {}).get("version", {}).get("contentHash"),
            "caveat": "gridMET nominal 07UTC day; POWER UTC. Sampling and provider/time differences are distinct; no pass/fail threshold."}
