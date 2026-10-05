"""Iowa-only offline spatial proof; retained live methods/data remain untouched."""
import argparse
import json
import math
import resource
import sys
import time
from importlib.metadata import version
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS
from rasterio.windows import Window
from scipy.sparse import csr_matrix, save_npz
from shapely import STRtree
from shapely.geometry import box, shape
from shapely.ops import transform as transform_geometry
from pyproj import Transformer

from collect import ROOT, external_cache, source_requests
from spatial import (SpatialIssue, crop_masks, days_between, denominators, demonstration_screen,
                     digest, file_hash, load_weather, polygon_mask_area, validate_cdl,
                     weather_footprint, weighted_stats)


def build_overlap(cdl_path, weather, grid, boundary, cache, progress_every=200):
    """Sparse (common reporting cell × native weather cell) corn-area weights."""
    lat, lon = weather["lat"], weather["lon"]
    polygons = [weather_footprint(y, x, segments=grid["edgeSegments"]) for y in lat for x in lon]
    tree = STRtree(polygons)
    rows, cols, weights, cells = [], [], [], []
    with rasterio.open(cdl_path) as source:
        validate_cdl(source, grid)
        block = grid["cellSizeM"] // 30
        if block * 30 != grid["cellSizeM"]:
            raise SpatialIssue("spatial_eligibility_failure", "Reporting grid must align with categorical pixels")
        metadata = {"crs": "EPSG:5070", "nativeCrsWkt": source.crs.to_wkt(),
                    "nativeResolutionM": 30, "width": source.width, "height": source.height,
                    "bounds": list(source.bounds), "transform": list(source.transform)[:6],
                    "nodataTag": source.nodata, "backgroundCode": 0, "cornClass": 1,
                    "cropYear": 2015, "publishedAt": None, "contentHash": file_hash(cdl_path)}
        for row in range(math.ceil(source.height / block)):
            for col in range(math.ceil(source.width / block)):
                window = Window(col * block, row * block, min(block, source.width-col*block),
                                min(block, source.height-row*block))
                values = source.read(1, window=window)
                pixel_transform = source.window_transform(window)
                corn, valid = crop_masks(values, source.nodata)
                left, top = pixel_transform.c, pixel_transform.f
                full_cell = box(left, top-grid["cellSizeM"], left+grid["cellSizeM"], top)
                footprint = full_cell.intersection(boundary)
                corn_area = float(corn.sum() * 900)
                index = len(cells)
                # The state-supplied categorical mask defines crop geography.
                # Generalized Census geometry audits padding/gaps, not a second
                # crop definition that would discard valid boundary corn pixels.
                zero_inside = polygon_mask_area(~valid, pixel_transform, footprint) if not footprint.is_empty else 0.0
                cell = {"gridCellId": f"US-IA-2015-9km-r{row:02d}-c{col:02d}", "row": row, "col": col,
                        "areaM2": float(grid["cellSizeM"] ** 2), "cornAreaM2": corn_area,
                        "cornFraction": corn_area / grid["cellSizeM"] ** 2,
                        "validCropDataAreaM2": float(valid.sum()*900),
                        "validCropDataCoverage": float(valid.sum()*900) / grid["cellSizeM"] ** 2,
                        "census2015StateFootprintM2": footprint.area,
                        "unclassifiedInsideGeneralizedBoundaryM2": zero_inside}
                cells.append(cell)
                if corn_area:
                    for weather_index in sorted(tree.query(full_cell)):
                        polygon = polygons[weather_index].intersection(full_cell)
                        overlap = polygon_mask_area(corn, pixel_transform, polygon)
                        if overlap > 0:
                            rows.append(index)
                            cols.append(int(weather_index))
                            weights.append(overlap)
                if len(cells) % progress_every == 0:
                    print(f"intersected {len(cells)} common cells", flush=True)
    matrix = csr_matrix((weights, (rows, cols)), shape=(len(cells), len(polygons)))
    target = np.array([cell["cornAreaM2"] for cell in cells])
    supported = np.asarray(matrix.sum(axis=1)).ravel()
    if np.any(supported > target + np.maximum(0.01, target * 1e-9)):
        raise SpatialIssue("spatial_eligibility_failure", "Overlapping weather footprints inflated crop area")
    metadata["areaConservationResidualM2"] = float(target.sum()-supported.sum())
    metadata["maximumCellConservationResidualM2"] = float(np.max(np.abs(target-supported)))
    save_npz(cache / "overlap.npz", matrix)
    return cells, matrix, metadata


def summarize(cells, matrix, weather, config, crop_metadata, power):
    flattened = {key: value["values"].reshape(14, -1) for key, value in weather.items()}
    eligible = np.logical_and.reduce([np.all(np.isfinite(v), axis=0) for v in flattened.values()])
    finite_pair = np.isfinite(flattened["tmmx"]) & np.isfinite(flattened["tmmn"])
    if np.any(flattened["tmmn"][finite_pair] > flattened["tmmx"][finite_pair]):
        raise SpatialIssue("invalid_raster", "Tmin exceeds Tmax")
    _, screen = demonstration_screen(flattened["tmmx"], config["screen"])
    native_weights = np.asarray(matrix.sum(axis=0)).ravel()
    mapped = float(sum(cell["cornAreaM2"] for cell in cells))
    joint = float(np.sum(native_weights[eligible]))
    screened = float(np.sum(native_weights[eligible & screen]))
    # Round sub-mm² accumulation noise only, not missing coverage or fractions.
    measures = denominators(round(mapped, 3), round(joint, 3), round(screened, 3))
    metadata = {key: source["metadata"] for key, source in weather.items()}
    inputs = [{"datasetId": "research/usda-cdl/US-IA/2015", "contentHash": crop_metadata["contentHash"]}]
    inputs += [{"datasetId": "research/gridmet/" + key, "contentHash": source["contentHash"]} for key, source in metadata.items()]
    if crop_metadata.get("boundaryDiagnosticVersion"):
        inputs.append({"datasetId": "research/census/US-IA/2015-generalized-boundary", "contentHash": crop_metadata["boundaryDiagnosticVersion"]})
    provenance = {"methodVersion": config["methodVersion"], "gridVersion": config["grid"]["version"],
                  "inputs": inputs, "eligibility": measures["eligibility"],
                  "observationPeriod": {"start": config["start"], "end": config["end"]},
                  "localStageEligibility": "insufficient", "localStageReason": "no_stage_resolved_spatial_observation",
                  "availability": "retrospective-post-season-mask; original-publication-availability-unverified"}
    max_period = np.max(flattened["tmmx"], axis=0)
    min_period = np.min(flattened["tmmn"], axis=0)
    rain_period = np.sum(flattened["pr"], axis=0)
    lat, lon = weather["tmmx"]["lat"], weather["tmmx"]["lon"]
    py, px = config["point"]["latitude"], config["point"]["longitude"]
    ir, ic = int(np.argmin(abs(lat-py))), int(np.argmin(abs(lon-px)))
    if abs(lat[ir]-py) > 1/48 or abs(lon[ic]-px) > 1/48:
        raise SpatialIssue("spatial_eligibility_failure", "Representative point outside native weather subset")
    point_index = ir*len(lon)+ic
    point = {"requested": config["point"], "gridmetNativeCellCentre": {"latitude": float(lat[ir]), "longitude": float(lon[ic])},
             "gridmetTmaxMaxC": float(max_period[point_index]) if eligible[point_index] else None,
             "gridmetTminMinC": float(min_period[point_index]) if eligible[point_index] else None,
             "gridmetRainTotalMm": float(rain_period[point_index]) if eligible[point_index] else None,
             "gridmetDemonstrationFlag": bool(screen[point_index]) if eligible[point_index] else None,
             "powerUtcReference": power,
             "providerComparisonCaveat": "POWER UTC days differ from gridMET days ending approximately 07UTC next day; provider differences are not spatial effects."}
    daily = []
    for day_index, day in enumerate(days_between(config["start"], config["end"])):
        valid_day = np.logical_and.reduce([np.isfinite(v[day_index]) for v in flattened.values()])
        day_weights = native_weights * valid_day
        daily.append({"date": day, "jointCoveredCornM2": float(day_weights.sum()),
                      "tmaxC": weighted_stats(flattened["tmmx"][day_index], day_weights),
                      "tminC": weighted_stats(flattened["tmmn"][day_index], day_weights),
                      "rainMm": weighted_stats(flattened["pr"][day_index], day_weights)})
    covered_by_common = matrix @ eligible.astype(float)
    screen_by_common = matrix @ (eligible & screen).astype(float)
    rain_common = matrix @ np.where(eligible, rain_period, 0)
    max_common = matrix @ np.where(eligible, max_period, 0)
    min_common = matrix @ np.where(eligible, min_period, 0)
    for i, cell in enumerate(cells):
        cell.update({"validWeatherCornAreaM2": float(covered_by_common[i]),
                     "weatherCoverageOfMappedCorn": float(covered_by_common[i]/cell["cornAreaM2"]) if cell["cornAreaM2"] else None,
                     "screenOverlapCornM2": float(screen_by_common[i]) if covered_by_common[i] else None,
                     "rain14DayCornAreaMeanMm": float(rain_common[i]/covered_by_common[i]) if covered_by_common[i] else None,
                     "periodMaximumTmaxCornAreaMeanC": float(max_common[i]/covered_by_common[i]) if covered_by_common[i] else None,
                     "periodMinimumTminCornAreaMeanC": float(min_common[i]/covered_by_common[i]) if covered_by_common[i] else None,
                     "eligibility": denominators(round(cell["cornAreaM2"], 3), round(float(covered_by_common[i]), 3),
                                                 round(float(screen_by_common[i]), 3))["eligibility"],
                     "inputVersions": inputs, "methodVersion": config["methodVersion"]})
    stats = {"nativeSupportPeriodMaxTmaxC": weighted_stats(max_period, native_weights * eligible),
             "nativeSupportPeriodMinTminC": weighted_stats(min_period, native_weights * eligible),
             "nativeSupport14DayRainMm": weighted_stats(rain_period, native_weights * eligible),
             "commonGrid14DayRainMeansMm": weighted_stats(np.array([cell["rain14DayCornAreaMeanMm"]
                                                        if cell["rain14DayCornAreaMeanMm"] is not None else np.nan for cell in cells]),
                                                        np.asarray(covered_by_common))}
    reference = config["acreageReference"]
    acres = mapped / 4046.8564224
    summary = {"schemaVersion": 1, "scope": {k: config[k] for k in ("geography", "crop", "cropYear", "start", "end", "selection")},
               "grid": config["grid"], "cropSource": crop_metadata, "weatherSources": metadata,
               "screen": config["screen"], "denominators": measures, "provenance": provenance,
               "diagnostics": {"commonGridCells": len(cells), "cornContainingCells": sum(c["cornAreaM2"] > 0 for c in cells),
                               "nativeWeatherCellsWithCorn": int(np.count_nonzero(native_weights)),
                               "nonzeroIntersectionWeights": matrix.nnz,
                               "mappedCornAcres": acres,
                               "classifiedDataM2": sum(c["validCropDataAreaM2"] for c in cells),
                               "unclassifiedInsideGeneralizedBoundaryM2": sum(c["unclassifiedInsideGeneralizedBoundaryM2"] for c in cells),
                               "variableFullWindowCoverage": {key: float(native_weights[np.all(np.isfinite(value),axis=0)].sum()/mapped)
                                                              if mapped else None for key,value in flattened.items()}, **stats},
               "daily": daily, "representativePoint": point,
               "areaValidation": {**reference, "mappedCornAcres": acres,
                                  "differenceAcres": acres-reference["acres"], "relativeDifference": acres/reference["acres"]-1,
                                  "calibrationApplied": False},
               "interpretation": {"en": "Crop-area weather-screen overlap, not affected acreage, physiological stress or yield loss.",
                                  "zh": "玉米制图面积与天气筛查条件的空间交叠；非受灾面积、生理胁迫或减产。"}}
    summary["analysisHash"] = digest(summary)
    return summary


def run(cache, output):
    config = json.loads(Path(__file__).with_name("config.json").read_text())
    started = time.perf_counter()
    dates = days_between(config["start"], config["end"])
    for filename, _, _ in source_requests(config):
        if not (cache/filename).is_file():
            raise SpatialIssue("retrieval_failure", f"Missing offline input: {filename}", invalid_format=True)
    weather = {key: load_weather(cache/(key+".nc"), variable, dates) for key, variable in
               (("tmmx", "air_temperature"), ("tmmn", "air_temperature"), ("pr", "precipitation_amount"))}
    requests = {filename: url for filename, url, _ in source_requests(config)}
    for key, source in weather.items():
        source["metadata"].update({"provider": "University of Idaho gridMET", "downloadUrl": requests[key+".nc"],
                                   "sourceUrl": "https://www.climatologylab.org/gridmet.html",
                                   "observationIntervalStart": config["start"]+"T07:00:00Z",
                                   "observationIntervalEnd": "2015-07-15T07:00:00Z",
                                   "intervalQualification": "Approximate provider calendar days; source note5 retained"})
    for source in weather.values():
        if not np.array_equal(source["lat"], weather["tmmx"]["lat"]) or not np.array_equal(source["lon"], weather["tmmx"]["lon"]):
            raise SpatialIssue("projection_mismatch", "Weather grids must match; do not overlay by shape alone")
    boundary_json = json.loads((cache/"iowa-boundary.geojson").read_text())
    if len(boundary_json["features"]) != 1 or boundary_json["features"][0]["properties"]["GEOID"] != "19":
        raise SpatialIssue("spatial_eligibility_failure", "Expected one Iowa boundary")
    boundary = transform_geometry(Transformer.from_crs(4326, 5070, always_xy=True).transform,
                                  shape(boundary_json["features"][0]["geometry"]))
    if not boundary.is_valid:
        raise SpatialIssue("invalid_raster", "Invalid boundary geometry")
    cells, matrix, metadata = build_overlap(cache/"CDL_2015_19.tif", weather["tmmx"], config["grid"], boundary, cache)
    metadata["boundaryDiagnosticVersion"] = file_hash(cache/"iowa-boundary.geojson")
    metadata.update(config["cropSource"])
    reference_file = ROOT/"research/corn-history-inputs.json"
    point_source = json.loads(reference_file.read_text())["weather"]["IA"]
    point_days = [day for day in point_source["days"] if day["date"] in dates]
    if [day["date"] for day in point_days] != dates or any(day.get(key) is None for day in point_days for key in ("max", "min", "rain")):
        power = {"eligibility": "insufficient", "reason": "missing_date_or_value"}
    else:
        _, flag = demonstration_screen(np.array([day["max"] for day in point_days])[:, None], config["screen"])
        power = {"tmaxMaxC": max(day["max"] for day in point_days), "tminMinC": min(day["min"] for day in point_days),
                 "rainTotalMm": sum(day["rain"] for day in point_days), "demonstrationFlag": bool(flag[0]),
                 "inputHash": file_hash(reference_file), "acceptedSourceHash": point_source["rawHash"], "url": point_source["url"]}
    result = summarize(cells, matrix, weather, config, metadata, power)
    # Source-code identity includes all executable and configuration inputs.
    result["implementation"] = {path.name: file_hash(path) for path in sorted(Path(__file__).parent.iterdir())
                                if path.suffix in (".py", ".json", ".txt") and not path.name.startswith("test_")}
    result["runtimeVersions"] = {name: version(name) for name in ("numpy", "rasterio", "pyproj", "shapely", "scipy", "netCDF4", "affine")}
    result["runtimeVersions"].update({"gdal": rasterio.__gdal_version__, "python": sys.version.split()[0]})
    result["analysisHash"] = digest({k:v for k,v in result.items() if k != "analysisHash"})
    (cache/"cells.json").write_text(json.dumps(cells, sort_keys=True, allow_nan=False, separators=(",", ":"))+"\n")
    # All validation completes before replacing an accepted offline summary.
    temporary = output.with_suffix(".json.part")
    temporary.write_text(json.dumps(result, sort_keys=True, indent=2, allow_nan=False)+"\n")
    temporary.replace(output)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    metrics = {"processingSeconds": time.perf_counter()-started,
               "peakResidentBytes": peak if sys.platform == "darwin" else peak*1024,
               "scratchDataBytesExcludingVenv": sum(p.stat().st_size for p in cache.iterdir() if p.is_file()),
               "summaryBytes": output.stat().st_size, "analysisHash": result["analysisHash"]}
    (cache/"performance.json").write_text(json.dumps(metrics, indent=2)+"\n")
    print(json.dumps({"denominators": result["denominators"], "diagnostics": result["diagnostics"],
                      "representativePoint": result["representativePoint"], "performance": metrics}, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if output.parent != ROOT/"research" or output.suffix != ".json":
        parser.error("Compact offline summaries must be direct research/*.json outputs, not production assets")
    try:
        run(external_cache(args.cache), output)
    except SpatialIssue as error:
        print(json.dumps({"status": "failed", "reason": error.reason, "detail": error.detail,
                          "format": error.format_state, "message": str(error), "acceptedSummary": "retained"}), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({"status": "failed", "reason": "invalid_format", "detail": "invalid_offline_input",
                          "message": str(error), "acceptedSummary": "retained"}), file=sys.stderr)
        sys.exit(1)
