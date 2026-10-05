"""Offline, state-isolated ten-state scaling validation. No new hazard logic."""
import argparse
import json
import math
import re
import resource
import subprocess
import sys
import time
from importlib.metadata import version
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform as transform_geometry

from acquire import CONFIG, ROOT, STATES, cache_root, metadata, write_json
from geometry import annual_overlap
from spatial import SpatialIssue, days_between, digest, file_hash, load_weather, weighted_stats

METRICS = ("tmaxDailyMeanC","tmaxPeriodMaximumC","tminDailyMeanC","tminPeriodMinimumC","precipitation14DayMm")


def acreage_reference(path):
    if not path.exists():
        return {s["id"]:None for s in STATES}
    text = path.read_bytes().decode("cp1252").replace("\r\n","\n")
    table = re.search(r"^Corn Area Planted for All Purposes and Harvested for Grain, Yield, and Production -\s*\n"
                      r"States and United States: 2013-2015\s*\n(.*?)(?=\nCorn Area)",text,re.M|re.S)
    if not table or "Area planted for all purposes" not in table[1] or "1,000 acres" not in table[1] or not re.search(
            r":\s*2013\s*:\s*2014\s*:\s*2015\s*:\s*2013\s*:\s*2014\s*:\s*2015",table[1]):
        raise ValueError("Official acreage table/year/units changed")
    result = {}
    for state in STATES:
        rows = re.findall(r"^"+re.escape(state["name"]["en"])+r"\s*\.+:\s*(.*?)\s*$",table[1],re.M)
        if len(rows) != 1 or len(rows[0].split()) != 6:
            raise ValueError("Missing/ambiguous acreage state row")
        values = [float(v.replace(",",""))*1000 for v in rows[0].split()]
        if min(values) <= 0:
            raise ValueError("Invalid official acreage")
        result[state["id"]] = {"plantedAcres":values[2],"harvestedGrainAcres":values[5],"cropYear":2015,
                              "publicationDate":"2016-01-12","url":CONFIG["acreageUrl"],"rawHash":file_hash(path),
                              "comparisonBasis":"Planted all-purpose corn; harvested grain is separate context, not calibration"}
    return result


def weather_inputs(cache):
    dates = days_between(CONFIG["start"],CONFIG["end"])
    weather = {k:load_weather(cache/(k+".nc"),v,dates) for k,v in
               (("tmmx","air_temperature"),("tmmn","air_temperature"),("pr","precipitation_amount"))}
    for value in weather.values():
        if not np.array_equal(value["lat"],weather["tmmx"]["lat"]) or not np.array_equal(value["lon"],weather["tmmx"]["lon"]):
            raise SpatialIssue("projection_mismatch","Weather geometry mismatch")
    return weather


def distributions(weather,native_weights):
    arrays = {k:source["values"].reshape(14,-1) for k,source in weather.items()}
    eligible = np.logical_and.reduce([np.all(np.isfinite(v),axis=0) for v in arrays.values()])
    pair = np.isfinite(arrays["tmmn"]) & np.isfinite(arrays["tmmx"])
    if np.any(arrays["tmmn"][pair] > arrays["tmmx"][pair]):
        raise SpatialIssue("invalid_raster","Tmin exceeds Tmax")
    values = {"tmaxDailyMeanC":np.mean(arrays["tmmx"],axis=0),"tmaxPeriodMaximumC":np.max(arrays["tmmx"],axis=0),
              "tminDailyMeanC":np.mean(arrays["tmmn"],axis=0),"tminPeriodMinimumC":np.min(arrays["tmmn"],axis=0),
              "precipitation14DayMm":np.sum(arrays["pr"],axis=0)}
    stats = {metric:weighted_stats(value,native_weights*eligible) for metric,value in values.items()}
    coverage = {"jointValidAreaM2":float(native_weights[eligible].sum()),
                "missingWeatherCellsWithCorn":int(np.count_nonzero(~eligible & (native_weights>0))),
                "missingValueDates":{k:[day for i,day in enumerate(days_between(CONFIG["start"],CONFIG["end"]))
                                        if np.any((~np.isfinite(v[i])) & (native_weights>0))] for k,v in arrays.items()},
                "variableCoveredAreaM2":{k:float(native_weights[np.all(np.isfinite(v),axis=0)].sum()) for k,v in arrays.items()}}
    return values,eligible,stats,coverage


def point_comparison(state,weather,values,eligible,stats,power_source):
    lat,lon = weather["tmmx"]["lat"],weather["tmmx"]["lon"]
    r,c = int(np.argmin(abs(lat-state["lat"]))),int(np.argmin(abs(lon-state["lon"])))
    if abs(lat[r]-state["lat"]) > 1/48 or abs(lon[c]-state["lon"]) > 1/48:
        raise SpatialIssue("spatial_eligibility_failure","Representative point outside weather input")
    index = r*len(lon)+c
    point = {key:float(value[index]) if eligible[index] else None for key,value in values.items()}
    differences = {key:point[key]-stats[key]["mean"] if point[key] is not None and stats[key] else None for key in METRICS}
    normalized = {key:differences[key]/(stats[key]["p90"]-stats[key]["p10"]) if differences[key] is not None and
                  stats[key]["p90"] > stats[key]["p10"] else None for key in METRICS}
    days = [d for d in power_source.get("days",[]) if CONFIG["start"] <= d["date"] <= CONFIG["end"]]
    power = {"eligibility":"insufficient"}
    if [d["date"] for d in days] == days_between(CONFIG["start"],CONFIG["end"]) and all(
            isinstance(d.get(key),(int,float)) and math.isfinite(d[key]) for d in days for key in ("max","min","rain")):
        power = {"eligibility":"eligible","tmaxDailyMeanC":float(np.mean([d["max"] for d in days])),
                 "tmaxPeriodMaximumC":max(d["max"] for d in days),"tminDailyMeanC":float(np.mean([d["min"] for d in days])),
                 "tminPeriodMinimumC":min(d["min"] for d in days),"precipitation14DayMm":sum(d["rain"] for d in days),
                 "sourceHash":power_source.get("rawHash"),"url":power_source.get("url")}
    power_difference = {key:power[key]-stats[key]["mean"] if power.get("eligibility")=="eligible" and stats[key] else None for key in METRICS}
    return {"coordinate":{"lat":state["lat"],"lon":state["lon"]},
            "gridmetNativeCellCentre":{"lat":float(lat[r]),"lon":float(lon[c])},"gridmetPoint":point,
            "gridmetPointMinusAreaMean":differences,"differenceDividedBySpatialP10P90Range":normalized,
            "powerUtcReference":power,"powerUtcPointMinusAreaMean":power_difference,
            "caveat":"Same-provider comparison isolates sampling; POWER includes provider/support and UTC vs gridMET 07UTC day differences. No pass/fail threshold."}


def state_summary(state,cells,matrix,crop,weather,source,reference,power):
    weights = np.asarray(matrix.sum(axis=0)).ravel()
    values,eligible,stats,coverage = distributions(weather,weights)
    mapped = float(sum(cell["cornAreaM2"] for cell in cells))
    joint = coverage["jointValidAreaM2"]
    if mapped <= 0 or joint > mapped+max(.01,mapped*1e-9):
        raise SpatialIssue("spatial_eligibility_failure","Invalid crop/weather area")
    validation = None
    if reference:
        acres = mapped/4046.8564224
        difference = acres-reference["plantedAcres"]
        relative = difference/reference["plantedAcres"]
        validation = {**reference,"mappedCornAcres":acres,"differenceAcres":difference,"relativeDifference":relative,
                      "investigate":abs(relative)>CONFIG["diagnostics"]["largeAcreageDifferenceFraction"],"calibrationApplied":False}
    provenance = {"methodVersion":CONFIG["methodVersion"],"gridVersion":CONFIG["grid"]["version"],"cropYear":2015,
                  "observationPeriod":{"start":CONFIG["start"],"end":CONFIG["end"]},
                  "inputs":[{"datasetId":f"research/usda-cdl/US-{state['id']}/2015","contentHash":crop["contentHash"]}]+
                           [{"datasetId":f"research/gridmet/{key}/US-{state['id']}","contentHash":w["metadata"]["contentHash"]} for key,w in weather.items()],
                  "localStageEligibility":"insufficient","availability":"retrospective-post-season-map; original-time availability unverified",
                  "eligibility":"insufficient" if not joint else "partial" if joint < mapped-max(.01,mapped*1e-9) else "eligible"}
    result = {"state":state["id"],"stableId":"US-"+state["id"],"name":state["name"],"status":"ok",
              "mappedCornAreaM2":mapped,"validWeatherAreaM2":joint,"coverage":joint/mapped,"missingAreaM2":max(0.,mapped-joint),
              "coverageDiagnostics":coverage,"weatherSummary":stats,"pointComparison":point_comparison(state,weather,values,eligible,stats,power),
              "areaValidation":validation,"cropSource":{**source,**crop},"weatherSources":{k:v["metadata"] for k,v in weather.items()},
              "provenance":provenance}
    return result,values,weights*eligible


def process_state(root,state,force=False):
    cache = root/state["id"]
    started = time.perf_counter()
    for name in ("cdl.tif","boundary.geojson","crop-source.json","cdl-metadata.html","tmmx.nc","tmmn.nc","pr.nc"):
        if not (cache/name).is_file():
            raise SpatialIssue("retrieval_failure",f"Missing {state['id']}/{name}")
    weather = weather_inputs(cache)
    manifest = json.loads((cache/"acquisition.json").read_text())
    for key,value in weather.items():
        value["metadata"].update({"downloadUrl":manifest[key+".nc"]["url"],"sourceUrl":"https://www.climatologylab.org/gridmet.html"})
    boundary_data = json.loads((cache/"boundary.geojson").read_text())
    if len(boundary_data.get("features",[])) != 1 or boundary_data["features"][0]["properties"]["GEOID"] != CONFIG["fips"][state["id"]]:
        raise SpatialIssue("spatial_eligibility_failure","Boundary state identity mismatch")
    boundary = transform_geometry(Transformer.from_crs(4326,5070,always_xy=True).transform,shape(boundary_data["features"][0]["geometry"]))
    if not boundary.is_valid:
        raise SpatialIssue("spatial_eligibility_failure","Invalid boundary")
    t = time.perf_counter()
    cells,matrix,crop,annual = annual_overlap(cache,state,weather["tmmx"],CONFIG["grid"],boundary,force)
    geometry_seconds = time.perf_counter()-t
    expected_cdl = f"https://nassgeodata.gmu.edu/webservice/nass_data_cache/byfips/CDL_2015_{CONFIG['fips'][state['id']]}.tif"
    if manifest["cdl.tif"]["url"] != expected_cdl or manifest["cdl.tif"]["sha256"] != crop["contentHash"]:
        raise SpatialIssue("spatial_eligibility_failure","Crop input year/state/accepted bytes do not match")
    source = metadata((cache/"cdl-metadata.html").read_text(errors="replace"),state)
    source["downloadUrl"] = manifest["cdl.tif"]["url"]
    reference = acreage_reference(root/"acreage-2015.txt")[state["id"]]
    power = json.loads((ROOT/"research/corn-history-inputs.json").read_text())["weather"].get(state["id"],{})
    t = time.perf_counter()
    summary,values,weights = state_summary(state,cells,matrix,crop,weather,source,reference,power)
    summary["provenance"]["annualWeightVersion"] = annual["signatureHash"]
    summary["provenance"]["inputs"].extend([
        {"datasetId":f"research/census/US-{state['id']}/2015","contentHash":file_hash(cache/"boundary.geojson")},
        {"datasetId":f"research/cdl-metadata/US-{state['id']}/2015","contentHash":file_hash(cache/"cdl-metadata.html")}])
    summary["analysisHash"] = digest(summary)
    aggregation_seconds = time.perf_counter()-t
    write_json(cache/"state-summary.json",summary)
    np.savez_compressed(cache/"distribution.npz",weights=weights,**values)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    metrics = {"processingSeconds":time.perf_counter()-started,"geometrySeconds":geometry_seconds,"aggregationSeconds":aggregation_seconds,
               "peakResidentBytes":peak if sys.platform == "darwin" else peak*1024,"annualCache":annual,
               "inputBytes":sum(v.get("bytes",0) for v in manifest.values()),
               "freshDownloadedBytes":sum(v.get("bytes",0) for v in manifest.values() if not v.get("reuse")),
               "downloadSeconds":sum(v.get("downloadSeconds",0) for v in manifest.values() if not v.get("reuse")),
               "scratchBytes":sum(p.stat().st_size for p in cache.iterdir() if p.is_file()),"summaryBytes":(cache/"state-summary.json").stat().st_size}
    write_json(cache/"performance.json",metrics)
    print(f"{state['id']}: area {summary['mappedCornAreaM2']/1e10:.4f} Mha; coverage {summary['coverage']:.8%}; {metrics['processingSeconds']:.2f}s; {annual['state']}",flush=True)
    return summary


def aggregate(states,distributions_by_state):
    expected = [state["id"] for state in STATES]
    if [s["state"] for s in states] != expected:
        raise ValueError("Combined summary must retain all ten declared states in fixed order")
    successful = [s for s in states if s["status"] == "ok"]
    known = [s for s in states if s.get("mappedCornAreaM2") is not None]
    if any(not math.isfinite(s["mappedCornAreaM2"]) or s["mappedCornAreaM2"] < 0 for s in known):
        raise ValueError("Invalid state crop denominator")
    for state in successful:
        valid = state["validWeatherAreaM2"]
        mapped = state["mappedCornAreaM2"]
        if not math.isfinite(valid) or valid < 0 or valid > mapped+max(.01,mapped*1e-9):
            raise ValueError("Invalid state weather coverage")
        weights = distributions_by_state[state["state"]]["weights"]
        if np.any(~np.isfinite(weights)) or np.any(weights < 0) or abs(weights.sum()-valid) > max(.01,mapped*1e-9):
            raise ValueError("State distribution/coverage accounting mismatch")
    missing_geography = [s["state"] for s in states if s.get("mappedCornAreaM2") is None]
    mapped = float(sum(s["mappedCornAreaM2"] for s in known))
    valid = float(sum(s["validWeatherAreaM2"] for s in successful))
    overall = valid/mapped if mapped and not missing_geography else None
    stats = {}
    for metric in METRICS:
        arrays = [distributions_by_state[s["state"]][metric] for s in successful]
        weights = [distributions_by_state[s["state"]]["weights"] for s in successful]
        stats[metric] = weighted_stats(np.concatenate(arrays),np.concatenate(weights)) if arrays else None
    return {"label":{"en":"Ten-state Corn Belt mapped-corn summary","zh":"十州玉米带玉米制图面积汇总"},
            "methodVersion":CONFIG["methodVersion"],"analysisPeriod":{"start":CONFIG["start"],"end":CONFIG["end"]},
            "grid":CONFIG["grid"],"states":states,"contributingStates":[s["state"] for s in successful],
            "unavailableStates":[s["state"] for s in states if s["status"] != "ok"],
            "knownMappedCornAreaM2":mapped,"totalMappedCornAreaM2":None if missing_geography else mapped,
            "validWeatherAreaM2":valid,"coverage":overall,"missingGeographyStates":missing_geography,
            "knownDenominatorCoverage":valid/mapped if mapped else None,"weatherSummary":stats,
            "provenance":{"methodVersion":CONFIG["methodVersion"],"localStageEligibility":"insufficient",
                          "stateArtifacts":[{"state":s["state"],"analysisHash":s.get("analysisHash"),"status":s["status"]} for s in states]},
            "interpretation":{"en":"Mapped crop area and weather distribution only; not national US exposure, affected acreage, crop damage or yield loss.",
                              "zh":"仅为所选十州玉米制图面积与天气分布；不是美国全国暴露、受灾面积、作物损害或减产。"}}


def retained_static_area(cache):
    try:
        annual = json.loads((cache/"annual-manifest.json").read_text())
        if annual["signature"]["cropHash"] != file_hash(cache/"cdl.tif") or annual["signature"]["boundaryHash"] != file_hash(cache/"boundary.geojson"):
            return None
        if annual["signature"]["grid"] != CONFIG["grid"] or annual["signature"]["geometryCodeHash"] != file_hash(Path(__file__).with_name("geometry.py")):
            return None
        if annual["signature"]["referenceUtilityHash"] != file_hash(Path(__file__).resolve().parents[1]/"iowa_spatial/spatial.py"):
            return None
        for name,sha in annual["artifacts"].items():
            if file_hash(cache/name) != sha:
                return None
        cells = json.loads((cache/"annual-cells.json").read_text())
        area = float(sum(c["cornAreaM2"] for c in cells))
        return area if area > 0 and abs(area-annual["cropMetadata"]["cornAreaM2"]) < .01 else None
    except (OSError,KeyError,ValueError):
        return None


def unavailable_state(state,cache,error):
    area = retained_static_area(cache)
    annual = json.loads((cache/"annual-manifest.json").read_text()) if area is not None else None
    return {"state":state["id"],"stableId":"US-"+state["id"],"status":"unavailable","failure":error,
            "mappedCornAreaM2":area,"validWeatherAreaM2":None,"coverage":None,
            "provenance":{"methodVersion":CONFIG["methodVersion"],"gridVersion":CONFIG["grid"]["version"],
                          "observationPeriod":{"start":CONFIG["start"],"end":CONFIG["end"]},"eligibility":"insufficient",
                          "localStageEligibility":"insufficient","annualWeightVersion":digest(annual["signature"]) if annual else None,
                          "inputs":[{"datasetId":f"research/usda-cdl/US-{state['id']}/2015","contentHash":annual["signature"]["cropHash"]}] if annual else []}}


def orchestrate(root,output,force=False):
    started = time.perf_counter()
    outcomes,distributions_by_state,metrics = [],{},{}
    for state in STATES:
        command = [sys.executable,str(Path(__file__).resolve()),"--cache",str(root),"--state",state["id"]]
        if force:
            command.append("--rebuild")
        attempt = subprocess.run(command,check=False)
        cache = root/state["id"]
        if attempt.returncode == 0:
            summary = json.loads((cache/"state-summary.json").read_text())
            with np.load(cache/"distribution.npz") as arrays:
                distributions_by_state[state["id"]] = {k:arrays[k] for k in arrays.files}
            metrics[state["id"]] = json.loads((cache/"performance.json").read_text())
        else:
            error = json.loads((cache/"failure.json").read_text()) if (cache/"failure.json").exists() else {"reason":"processing_failed"}
            summary = unavailable_state(state,cache,error)
        outcomes.append(summary)
    combined = aggregate(outcomes,distributions_by_state)
    audit_path = root/"boundary-audit.json"
    audit = json.loads(audit_path.read_text()) if audit_path.exists() else None
    audit_verified = bool(audit and audit.get("sumSafe") and all(
        (root/s["id"]/"cdl.tif").exists() and audit["inputs"].get(s["id"])==file_hash(root/s["id"]/"cdl.tif") for s in STATES))
    combined["nativeMaskUnionVerified"] = audit_verified
    combined["boundaryAudit"] = {"artifactHash":file_hash(audit_path),"inputs":audit["inputs"],
                                 "pairwiseDuplicateCornAreaM2":audit["pairwiseDuplicateCornAreaM2"],
                                 "nativeAreaAudit":audit.get("nativeAreaAudit")} if audit else None
    if audit and not audit.get("sumSafe"):
        raise SpatialIssue("spatial_eligibility_failure","Overlapping state crop masks; combined artifact not replaced")
    if audit_verified and audit.get("nativeAreaAudit"):
        for state in outcomes:
            if state.get("mappedCornAreaM2") is not None and abs(state["mappedCornAreaM2"]-audit["nativeAreaAudit"][state["state"]]["cornClass1AreaM2"]) > .01:
                raise SpatialIssue("spatial_eligibility_failure","Native CDL count/common-grid area disagree; combined artifact not replaced")
    combined["implementation"] = {p.name:file_hash(p) for p in sorted(Path(__file__).parent.iterdir()) if p.suffix in (".py",".json") and not p.name.startswith("test_")}
    combined["runtimeVersions"] = {key:version(key) for key in ("numpy","rasterio","pyproj","shapely","scipy","netCDF4")}
    combined["analysisHash"] = digest(combined)
    write_json(output,combined)
    parent_peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    metrics["total"] = {"wallSeconds":time.perf_counter()-started,"peakChildResidentBytes":max((v["peakResidentBytes"] for v in metrics.values()),default=0),
                        "peakCoordinatorResidentBytes":parent_peak if sys.platform == "darwin" else parent_peak*1024,
                        "scratchBytes":sum(p.stat().st_size for p in root.rglob("*") if p.is_file()),"summaryBytes":output.stat().st_size}
    write_json(root/"performance-run.json",metrics)
    print(json.dumps({"analysisHash":combined["analysisHash"],"coverage":combined["coverage"],"missingStates":combined["unavailableStates"],"performance":metrics["total"]}),flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache",required=True)
    parser.add_argument("--output")
    parser.add_argument("--state",choices=[s["id"] for s in STATES])
    parser.add_argument("--rebuild",action="store_true")
    args = parser.parse_args()
    root = cache_root(args.cache)
    if args.state:
        cache = root/args.state
        cache.mkdir(exist_ok=True)
        try:
            process_state(root,next(s for s in STATES if s["id"]==args.state),args.rebuild)
        except (SpatialIssue,OSError,ValueError,KeyError) as error:
            write_json(cache/"failure.json",{"reason":getattr(error,"reason","invalid_format"),"detail":getattr(error,"detail","invalid_input"),"message":str(error)})
            print(f"{args.state}: unavailable: {error}",file=sys.stderr)
            sys.exit(1)
    else:
        output = Path(args.output).resolve() if args.output else None
        if not output or output.parent != ROOT/"research" or output.suffix != ".json":
            parser.error("Output must be a compact research/*.json file")
        orchestrate(root,output,args.rebuild)
