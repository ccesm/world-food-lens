"""Offline area-conserving utilities; no connection to live exposure/alerts.

Screens are evaluated on native weather support BEFORE reporting-grid means.
Categorical corn pixels are never interpolated. Boundary pixels are fractionally
intersected in equal-area metres; weather geographic edges are densified first.
"""
import hashlib
import json
import sys
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import netCDF4
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.features import rasterize
from shapely import area, box, intersection
from shapely.geometry import Polygon, mapping

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from data_contract import DataIssue


class SpatialIssue(DataIssue):
    def __init__(self, detail, message, *, invalid_format=False):
        if detail == "retrieval_failure":
            super().__init__(message, "retrieval_failed", "unknown")
        else:
            super().__init__(message, "invalid_format" if invalid_format else "semantic_validation_failed",
                             "failed" if invalid_format else "passed")
        self.detail = detail


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    allow_nan=False).encode()).hexdigest()


def file_hash(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def days_between(start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    return [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]


def load_weather(path, variable, expected_dates):
    """netCDF4 masks fill codes before unpacking; NaN stays ineligible, not zero."""
    try:
        with netCDF4.Dataset(path) as source:
            if source.getncattr("geospatial_bounds_crs") != "EPSG:4326":
                raise SpatialIssue("projection_mismatch", "Weather CRS must be evidenced EPSG:4326")
            field = source.variables[variable]
            if field.dimensions != ("day", "lat", "lon"):
                raise SpatialIssue("invalid_raster", "Unexpected weather axes")
            time = source.variables["day"]
            dates = [d.isoformat()[:10] for d in netCDF4.num2date(time[:], time.units,
                     calendar=getattr(time, "calendar", "standard"))]
            if dates != expected_dates:
                raise SpatialIssue("missing_date", "Dates must exactly match the frozen window in order")
            lat, lon = np.asarray(source.variables["lat"][:]), np.asarray(source.variables["lon"][:])
            for coords, sign in ((lat, -1), (lon, 1)):
                if len(coords) < 2 or not np.all(np.isfinite(coords)) or not np.allclose(
                        np.diff(coords), sign / 24, rtol=0, atol=1e-9):
                    raise SpatialIssue("invalid_raster", "Expected uniform 1/24 degree gridMET coordinates")
            units = field.units
            raw = np.ma.asarray(field[:], dtype=np.float64)
            values = raw.filled(np.nan)
            if variable == "air_temperature" and units == "K":
                values -= 273.15
            elif not (variable == "precipitation_amount" and units == "mm"):
                raise SpatialIssue("invalid_units", "Unsupported weather units")
            finite = values[np.isfinite(values)]
            low, high = (-90, 65) if variable == "air_temperature" else (0, 1000)
            if np.any((finite < low) | (finite > high)):
                raise SpatialIssue("invalid_units", "Weather values outside schema sanity range")
            metadata = {"dates": dates, "crs": "EPSG:4326", "shape": list(values.shape),
                        "unitsIn": units, "unitsOut": "degC" if units == "K" else "mm",
                        "scaleFactor": float(getattr(field, "scale_factor", 1)),
                        "addOffset": float(getattr(field, "add_offset", 0)),
                        "fillValue": int(field._FillValue),
                        "unsignedPacking": getattr(field, "_Unsigned", None),
                        "sourceEditionText": getattr(source, "date", None),
                        "publishedAt": None, "dayDefinition": getattr(source, "note5", None),
                        "latitudeBounds": [float(lat[-1]), float(lat[0])],
                        "longitudeBounds": [float(lon[0]), float(lon[-1])]}
            # Exclude NetCDF-Java's volatile Translation Date; include consumed
            # values, masks, geometry, packing, dates and source edition instead.
            identity = hashlib.sha256(json.dumps(metadata, sort_keys=True).encode())
            for array in (lat, lon, np.nan_to_num(values, nan=0), np.isfinite(values)):
                identity.update(np.ascontiguousarray(array).tobytes())
            metadata["contentHash"] = identity.hexdigest()
            metadata["rawFileHash"] = file_hash(path)
            return {"values": values, "lat": lat, "lon": lon, "metadata": metadata}
    except SpatialIssue:
        raise
    except (OSError, KeyError, AttributeError, ValueError) as error:
        raise SpatialIssue("invalid_raster", str(error), invalid_format=True) from error


def validate_cdl(source, grid):
    if source.crs is None or not CRS(source.crs).equals(CRS("EPSG:5070"), ignore_axis_order=True):
        raise SpatialIssue("projection_mismatch", "CDL must be native Conus Albers")
    if source.count != 1 or source.dtypes != ("uint8",) or source.transform.b or source.transform.d:
        raise SpatialIssue("invalid_raster", "Expected one north-up categorical uint8 band")
    if source.transform.a != 30 or source.transform.e != -30:
        raise SpatialIssue("invalid_raster", "This frozen pilot requires native 30m CDL")
    if (source.transform.c, source.transform.f) != (grid["originX"], grid["originY"]):
        raise SpatialIssue("spatial_eligibility_failure", "Unexpected CDL origin; do not silently snap")
    if source.nodata not in (None, 0):
        raise SpatialIssue("invalid_raster", "Unexpected CDL nodata policy")


def crop_masks(values, nodata=None):
    valid = (values != 0) & ((values != nodata) if nodata is not None else True)
    return (values == 1) & valid, valid


def polygon_mask_area(mask, transform, polygon):
    """Exact area of selected raster pixel rectangles inside a projected polygon.

    Rasterization accelerates interior pixels only. Every touched polygon edge
    pixel uses vector intersection, avoiding centre/all-touched area inflation.
    """
    if polygon.is_empty or not mask.any():
        return 0.0
    pixel_area = abs(transform.a * transform.e)
    shape = mask.shape
    inside = rasterize([(mapping(polygon), 1)], out_shape=shape, transform=transform,
                       dtype="uint8").astype(bool)
    edge = rasterize([(mapping(polygon.boundary), 1)], out_shape=shape, transform=transform,
                     all_touched=True, dtype="uint8").astype(bool) & mask
    total = float(np.count_nonzero(mask & inside & ~edge) * pixel_area)
    rows, cols = np.where(edge)
    if len(rows):
        x = transform.c + cols * transform.a
        y = transform.f + rows * transform.e
        pixels = box(x, y + transform.e, x + transform.a, y)
        total += float(np.sum(area(intersection(pixels, polygon)), dtype=np.float64))
    return total


@lru_cache(maxsize=4)
def weather_transformer(target_crs):
    return Transformer.from_crs("EPSG:4326", target_crs, always_xy=True)


def weather_footprint(lat, lon, target_crs="EPSG:5070", segments=16):
    """Densify native geographic cell edges, not a reprojected class raster."""
    half = 1 / 48
    left, right, bottom, top = lon - half, lon + half, lat - half, lat + half
    xs, ys = [], []
    for a, b in (((left, bottom), (right, bottom)), ((right, bottom), (right, top)),
                 ((right, top), (left, top)), ((left, top), (left, bottom))):
        for fraction in np.arange(segments) / segments:
            xs.append(a[0] + fraction * (b[0] - a[0]))
            ys.append(a[1] + fraction * (b[1] - a[1]))
    tx, ty = weather_transformer(target_crs).transform(xs, ys)
    return Polygon(zip(tx, ty))


def demonstration_screen(tmax, screen):
    # Full seven-day support per demonstration window, even when some observed
    # hot days already meet the threshold. No missing-day imputation.
    complete = np.all(np.isfinite(tmax), axis=0)
    flagged = np.zeros(tmax.shape[1:], dtype=bool)
    for start, end in screen["windows"]:
        flagged |= np.sum(tmax[start:end] >= screen["tmaxC"], axis=0) >= screen["minimumDays"]
    return complete, flagged & complete


def denominators(total, valid, screened):
    tolerance = max(1e-5, total * 1e-10)
    if min(total, valid, screened) < 0 or valid > total + tolerance or screened > valid + tolerance:
        raise SpatialIssue("spatial_eligibility_failure", "Non-conserving area denominators")
    return {"X_mappedCornM2": total, "Y_jointValidCornM2": valid, "Z_screenOverlapM2": screened if valid else None,
            "missingWeatherCornM2": max(0.0, total - valid),
            "coverage_Y_over_X": valid / total if total else None,
            "overlap_Z_over_Y": screened / valid if valid else None,
            "knownContribution_Z_over_X": screened / total if total and valid else None,
            "eligibility": "insufficient" if not total or not valid else "partial" if valid < total - tolerance else "eligible"}


def weighted_stats(values, weights):
    valid = np.isfinite(values) & (weights > 0)
    values, weights = values[valid], weights[valid]
    if not len(values):
        return None
    order = np.argsort(values, kind="stable")
    cumulative = np.cumsum(weights[order])
    quantiles = {f"p{q}": float(values[order[min(np.searchsorted(cumulative, q / 100 * cumulative[-1]), len(order)-1)]])
                 for q in (10, 50, 90)}
    return {"mean": float(np.average(values, weights=weights)), **quantiles,
            "min": float(values.min()), "max": float(values.max())}
