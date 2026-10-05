"""Read-only check that summing state masks does not duplicate corn pixels."""
import argparse
import itertools
import time

import numpy as np
import rasterio
from rasterio.windows import Window

from acquire import STATES, cache_root, write_json
from spatial import SpatialIssue, file_hash, validate_cdl


def duplicate_corn_pixels(first,second):
    for source in (first,second):
        validate_cdl(source,{"originX":source.transform.c,"originY":source.transform.f})
    offsets = ((first.transform.c-second.transform.c)/30,(first.transform.f-second.transform.f)/30)
    if any(abs(value-round(value)) > 1e-8 for value in offsets):
        raise SpatialIssue("spatial_eligibility_failure","State CDL native pixel lattices differ")
    left,right = max(first.bounds.left,second.bounds.left),min(first.bounds.right,second.bounds.right)
    bottom,top = max(first.bounds.bottom,second.bounds.bottom),min(first.bounds.top,second.bounds.top)
    if left >= right or bottom >= top:
        return 0
    width,height = round((right-left)/30),round((top-bottom)/30)
    duplicate = 0
    for row in range(0,height,256):
        masks = []
        for source in (first,second):
            window = Window(round((left-source.transform.c)/30),round((source.transform.f-top)/30)+row,
                            width,min(256,height-row))
            masks.append(source.read(1,window=window)==1)
        duplicate += int(np.count_nonzero(masks[0]&masks[1]))
    return duplicate


def audit(root):
    started = time.perf_counter()
    pairs,inputs = [],{}
    for a,b in itertools.combinations(STATES,2):
        with rasterio.open(root/a["id"]/"cdl.tif") as first, rasterio.open(root/b["id"]/"cdl.tif") as second:
            count = duplicate_corn_pixels(first,second)
        pairs.append({"states":[a["id"],b["id"]],"duplicateCornPixels":count,"duplicateCornAreaM2":count*900})
    native_areas = {}
    for state in STATES:
        inputs[state["id"]] = file_hash(root/state["id"]/"cdl.tif")
        counts = np.zeros(256,dtype=np.int64)
        with rasterio.open(root/state["id"]/"cdl.tif") as source:
            for row in range(0,source.height,256):
                values = source.read(1,window=Window(0,row,source.width,min(256,source.height-row)))
                counts += np.bincount(values.ravel(),minlength=256)
        native_areas[state["id"]] = {"cornClass1AreaM2":int(counts[1])*900,
                                    "excludedCornNamedClassAreasM2":{str(k):int(counts[k])*900 for k in (12,13,225,226,237,241)}}
    deterministic = {"method":"Exact class-1 native 30m pixel intersection; no geographic reclassification",
                     "inputs":inputs,"pairs":pairs,"nativeAreaAudit":native_areas,
                     "pairwiseDuplicateCornAreaM2":sum(p["duplicateCornAreaM2"] for p in pairs),
                     "sumSafe":not any(p["duplicateCornPixels"] for p in pairs)}
    write_json(root/"boundary-audit.json",deterministic)
    write_json(root/"boundary-audit-performance.json",{"wallSeconds":time.perf_counter()-started})
    print(deterministic["sumSafe"],deterministic["pairwiseDuplicateCornAreaM2"],flush=True)
    return deterministic


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache",required=True)
    audit(cache_root(parser.parse_args().cache))
