"""Manual ten-state bounded acquisition; no scheduler, deployment or live cache."""
import argparse
import concurrent.futures
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import rasterio
from rasterio.warp import transform_bounds
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"iowa_spatial"))
from spatial import file_hash, digest

ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads(Path(__file__).with_name("config.json").read_text())
STATES = json.loads((ROOT/"src/data/cornPilot.json").read_text())["regions"]


def cache_root(path):
    path = Path(path).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError("Raw/annual cache must remain outside the repository")
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path, value):
    temporary = path.with_suffix(path.suffix+".part")
    temporary.write_text(json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+"\n")
    temporary.replace(path)


def fetch(cache, name, url, limit):
    """Bounded streamed fetch; reuse only exact URL + verified bytes, per state."""
    manifest_path = cache/"acquisition.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    previous = manifest.get(name,{})
    path = cache/name
    if path.exists() and previous.get("url") == url and previous.get("sha256") == file_hash(path):
        return previous
    started = time.perf_counter()
    attempt = datetime.now(timezone.utc).isoformat(timespec="seconds")
    partial = path.with_suffix(path.suffix+".part")
    try:
        with urlopen(url,timeout=60) as response, partial.open("wb") as target:
            length = int(response.headers.get("Content-Length",0))
            if length > limit:
                raise ValueError("Input exceeds state byte budget")
            size = 0
            for chunk in iter(lambda: response.read(1024*1024),b""):
                size += len(chunk)
                if size > limit:
                    raise ValueError("Input exceeds state byte budget")
                target.write(chunk)
            if not size or (length and size != length):
                raise ValueError("Incomplete retrieval")
            headers = {key:response.headers.get(key) for key in ("Last-Modified","ETag")}
        partial.replace(path)
        record = {"url":url,"bytes":size,"sha256":file_hash(path),"downloadSeconds":time.perf_counter()-started,
                  "fetchedAt":attempt,"publishedAt":None,"headers":headers,"attempt":{"retrieval":"ok"}}
        manifest[name] = record
    except Exception as error:
        if partial.exists():
            partial.unlink()  # Exact incomplete file owned by this collector only.
        manifest[name] = {**previous,"attempt":{"retrieval":"failed","checkedAt":attempt,"reason":"retrieval_failed","detail":str(error)}}
        write_json(manifest_path,manifest)
        raise
    write_json(manifest_path,manifest)
    print(f"{cache.name}/{name}: {size:,} bytes in {record['downloadSeconds']:.2f}s",flush=True)
    return record


def metadata(html, state):
    """Keep official source date/accuracy/completeness evidence, not inferred confidence."""
    if f"2015 {state['name']['en']} Cropland Data Layer" not in html:
        raise ValueError("CDL state/year metadata mismatch")
    plain = re.sub(r"<[^>]+>"," ",html)
    date_match = re.search(r"Publication_Date:\s*(\d{8})",plain)
    corn_match = re.search(r"Corn\s+1\s+\d+\s+([\d.]+)%\s+[\d.]+%\s+[\d.]+\s+([\d.]+)%",html)
    return {"provider":"USDA NASS CDL","sourceUrl":f"https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_{state['id'].lower()}15.htm",
            "cropYear":2015,"publicationDate":date_match[1][:4]+"-"+date_match[1][4:6]+"-"+date_match[1][6:] if date_match else None,
            "publishedAt":None,"metadataHash":digest(html),"cornClass":1,
            "producerAccuracyPct":float(corn_match[1]) if corn_match else None,
            "userAccuracyPct":float(corn_match[2]) if corn_match else None,
            "wholeStateCoverageEvidence": "The entire state is covered" in html,
            "classificationPolicy":"Class 1 only; 0 background/unclassified; no yield/production weighting"}


def collect_state(root,state,iowa_cache=None):
    cache = root/state["id"]
    cache.mkdir(exist_ok=True)
    fips = CONFIG["fips"][state["id"]]
    if state["id"] == "IA" and iowa_cache:
        old = json.loads((iowa_cache/"acquisition.json").read_text())["sources"]
        names = {"CDL_2015_19.tif":"cdl.tif","iowa-boundary.geojson":"boundary.geojson","tmmx.nc":"tmmx.nc","tmmn.nc":"tmmn.nc","pr.nc":"pr.nc"}
        manifest = {}
        for original,new in names.items():
            destination = cache/new
            if not destination.exists():
                os.link(iowa_cache/original,destination)  # Shared immutable bytes, not rewritten Iowa artifacts.
            if file_hash(destination) != old[original]["sha256"]:
                raise ValueError("Iowa reference bytes differ")
            manifest[new] = {**old[original],"reuse":"Phase 4B-1.7 accepted external input"}
        write_json(cache/"acquisition.json",manifest)
        bounds = {"north":43.7,"south":40.2,"east":-89.9,"west":-96.8}
    else:
        fetch(cache,"cdl.tif",f"https://nassgeodata.gmu.edu/webservice/nass_data_cache/byfips/CDL_2015_{fips}.tif",700_000_000)
        boundary_url = "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2015/State_County/MapServer/7/query?"+urlencode(
            {"where":f"STATE='{fips}'","outFields":"GEOID,NAME","outSR":4326,"f":"geojson"})
        fetch(cache,"boundary.geojson",boundary_url,3_000_000)
        with rasterio.open(cache/"cdl.tif") as source:
            west,south,east,north = transform_bounds(source.crs,4326,*source.bounds,densify_pts=21)
        bounds = {"north":round(max(north,state["lat"])+.09,6),"south":round(min(south,state["lat"])-.09,6),
                  "west":round(min(west,state["lon"])-.09,6),"east":round(max(east,state["lon"])+.09,6)}
        for key,var in (("tmmx","air_temperature"),("tmmn","air_temperature"),("pr","precipitation_amount")):
            params = {"var":var,**bounds,"time_start":CONFIG["start"]+"T00:00:00Z","time_end":CONFIG["end"]+"T00:00:00Z","accept":"netcdf"}
            fetch(cache,key+".nc",f"https://thredds.northwestknowledge.net/thredds/ncss/MET/{key}/{key}_2015.nc?"+urlencode(params),15_000_000)
    url = f"https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_{state['id'].lower()}15.htm"
    fetch(cache,"cdl-metadata.html",url,2_000_000)
    html = (cache/"cdl-metadata.html").read_text(errors="replace")
    write_json(cache/"crop-source.json",metadata(html,state))
    write_json(cache/"request-bounds.json",bounds)
    return state["id"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache",required=True)
    parser.add_argument("--iowa-cache")
    parser.add_argument("--workers",type=int,default=3)
    args = parser.parse_args()
    root = cache_root(args.cache)
    start = time.perf_counter()
    outcomes = {}
    # Only independent HTTP/file acquisition is concurrent; NetCDF/geometry work
    # runs later in isolated sequential processes, not unsafe library threads.
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(args.workers,4)) as pool:
        tasks = {pool.submit(collect_state,root,state,Path(args.iowa_cache) if args.iowa_cache else None):state for state in STATES}
        for future in concurrent.futures.as_completed(tasks):
            state = tasks[future]
            try:
                future.result()
                outcomes[state["id"]] = {"status":"ok"}
            except Exception as error:
                outcomes[state["id"]] = {"status":"unavailable","reason":"retrieval_or_schema_failure","detail":str(error)}
            print(f"{state['id']}: {outcomes[state['id']]['status']}",flush=True)
    try:
        fetch(root,"acreage-2015.txt",CONFIG["acreageUrl"],3_000_000)
    except Exception as error:
        print(f"Acreage reference unavailable: {error}",flush=True)
    write_json(root/"collection.json",{"states":outcomes,"wallSeconds":time.perf_counter()-start})
