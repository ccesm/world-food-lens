"""Phase 4B-2.1 informational heat screens over Level C mapped corn area.

Definitions: docs/PHASE4B2_0_METHOD_SPEC.md §C. Rule parameters, output names
and review status come from src/data/evidenceRegistry.json, never from code.
The scalar functions are stdlib-only reference implementations; the array
functions import numpy lazily and are used only by the spatial runtime.
Nothing here evaluates alerts or sends notifications.
"""
import json
import math
from pathlib import Path

from corn_spatial import digest

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / "src/data/evidenceRegistry.json").read_text())
EDD_RULE = REGISTRY["rules"]["heat_extreme_degree_days"]
HOT_RULE = REGISTRY["rules"]["hot_day_tmax35"]
METHOD = EDD_RULE["methodologyVersion"]
if HOT_RULE["methodologyVersion"] != METHOD:
    raise RuntimeError("Heat-screen rules must share one methodology version")
BASES = tuple(EDD_RULE["parameters"]["baseC"])
EDD_OUTPUTS = {base: next(k for k in EDD_RULE["outputs"] if f"edd{base}" in k) for base in BASES}
THRESHOLD = HOT_RULE["parameters"]["thresholdC"]
COUNT_OUTPUT, RUN_OUTPUT = (next(k for k in HOT_RULE["outputs"] if k.endswith(suffix)) for suffix in ("Count", "LongestRun"))
HEAT_METRICS = tuple(EDD_OUTPUTS.values()) + (COUNT_OUTPUT, RUN_OUTPUT)
APPROXIMATION = "single-sine diurnal reconstruction from gridMET daily tmmn/tmmx (not hourly integration)"


def edd_day(tmin, tmax, base):
    """Degree-days above base for one day (°C·day), single-sine approximation."""
    if not (math.isfinite(tmin) and math.isfinite(tmax)) or tmin > tmax:
        raise ValueError("Daily extremes must be finite with tmin <= tmax")
    if tmax <= base:
        return 0.
    mean, amplitude = (tmax + tmin) / 2, (tmax - tmin) / 2
    if tmin >= base:
        return mean - base
    theta = math.asin((base - mean) / amplitude)
    return ((mean - base) * (math.pi / 2 - theta) + amplitude * math.cos(theta)) / math.pi


def hot_day_stats(tmax_series, threshold=THRESHOLD):
    """(count, longest consecutive run) of days with Tmax >= threshold."""
    count = run = longest = 0
    for value in tmax_series:
        if not math.isfinite(value):
            raise ValueError("Hot-day screen requires complete daily Tmax")
        run = run + 1 if value >= threshold else 0
        count += value >= threshold
        longest = max(longest, run)
    return count, longest


def edd_array(tmin, tmax, base):
    """Vectorized edd_day. Any non-finite input yields NaN, never zero."""
    import numpy as np
    tmin, tmax = np.asarray(tmin, dtype=float), np.asarray(tmax, dtype=float)
    finite = np.isfinite(tmin) & np.isfinite(tmax)
    mean, amplitude = (tmax + tmin) / 2, (tmax - tmin) / 2
    out = np.zeros(np.broadcast(tmin, tmax).shape)
    above = finite & (tmin >= base)
    out[above] = (mean - base)[above]
    partial = finite & (tmax > base) & (tmin < base)
    with np.errstate(invalid="ignore", divide="ignore"):
        theta = np.arcsin(np.clip((base - mean) / amplitude, -1., 1.))
    out[partial] = (((mean - base) * (np.pi / 2 - theta) + amplitude * np.cos(theta)) / np.pi)[partial]
    out[~finite] = np.nan
    return out


def heat_cell_values(tmmn, tmmx):
    """Per-cell window metrics from (days, cells) arrays; incomplete cells are NaN."""
    import numpy as np
    tmmn, tmmx = np.asarray(tmmn, dtype=float), np.asarray(tmmx, dtype=float)
    complete = np.all(np.isfinite(tmmn) & np.isfinite(tmmx), axis=0)
    values = {EDD_OUTPUTS[b]: np.where(complete, np.sum(edd_array(tmmn, tmmx, b), axis=0), np.nan) for b in BASES}
    hot = np.where(np.isfinite(tmmx), tmmx >= THRESHOLD, False)
    run = longest = np.zeros(hot.shape[1])
    for day in hot:
        run = np.where(day, run + 1, 0)
        longest = np.maximum(longest, run)
    values[COUNT_OUTPUT] = np.where(complete, hot.sum(axis=0).astype(float), np.nan)
    values[RUN_OUTPUT] = np.where(complete, longest, np.nan)
    return values


def summarize_heat(distributions):
    """Area-weighted summary over one or more (values, weights) cell sets."""
    from corn_spatial_geo import weighted_stats
    import numpy as np
    if not distributions:
        return {k: None for k in HEAT_METRICS}
    weights = np.concatenate([d[1] for d in distributions])
    return {k: weighted_stats(np.concatenate([d[0][k] for d in distributions]), weights) for k in HEAT_METRICS}


def build_artifact(level_c, state_summaries, combined_summary, at):
    """Separately versioned artifact bound to the Level C output it was computed with.

    Coverage is Level C's joint eligibility by construction, so area fields are
    copied from that artifact rather than recomputed.
    """
    states = []
    for s in level_c["states"]:
        summary = state_summaries.get(s["state"])
        ok = s["status"] == "ok" and summary is not None and any(v is not None for v in summary.values())
        states.append({"state": s["state"], "status": "ok" if ok else "unavailable",
                       "mappedCornAreaM2": s.get("mappedCornAreaM2"), "validWeatherAreaM2": s["validWeatherAreaM2"] if ok else 0.,
                       "coverage": s.get("coverage") if ok else (0. if s.get("mappedCornAreaM2") else None),
                       "heatSummary": summary if ok else {k: None for k in HEAT_METRICS},
                       "reasons": [] if ok else (s.get("reasons") or ["heat_screen_unavailable"])})
    combined = level_c["combined"]
    # Recompute from heat-usable states: a state Level C kept but the heat
    # screen could not evaluate leaves the denominator as unmeasured area.
    valid = sum(s["validWeatherAreaM2"] for s in states if s["status"] == "ok")
    known, mapped = combined.get("knownMappedCornAreaM2"), combined.get("mappedCornAreaM2")
    deterministic = {
        "schemaVersion": 1, "methodVersion": METHOD, "registryVersion": REGISTRY["registryVersion"],
        "rules": [EDD_RULE["ruleId"], HOT_RULE["ruleId"]],
        "parameters": {"eddBaseC": list(BASES), "hotDayThresholdC": THRESHOLD},
        "approximation": APPROXIMATION, "gridVersion": level_c["gridVersion"], "period": level_c["period"],
        "localStageEligibility": "insufficient", "stageWeighting": "none; all mapped corn area regardless of stage",
        "baseArtifact": {"file": "corn-spatial.json", "methodVersion": level_c["methodVersion"], "analysisHash": level_c["analysisHash"]},
        "states": states,
        "combined": {"includedStates": [s["state"] for s in states if s["status"] == "ok"],
                     "unavailableStates": [s["state"] for s in states if s["status"] != "ok"],
                     "knownMappedCornAreaM2": known, "mappedCornAreaM2": mapped, "validWeatherAreaM2": valid,
                     "coverage": valid / mapped if mapped else None,
                     "scope": combined.get("scope"), "heatSummary": combined_summary},
    }
    return {**deterministic, "analysisHash": digest(deterministic), "generatedAt": at}
