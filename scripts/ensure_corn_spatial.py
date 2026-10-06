#!/usr/bin/env python3
"""Annual cache lifecycle shared by production and operational validation.

No hazard logic, public release, email, or cache-as-zero substitution.
Generated candidates must match the reviewed scientific index before use.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from corn_spatial import GRID, ANNUAL_METHOD, digest, external_cache, write_json
from corn_spatial_cache import verify, unpack

ROOT = Path(__file__).resolve().parents[1]


def approved(root, settings):
    index = verify(root)
    if (index["cropYear"] != settings["cropGeographyYear"] or index["grid"] != GRID or
            index["methodVersion"] != settings["annualMethodVersion"] or
            digest(index) != settings["annualIndexHash"]):
        raise ValueError("Annual cache differs from the reviewed scientific input index")
    return index


def cache_key(settings):
    # Index binds crop/state/CDL bytes/grid/reference method, not a filename/date.
    if settings["annualMethodVersion"] != ANNUAL_METHOD or not 2008 <= settings["cropGeographyYear"] <= 2023:
        raise ValueError("Unvalidated CDL family/year/method; do not silently upgrade")
    return f"corn-annual-{settings['annualIndexHash']}-{settings['annualAsset']['sha256']}"


def ensure(root, raw, settings, *, rebuild=True, restore=None, generate=None):
    started = time.perf_counter()
    failures = []
    for action in ("reuse", "restore", "generate"):
        if action == "generate" and not rebuild:
            break
        step = time.perf_counter()
        try:
            if action == "restore":
                restore()
            elif action == "generate":
                generate()
            index = approved(root, settings)
            return {"available": True, "action": action, "seconds": time.perf_counter()-started,
                    "stepSeconds": time.perf_counter()-step, "cacheKey": cache_key(settings),
                    "annualIndexHash": digest(index), "cropGeographyYear": index["cropYear"],
                    "derivedBytes": sum(p.stat().st_size for p in Path(root).rglob("*") if p.is_file()),
                    "priorFailures": failures}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
            failures.append({"action": action, "errorType": type(error).__name__, "detail": str(error)})
    return {"available": False, "action": "unavailable", "seconds": time.perf_counter()-started,
            "cacheKey": cache_key(settings), "cropGeographyYear": settings["cropGeographyYear"],
            "reason": "crop_grid_unavailable", "priorFailures": failures}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--annual-cache", required=True)
    p.add_argument("--raw-cache", required=True)
    p.add_argument("--performance", required=True)
    p.add_argument("--no-rebuild", action="store_true")
    p.add_argument("--print-key", action="store_true")
    args = p.parse_args()
    settings = json.loads((ROOT / "src/data/cornSpatial.json").read_text())
    if args.print_key:
        print(cache_key(settings)); sys.exit()
    annual, raw = external_cache(args.annual_cache), external_cache(args.raw_cache)
    def restore():
        a = settings["annualAsset"]
        subprocess.run(["gh", "release", "download", a["tag"], "--repo", "ccesm/world-food-lens",
                        "--pattern", a["name"], "--dir", str(raw), "--clobber"], check=True, timeout=120)
        unpack(raw / a["name"], annual, a["sha256"])
    def generate():
        subprocess.run([sys.executable, str(ROOT / "scripts/prepare_corn_spatial.py"),
                        "--year", str(settings["cropGeographyYear"]), "--raw-cache", str(raw),
                        "--output-cache", str(annual), "--acquire", "--performance",
                        str(raw / "annual-build-performance.json")], check=True, timeout=1800)
    result = ensure(annual, raw, settings, rebuild=not args.no_rebuild, restore=restore, generate=generate)
    write_json(args.performance, result)
    print(json.dumps(result, sort_keys=True))
    # Expected source/version/cache failure degrades this module, never the
    # unrelated application. Validation workflows assert availability separately.
