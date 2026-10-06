#!/usr/bin/env python3
"""Manual annual preprocessing. Never downloads rasters into Git/Pages.

The frozen 1.8 intersection engine is reused without modifying its mathematics
or research artifacts. Its fixed-2015 labels are NOT treated as source identity:
production labels/vintages below are bound to verified official inputs.
Native 10m/HCDL/resampled categorical inputs are deliberately not accepted yet.
"""
import argparse
import concurrent.futures
import json
import re
import sys
import time
import resource
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs

from corn_spatial import (ANNUAL_METHOD, CONFIG, GRID, STATES, annual_identity, digest,
                          external_cache, file_hash, validate_manifest, write_json)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "research/cornbelt_spatial"))
from acquire import fetch


def area_reference(raw, state, year, mapped):
    path = raw / f"acreage-{year}.txt"
    if not path.exists():
        return None
    text = path.read_bytes().decode("cp1252").replace("\r\n", "\n")
    table = re.search(r"^Corn Area Planted for All Purposes and Harvested for Grain, Yield, and Production -\s*\n"
                      rf"States and United States: {year-2}-{year}\s*\n(.*?)(?=\nCorn Area)", text, re.M | re.S)
    if not table or "Area planted for all purposes" not in table[1] or "1,000 acres" not in table[1]:
        return None
    rows = re.findall(r"^" + re.escape(state["name"]["en"]) + r"\s*\.+:\s*(.*?)\s*$", table[1], re.M)
    if len(rows) != 1 or len(rows[0].split()) != 6:
        return None
    values = [float(v.replace(",", "")) * 1000 for v in rows[0].split()]
    if min(values) <= 0:
        return None
    release = re.search(r"Released January (\d+), (\d{4})", text)
    source = json.loads((raw / "acquisition.json").read_text())[path.name]
    acres = mapped / 4046.8564224
    relative = (acres - values[2]) / values[2]
    return {"cropYear": year, "plantedAcres": values[2], "harvestedGrainAcres": values[5], "mappedCornAcres": acres,
            "differenceAcres": acres-values[2], "relativeDifference": relative, "investigate": abs(relative) > .1,
            "calibrationApplied": False, "url": source["url"], "rawHash": file_hash(path),
            "publicationDate": f"{release[2]}-01-{int(release[1]):02d}" if release else None,
            "comparisonBasis": "Planted all-purpose corn; grain-harvested acreage separate. No calibration."}


def acquire_state(raw, state, year):
    import rasterio
    from rasterio.warp import transform_bounds
    fips = CONFIG["fips"][state["id"]]
    directory = raw / state["id"]
    directory.mkdir(exist_ok=True)
    fetch(directory, "cdl.tif", f"https://nassgeodata.gmu.edu/webservice/nass_data_cache/byfips/CDL_{year}_{fips}.tif", 700_000_000)
    boundary = "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2015/State_County/MapServer/7/query?" + urlencode(
        {"where": f"STATE='{fips}'", "outFields": "GEOID,NAME", "outSR": 4326, "f": "geojson"})
    fetch(directory, "boundary.geojson", boundary, 3_000_000)
    url = f"https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_{state['id'].lower()}{str(year)[2:]}.htm"
    fetch(directory, "cdl-metadata.html", url, 2_000_000)
    with rasterio.open(directory / "cdl.tif") as source:
        from spatial import validate_cdl
        validate_cdl(source, {"originX": source.transform.c, "originY": source.transform.f})
        west, south, east, north = transform_bounds(source.crs, 4326, *source.bounds, densify_pts=21)
    bounds = {"north": round(max(north, state["lat"]) + .09, 6), "south": round(min(south, state["lat"]) - .09, 6),
              "west": round(min(west, state["lon"]) - .09, 6), "east": round(max(east, state["lon"]) + .09, 6)}
    params = {"var": "air_temperature", **bounds, "time_start": f"{year}-07-01T00:00:00Z",
              "time_end": f"{year}-07-01T00:00:00Z", "accept": "netcdf"}
    fetch(directory, "template.nc", f"https://thredds.northwestknowledge.net/thredds/ncss/MET/tmmx/tmmx_{year}.nc?" + urlencode(params), 5_000_000)
    write_json(directory / "request-bounds.json", bounds)


def prepare_state(raw, output, state, year, force=False):
    import numpy as np
    from scipy.sparse import save_npz
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform
    from geometry import annual_overlap
    from spatial import load_weather

    directory = raw / state["id"]
    acquisition = json.loads((directory / "acquisition.json").read_text())
    for name in ("cdl.tif", "boundary.geojson", "cdl-metadata.html"):
        if file_hash(directory / name) != acquisition[name]["sha256"]:
            raise ValueError("Source bytes differ from acquisition identity")
    expected = f"https://nassgeodata.gmu.edu/webservice/nass_data_cache/byfips/CDL_{year}_{CONFIG['fips'][state['id']]}.tif"
    if acquisition["cdl.tif"]["url"] != expected:
        raise ValueError("CDL year/state source mismatch")
    html = (directory / "cdl-metadata.html").read_text(errors="strict")
    if f"{year} {state['name']['en']} Cropland Data Layer" not in html or "The entire state is covered" not in html:
        raise ValueError("Official CDL state/year/whole-state coverage not verified")
    plain = re.sub(r"<[^>]+>", " ", html)
    publication = re.search(r"Publication_Date:\s*(\d{8})", plain)
    if not publication:
        raise ValueError("Official CDL publication date missing")
    published = publication[1][:4] + "-" + publication[1][4:6] + "-" + publication[1][6:]
    boundary_data = json.loads((directory / "boundary.geojson").read_text())
    if len(boundary_data["features"]) != 1 or boundary_data["features"][0]["properties"]["GEOID"] != CONFIG["fips"][state["id"]]:
        raise ValueError("Wrong state boundary")
    boundary = transform(Transformer.from_crs(4326, 5070, always_xy=True).transform, shape(boundary_data["features"][0]["geometry"]))
    if not boundary.is_valid:
        raise ValueError("Invalid state boundary")
    # Historical package verification may reuse the immutable Phase 1.8 inputs.
    template = directory / "template.nc"
    weather = load_weather(template if template.exists() else directory / "tmmx.nc", "air_temperature",
                           [f"{year}-07-01"] if template.exists() else [f"{year}-07-{d:02d}" for d in range(1, 15)])
    bounds_path = directory / "request-bounds.json"
    query = parse_qs(urlparse(acquisition["template.nc" if template.exists() else "tmmx.nc"]["url"]).query)
    bounds = json.loads(bounds_path.read_text()) if bounds_path.exists() else {k: float(query[k][0]) for k in ("north", "south", "east", "west")}
    coordinates = {"lat": weather["lat"].tolist(), "lon": weather["lon"].tolist(), "bounds": bounds}
    # Iowa's original bounded input uses a wider rectangle retained exactly.
    identity = annual_identity(state["id"], year, acquisition["cdl.tif"]["sha256"],
                               acquisition["boundary.geojson"]["sha256"],
                               digest({"lat": coordinates["lat"], "lon": coordinates["lon"], "crs": "EPSG:4326"}))
    destination = output / state["id"]
    destination.mkdir(exist_ok=True)
    try:
        existing, _, _ = validate_manifest(destination)
        if existing["identity"] == identity and not force:
            reference = area_reference(raw, state, year, existing["mappedCornAreaM2"])
            if existing.get("areaValidation") != reference:
                existing["areaValidation"] = reference
                write_json(destination / "manifest.json", existing)
            return existing  # Raw inputs prove identity; valid compact package reused.
    except ValueError:
        pass
    cells, matrix, crop, _ = annual_overlap(directory, state, weather, GRID, boundary, force)
    if sum(c["cornAreaM2"] for c in cells) < 10000:
        raise ValueError("Unexpected near-zero full-state corn mask (<1 hectare); quarantine, never substitute zero")
    compact = [{"id": f"{GRID['version']}:r{c['row']}:c{c['col']}", "cornAreaM2": c["cornAreaM2"],
                "cornFraction": c["cornFraction"], "validAreaM2": c["validCropDataAreaM2"]} for c in cells]
    write_json(destination / "cells.json", compact)
    write_json(destination / "coordinates.json", coordinates)
    temporary = destination / "overlap.npz.part"
    with temporary.open("wb") as stream:
        save_npz(stream, matrix)
    temporary.replace(destination / "overlap.npz")
    # Fixed-2015 research labels do not enter the production contract.
    metadata = {k: v for k, v in crop.items() if k not in ("cropYear",)}
    manifest = {"schemaVersion": 1, "key": digest(identity), "identity": identity,
                "mappedCornAreaM2": float(sum(c["cornAreaM2"] for c in cells)), "nativeResolutionM": 30,
                "publicationDate": published, "cdlSourceUrl": expected, "metadataUrl": acquisition["cdl-metadata.html"]["url"],
                "metadataHash": acquisition["cdl-metadata.html"]["sha256"], "gridDiagnostics": metadata,
                "areaValidation": area_reference(raw, state, year, float(sum(c["cornAreaM2"] for c in cells))),
                "artifacts": {name: file_hash(destination / name) for name in ("cells.json", "overlap.npz", "coordinates.json")}}
    write_json(destination / "manifest.json", manifest)  # Manifest is committed LAST.
    validate_manifest(destination)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", required=True, type=int)
    parser.add_argument("--raw-cache", required=True)
    parser.add_argument("--output-cache", required=True)
    parser.add_argument("--acquire", action="store_true")
    parser.add_argument("--states", nargs="+")
    parser.add_argument("--force-geometry", action="store_true")
    parser.add_argument("--performance")
    args = parser.parse_args()
    if not 2008 <= args.year <= 2023:
        parser.error("Only validated native30m CDL 2008–2023 supported; 10m/resampled/HCDL requires separate validation")
    raw, output = external_cache(args.raw_cache), external_cache(args.output_cache)
    states = [s for s in STATES if not args.states or s["id"] in args.states]
    if args.states and {s["id"] for s in states} != set(args.states):
        parser.error("Unknown state")
    failures = {}
    begun = time.perf_counter()
    if args.acquire:
        try:
            url = CONFIG["acreageUrl"] if args.year == 2015 else f"https://release.nass.usda.gov/reports/cropan{str(args.year+1)[2:]}.txt"
            fetch(raw, f"acreage-{args.year}.txt", url, 3_000_000)
        except Exception as error:
            print(f"Acreage comparison unavailable (not calibration): {error}", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            tasks = {pool.submit(acquire_state, raw, s, args.year): s for s in states}
            for future in concurrent.futures.as_completed(tasks):
                s = tasks[future]
                try:
                    future.result()
                except Exception as error:
                    failures[s["id"]] = str(error)
    manifests = []
    measurements = []
    for s in states:
        if s["id"] not in failures:
            try:
                started = time.perf_counter()
                manifests.append(prepare_state(raw, output, s, args.year, args.force_geometry))
                measurements.append({"state":s["id"],"seconds":time.perf_counter()-started})
                print(f"{s['id']}: annual crop grid validated", flush=True)
            except Exception as error:
                failures[s["id"]] = str(error)
                print(f"{s['id']}: unavailable: {error}", flush=True)
    write_json(output / "index.json", {"schemaVersion": 1, "cropYear": args.year, "methodVersion": ANNUAL_METHOD,
                                      "grid": GRID, "states": {m["identity"]["state"]: m["key"] for m in manifests}, "failures": failures})
    if not failures and len(manifests) == len(STATES):
        from audit_boundaries import audit
        hashes = {m["identity"]["state"]:m["identity"]["cdlHash"] for m in manifests}
        try:
            partition = json.loads((raw / "boundary-audit.json").read_text())
            if partition["inputs"] != hashes:
                raise ValueError("Annual source partition changed")
        except (OSError, ValueError, KeyError):
            partition = audit(raw)
        if not partition["sumSafe"] or partition["pairwiseDuplicateCornAreaM2"]:
            raise ValueError("State masks duplicate corn; do not publish a double-counted denominator")
        for m in manifests:
            if abs(partition["nativeAreaAudit"][m["identity"]["state"]]["cornClass1AreaM2"]-m["mappedCornAreaM2"]) > .01:
                raise ValueError("Common-grid corn area differs from independently counted native pixels")
        index = json.loads((output / "index.json").read_text())
        index["partitionAudit"] = {"sourceHash":digest(partition),"sumSafe":True,"duplicateCornAreaM2":0,
            "inputHashes":hashes,"nativeAreaM2":{s:v["cornClass1AreaM2"] for s,v in partition["nativeAreaAudit"].items()}}
        write_json(output / "index.json",index)
    if args.performance:
        write_json(args.performance,{"seconds":time.perf_counter()-begun,"states":measurements,
            "rawDiskBytes":sum(p.stat().st_size for p in raw.rglob("*") if p.is_file()),
            "annualBytes":sum(p.stat().st_size for p in output.rglob("*") if p.is_file()),
            "maximumMemoryBytes":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=="darwin" else 1024)})
    if failures or len(manifests) != len(states):
        raise SystemExit(1)
