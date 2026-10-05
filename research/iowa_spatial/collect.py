"""Bounded, manual/offline collector. Never imported by production collectors."""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from spatial import file_hash

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://thredds.northwestknowledge.net/thredds/ncss/MET"
CDL_URL = "https://nassgeodata.gmu.edu/webservice/nass_data_cache/byfips/CDL_2015_19.tif"
BOUNDARY_URL = ("https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2015/State_County/"
                "MapServer/7/query?" + urlencode({"where": "STATE='19'", "outFields": "GEOID,NAME",
                                                "outSR": 4326, "f": "geojson"}))


def external_cache(path):
    path = Path(path).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError("Raw/intermediate inputs must stay outside the repository")
    path.mkdir(parents=True, exist_ok=True)
    return path


def source_requests(config):
    result = [("CDL_2015_19.tif", CDL_URL, 230_000_000), ("iowa-boundary.geojson", BOUNDARY_URL, 2_000_000)]
    for key, variable in (("tmmx", "air_temperature"), ("tmmn", "air_temperature"), ("pr", "precipitation_amount")):
        params = {"var": variable, "north": 43.7, "south": 40.2, "east": -89.9, "west": -96.8,
                  "time_start": config["start"] + "T00:00:00Z", "time_end": config["end"] + "T00:00:00Z", "accept": "netcdf"}
        result.append((key + ".nc", BASE + f"/{key}/{key}_2015.nc?" + urlencode(params), 12_000_000))
    return result


def collect(cache, config, refresh=False):
    manifest_path = cache / "acquisition.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"sources": {}}
    for name, url, limit in source_requests(config):
        destination = cache / name
        previous = manifest["sources"].get(name, {})
        if destination.exists() and previous.get("sha256") == file_hash(destination) and not refresh:
            continue
        started = time.perf_counter()
        checked = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        partial = cache / (name + ".part")
        try:
            with urlopen(url, timeout=60) as response, partial.open("wb") as output:
                length = int(response.headers.get("Content-Length", 0))
                if length > limit:
                    raise ValueError("Source exceeds declared byte budget")
                size = 0
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    size += len(chunk)
                    if size > limit:
                        raise ValueError("Source exceeds declared byte budget")
                    output.write(chunk)
                if not size or (length and size != length):
                    raise ValueError("Incomplete download")
                headers = {key: response.headers.get(key) for key in ("Last-Modified", "ETag")}
            os.replace(partial, destination)
            manifest["sources"][name] = {"url": url, "bytes": size, "sha256": file_hash(destination),
                                        "fetchedAt": checked, "downloadSeconds": time.perf_counter() - started,
                                        "httpHeaders": headers, "publishedAt": None,
                                        "attempt": {"retrieval": "ok", "checkedAt": checked}}
        except Exception as error:
            if partial.exists():
                partial.unlink()  # Only this collector's failed, explicit scratch file.
            manifest["sources"][name] = {**previous, "attempt": {"retrieval": "failed", "checkedAt": checked,
                                        "reason": "retrieval_failed", "detail": str(error)}}
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
            raise
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"{name}: {size:,} bytes / {manifest['sources'][name]['downloadSeconds']:.2f}s", flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    parser.add_argument("--refresh", action="store_true", help="Explicitly redownload; does not change analysis dates")
    args = parser.parse_args()
    config = json.loads(Path(__file__).with_name("config.json").read_text())
    collect(external_cache(args.cache), config, args.refresh)
