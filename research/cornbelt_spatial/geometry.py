"""Iowa's pixel/footprint intersection on a shared, fixed ten-state lattice."""
import json
import math
from pathlib import Path
import sys

import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.sparse import csr_matrix, load_npz, save_npz
from shapely import STRtree
from shapely.geometry import box

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"iowa_spatial"))
from spatial import crop_masks, digest, file_hash, polygon_mask_area, validate_cdl, weather_footprint, SpatialIssue
from acquire import write_json


def signature(cdl_path, weather, grid, boundary_path):
    return {"cropHash":file_hash(cdl_path),"boundaryHash":file_hash(boundary_path),"grid":grid,
            "weatherGeometryHash":digest({"lat":weather["lat"].tolist(),"lon":weather["lon"].tolist(),"crs":"EPSG:4326"}),
            "geometryCodeHash":file_hash(Path(__file__)),
            "referenceUtilityHash":file_hash(Path(__file__).resolve().parents[1]/"iowa_spatial/spatial.py")}


def check_matrix(cells,matrix,weather_count):
    if matrix.shape != (len(cells),weather_count) or np.any(~np.isfinite(matrix.data)) or np.any(matrix.data < 0):
        raise SpatialIssue("spatial_eligibility_failure","Invalid annual overlap matrix")
    target = np.array([cell["cornAreaM2"] for cell in cells])
    if np.any(~np.isfinite(target)) or np.any(target < 0):
        raise SpatialIssue("spatial_eligibility_failure","Invalid mapped crop denominator")
    support = np.asarray(matrix.sum(axis=1)).ravel()
    if np.any(support > target+np.maximum(.01,target*1e-9)):
        raise SpatialIssue("spatial_eligibility_failure","Overlap area exceeds target crop area")
    return target,support


def annual_overlap(cache,state,weather,grid,boundary,force=False):
    inputs = signature(cache/"cdl.tif",weather,grid,cache/"boundary.geojson")
    manifest_path = cache/"annual-manifest.json"
    rejected = None
    if manifest_path.exists() and not force:
        try:
            manifest = json.loads(manifest_path.read_text())
            if manifest["signature"] != inputs:
                raise ValueError("annual input/geometry/method signature changed")
            for name,sha in manifest["artifacts"].items():
                if file_hash(cache/name) != sha:
                    raise ValueError("annual cache artifact hash mismatch")
            cells = json.loads((cache/"annual-cells.json").read_text())
            matrix = load_npz(cache/"annual-overlap.npz")
            target,_ = check_matrix(cells,matrix,len(weather["lat"])*len(weather["lon"]))
            if abs(target.sum()-manifest["cropMetadata"]["cornAreaM2"]) > .01:
                raise ValueError("Annual cached denominator mismatch")
            return cells,matrix,manifest["cropMetadata"],{"state":"reused","signatureHash":digest(inputs)}
        except (KeyError,ValueError,OSError) as error:
            rejected = str(error)
    lat,lon = weather["lat"],weather["lon"]
    polygons = [weather_footprint(y,x,segments=grid["edgeSegments"]) for y in lat for x in lon]
    tree = STRtree(polygons)
    rows,cols,weights,cells = [],[],[],[]
    size,ox,oy = grid["cellSizeM"],grid["originX"],grid["originY"]
    with rasterio.open(cache/"cdl.tif") as source:
        # Only the Iowa-only origin guard is generalized. Native schema/CRS/
        # resolution/class/nodata guards are the original reference implementation.
        validate_cdl(source,{"originX":source.transform.c,"originY":source.transform.f})
        metadata = {"crs":"EPSG:5070","transform":list(source.transform)[:6],"width":source.width,"height":source.height,
                    "bounds":list(source.bounds),"nativeResolutionM":30,"nodataTag":source.nodata,"contentHash":inputs["cropHash"],
                    "cropYear":2015,"cornClass":1,"backgroundCode":0}
        first_col = math.floor((source.bounds.left-ox)/size)
        last_col = math.ceil((source.bounds.right-ox)/size)
        first_row = math.floor((oy-source.bounds.top)/size)
        last_row = math.ceil((oy-source.bounds.bottom)/size)
        for row in range(first_row,last_row):
            for col in range(first_col,last_col):
                left,top = ox+col*size,oy-row*size
                full = box(left,top-size,left+size,top)
                # Read all touched native pixels; fractional edges are clipped,
                # never snapped or counted twice across reporting cells.
                c0 = max(0,math.floor((left-source.transform.c)/30+1e-9))
                c1 = min(source.width,math.ceil((left+size-source.transform.c)/30-1e-9))
                r0 = max(0,math.floor((source.transform.f-top)/30+1e-9))
                r1 = min(source.height,math.ceil((source.transform.f-(top-size))/30-1e-9))
                if c1 <= c0 or r1 <= r0:
                    continue
                window = Window(c0,r0,c1-c0,r1-r0)
                transform = source.window_transform(window)
                corn,valid = crop_masks(source.read(1,window=window),source.nodata)
                corn_area = polygon_mask_area(corn,transform,full)
                valid_area = polygon_mask_area(valid,transform,full)
                footprint = full.intersection(boundary)
                unknown = polygon_mask_area(~valid,transform,footprint) if not footprint.is_empty else 0.
                index = len(cells)
                cells.append({"gridCellId":f"US-CB-2015-9km-r{row}-c{col}","state":state["id"],"row":row,"col":col,
                              "areaM2":float(size**2),"cornAreaM2":corn_area,"cornFraction":corn_area/size**2,
                              "validCropDataAreaM2":valid_area,"validCropDataCoverage":valid_area/size**2,
                              "stateFootprintM2":footprint.area,"unclassifiedInsideGeneralizedBoundaryM2":unknown})
                if corn_area:
                    for weather_index in sorted(tree.query(full)):
                        overlap = polygon_mask_area(corn,transform,polygons[weather_index].intersection(full))
                        if overlap > 0:
                            rows.append(index);cols.append(int(weather_index));weights.append(overlap)
                if len(cells)%1000 == 0:
                    print(f"{state['id']}: {len(cells)} reporting cells",flush=True)
    matrix = csr_matrix((weights,(rows,cols)),shape=(len(cells),len(polygons)))
    target,support = check_matrix(cells,matrix,len(polygons))
    metadata.update({"areaConservationResidualM2":float(target.sum()-support.sum()),
                     "maximumCellConservationResidualM2":float(np.max(abs(target-support))),"cornAreaM2":float(target.sum()),
                     "gridCells":len(cells),"cornCells":int(np.count_nonzero(target)),"weatherCellsWithCorn":int(np.count_nonzero(np.asarray(matrix.sum(axis=0)))),
                     "nonzeroWeights":matrix.nnz,"unclassifiedInsideGeneralizedBoundaryM2":sum(c["unclassifiedInsideGeneralizedBoundaryM2"] for c in cells)})
    write_json(cache/"annual-cells.json",cells)
    partial = cache/"annual-overlap.npz.part"
    with partial.open("wb") as output:
        save_npz(output,matrix)
    partial.replace(cache/"annual-overlap.npz")
    artifacts = {name:file_hash(cache/name) for name in ("annual-cells.json","annual-overlap.npz")}
    write_json(manifest_path,{"signature":inputs,"cropMetadata":metadata,"artifacts":artifacts})
    return cells,matrix,metadata,{"state":"rebuilt" if rejected else "prepared","rejectedCacheReason":rejected,"signatureHash":digest(inputs)}
