"""Copernicus GDO drought rasters sampled at WFL representative points."""
import copy
import json
import re
import struct
import xml.etree.ElementTree as ET
import zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from refresh_data import ROOT, utc_now, write_cache, failure_kind
from data_contract import attach_metadata, DataIssue

PATH = ROOT / "public/data/drought-monitor.json"
POINTS = ROOT / "src/data/weatherPoints.json"
SERVICE_PAGE = "https://drought.emergency.copernicus.eu/data/wms-service"
WMS = "https://drought.emergency.copernicus.eu/api/wms?"
CAPABILITIES = WMS + "SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1"
MAP_WIDTH, MAP_HEIGHT = 1440, 720
LAYERS = {
    "shortTerm": {"id": "spaST", "timescale": "01", "title": "SPI ERA5 Short Term (1 month)"},
    "longTerm": {"id": "spaLT", "timescale": "06", "title": "SPI ERA5 Long Term (6 months)"},
    "impactRisk": {"id": "rdria", "timescale": None, "title": "Risk of Drought Impact for Agriculture"},
}
SPI_COLORS = {
    (255, 0, 0): "extremely-dry", (255, 170, 0): "severely-dry",
    (255, 255, 0): "moderately-dry", (255, 255, 255): "near-normal",
    (233, 204, 249): "moderately-wet", (201, 128, 198): "very-wet",
    (131, 51, 147): "extremely-wet", (255, 255, 254): "no-data",
}
RISK_COLORS = {
    (255, 0, 0): "high", (255, 205, 0): "medium",
    (255, 255, 0): "low", (255, 255, 254): "no-hotspot",
}


def latest_periods(html):
    """Read example request periods; the service page is not an availability API."""
    periods = {}
    for key, config in LAYERS.items():
        match = re.search(rf"LAYERS={config['id']}[^\"<]*?TIME=(\d{{4}}-\d{{2}}-\d{{2}})", html, re.I)
        if not match:
            raise ValueError(f"Missing example period for {config['id']}")
        periods[key] = match.group(1)
    return periods


def checked_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Invalid GDO period")
    return date.fromisoformat(value)


def advertised_ranges(xml):
    """Read exact time sets. Never reinterpret P10D as calendar dekads.

    A non-aligned interval end is contradictory metadata, not permission to
    accept every date between the endpoints. Unknown encodings fail closed.
    """
    root = ET.fromstring(xml)
    ranges = {}
    seen = set()
    names = {config["id"]: key for key, config in LAYERS.items()}
    for layer in root.iter():
        if layer.tag.rsplit("}", 1)[-1] != "Layer":
            continue
        children = list(layer)
        name = next((item.text for item in children if item.tag.rsplit("}", 1)[-1] == "Name"), None)
        if name not in names:
            continue
        dimensions = [item for item in children if item.tag.rsplit("}", 1)[-1] in ("Dimension", "Extent")
                      and item.get("name", "").lower() == "time" and item.text and item.text.strip()]
        if name in seen:
            raise ValueError("Duplicate GDO time metadata")
        seen.add(name)
        if len(dimensions) != 1:
            continue
        text = dimensions[0].text.strip()
        values = set()
        for token in text.split(","):
            token = token.strip()
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", token):
                values.add(checked_date(token).isoformat())
                continue
            match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})/(\d{4}-\d{2}-\d{2})/P([1-9]\d*)([DMY])", token)
            if not match:
                raise ValueError("Unsupported GDO time dimension")
            start, end, count, unit = match.groups()
            first, last, count = checked_date(start), checked_date(end), int(count)
            if first > last:
                raise ValueError("Reversed GDO advertised availability")
            steps, candidate = 0, first
            while candidate <= last and steps < 50000:
                last_step = candidate
                values.add(candidate.isoformat())
                steps += 1
                if unit == "D":
                    candidate = first + timedelta(days=count * steps)
                else:
                    months = first.year * 12 + first.month - 1 + count * steps * (12 if unit == "Y" else 1)
                    candidate = date(months // 12, months % 12 + 1, first.day)
            if last_step != last or steps >= 50000:
                raise ValueError("GDO interval end does not align with its advertised timestep")
        if not values:
            raise ValueError("Empty GDO time dimension")
        ranges[names[name]] = {"start": min(values), "end": max(values), "times": sorted(values),
                               "dimension": text}
    return ranges


def verify_periods(maps, xml, stamp):
    """Exact membership alone cannot verify the date of an unlabelled PNG.

    Live service probes (2026-10-04) returned the same image for distinct TIME
    values and no response observation date. No positive product association is
    currently available; keep automatic drought disabled even for listed dates.
    """
    ranges = advertised_ranges(xml)
    for key, metadata in maps.items():
        available = ranges.get(key)
        metadata.update(periodVerified=False, availablePeriodVerified=False,
                        productPeriodVerified=False)
        if available:
            metadata.update(availabilityStart=available["start"], availabilityEnd=available["end"])
            metadata.update(timeDimension=available["dimension"],
                            availablePeriodVerified=metadata["period"] in available["times"])
    available = all(maps.get(key, {}).get("availablePeriodVerified") is True for key in LAYERS)
    return {"periodVerified": False, "periodVerification": {
        "checkedAt": stamp, "sourceUrl": CAPABILITIES,
        "reason": "returned-product-period-unverified" if available else "period-not-in-authoritative-time-set",
    }}


def map_url(config, period):
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap",
        "LAYERS": config["id"], "SRS": "EPSG:4326", "BBOX": "-180,-90,180,90",
        "WIDTH": MAP_WIDTH, "HEIGHT": MAP_HEIGHT, "STYLE": "", "FORMAT": "image/png",
        "TIME": period,
    }
    if config["timescale"]:
        params["SELECTED_TIMESCALE"] = config["timescale"]
    return WMS + urlencode(params)


def decode_indexed_png(raw):
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("GDO map is not PNG")
    position, chunks = 8, {}
    while position < len(raw):
        length = struct.unpack(">I", raw[position:position + 4])[0]
        kind = raw[position + 4:position + 8]
        chunks.setdefault(kind, []).append(raw[position + 8:position + 8 + length])
        position += length + 12
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunks[b"IHDR"][0])
    if color_type != 3 or depth not in (1, 2, 4, 8) or compression or filtering or interlace:
        raise ValueError("Unsupported GDO PNG format")
    palette_raw = chunks.get(b"PLTE", [b""])[0]
    palette = [tuple(palette_raw[i:i + 3]) for i in range(0, len(palette_raw), 3)]
    packed_width = (width * depth + 7) // 8
    stream = zlib.decompress(b"".join(chunks.get(b"IDAT", [])))
    rows, offset, previous = [], 0, bytearray(packed_width)
    for _ in range(height):
        filter_type = stream[offset]
        offset += 1
        current = bytearray(stream[offset:offset + packed_width])
        offset += packed_width
        for index in range(packed_width):
            left = current[index - 1] if index else 0
            above = previous[index]
            upper_left = previous[index - 1] if index else 0
            if filter_type == 1:
                current[index] = (current[index] + left) & 255
            elif filter_type == 2:
                current[index] = (current[index] + above) & 255
            elif filter_type == 3:
                current[index] = (current[index] + (left + above) // 2) & 255
            elif filter_type == 4:
                candidate = left + above - upper_left
                distances = (abs(candidate - left), abs(candidate - above), abs(candidate - upper_left))
                predictor = (left, above, upper_left)[distances.index(min(distances))]
                current[index] = (current[index] + predictor) & 255
            elif filter_type != 0:
                raise ValueError("Unsupported GDO PNG row filter")
        rows.append(current)
        previous = current
    if offset != len(stream):
        raise ValueError("Unexpected GDO PNG payload length")
    return {"width": width, "height": height, "depth": depth, "palette": palette, "rows": rows}


def sample_color(image, latitude, longitude):
    x = max(0, min(image["width"] - 1, int((longitude + 180) / 360 * image["width"])))
    y = max(0, min(image["height"] - 1, int((90 - latitude) / 180 * image["height"])))
    depth = image["depth"]
    packed = image["rows"][y][x * depth // 8]
    shift = 8 - depth - (x * depth % 8)
    palette_index = (packed >> shift) & ((1 << depth) - 1)
    try:
        return image["palette"][palette_index]
    except IndexError as error:
        raise ValueError("Invalid GDO palette index") from error


def fetch_current(points):
    xml, metadata_error, periods = None, None, {}
    today = datetime.now(timezone.utc).date()
    try:
        with urlopen(Request(CAPABILITIES, headers={"User-Agent": "WorldFoodLens/1.0"}), timeout=45) as response:
            xml = response.read()
        available = advertised_ranges(xml)
        for key in LAYERS:
            times = [period for period in available.get(key, {}).get("times", []) if checked_date(period) <= today]
            if times:
                periods[key] = max(times)
    except Exception as exc:
        metadata_error = exc
    bases = {key: "wms-time-dimension" for key in periods}
    if len(periods) != len(LAYERS):
        # Documentation examples remain reference-map fallback only, never
        # evidence of availability or the date of the returned observation.
        request = Request(SERVICE_PAGE, headers={"User-Agent": "WorldFoodLens/1.0"})
        with urlopen(request, timeout=60) as response:
            examples = latest_periods(response.read().decode("utf-8", "replace"))
        for key in LAYERS:
            if key not in periods:
                periods[key], bases[key] = examples[key], "wms-service-example"
    for period in periods.values():
        if checked_date(period) > today:
            raise ValueError("Future GDO example period")

    def fetch_layer(item):
        key, config = item
        url = map_url(config, periods[key])
        with urlopen(Request(url, headers={"User-Agent": "WorldFoodLens/1.0"}), timeout=90) as response:
            image = decode_indexed_png(response.read())
        if (image["width"], image["height"]) != (MAP_WIDTH, MAP_HEIGHT):
            raise ValueError("Unexpected GDO map dimensions")
        colors = SPI_COLORS if key != "impactRisk" else RISK_COLORS
        sampled = {}
        for point in points:
            color = sample_color(image, point["lat"], point["lon"])
            if color not in colors:
                raise ValueError(f"Unknown {key} map color {color}")
            sampled[point["id"]] = colors[color]
        return key, {"period": periods[key], "url": url, "layer": config["id"], "title": config["title"],
                     "periodBasis": bases[key], "downloaded": True, "imageParsed": True}, sampled

    maps, sampled = {}, {point["id"]: {} for point in points}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for key, metadata, values in pool.map(fetch_layer, LAYERS.items()):
            maps[key] = metadata
            for point_id, value in values.items():
                sampled[point_id][key] = value
    stamp = utc_now()
    try:
        if metadata_error:
            raise metadata_error
        verification = verify_periods(maps, xml, stamp)
    except Exception as exc:
        for metadata in maps.values():
            metadata.update(periodVerified=False, availablePeriodVerified=False, productPeriodVerified=False)
        verification = {"periodVerified": False, "periodVerification": {
            "checkedAt": stamp, "sourceUrl": CAPABILITIES,
            "reason": "availability-metadata-unavailable" if failure_kind(exc) == "retrieval" else "availability-metadata-invalid",
            "error": str(exc)[:200],
        }}
    return {"maps": maps, "points": sampled, **verification}


def refresh(previous, points, fetcher=fetch_current, stamp=None):
    stamp = stamp or utc_now()
    output = copy.deepcopy(previous)
    output.update(schemaVersion=1, generatedAt=stamp)
    failure, parsed = None, False
    try:
        current = fetcher(points)
        parsed = True
        today = datetime.fromisoformat(stamp.replace("Z", "+00:00")).date()
        for key in LAYERS:
            period = current.get("maps", {}).get(key, {}).get("period")
            if checked_date(period) > today:
                raise ValueError(f"Future GDO {key} period")
            old_period = previous.get("maps", {}).get(key, {}).get("period")
            if old_period and checked_date(period) < checked_date(old_period):
                raise DataIssue(f"Regressed GDO {key} period", "publication_regression")
        # Never inherit successful verification from a previous fetch.
        current["periodVerified"] = current.get("periodVerified") is True and all(
            current["maps"][key].get("periodVerified") is True for key in LAYERS)
        current.setdefault("periodVerification", {"checkedAt": stamp, "sourceUrl": CAPABILITIES,
                                                 "reason": "availability-metadata-unavailable"})
        output.update(current)
        output.update(status="ok", fetchedAt=stamp, lastAttemptAt=stamp, source={
            "name": "Copernicus Emergency Management Service / Global Drought Observatory",
            "url": "https://drought.emergency.copernicus.eu/tumbo/gdo/map/",
            "serviceUrl": SERVICE_PAGE,
            "license": "European Union, Copernicus CEMS; see provider terms",
        })
        output.pop("error", None)
        output.pop("failureKind", None)
    except Exception as exc:
        failure = exc
        output.update(status="error", lastAttemptAt=stamp, error=str(exc)[:200], failureKind=failure_kind(exc), periodVerified=False,
                      periodVerification={"checkedAt": stamp, "sourceUrl": CAPABILITIES,
                                          "reason": "refresh-failed"})
        for metadata in output.get("maps", {}).values():
            metadata["periodVerified"] = False
    return attach_metadata(output, "drought", previous, failure=failure, parsed=parsed)


if __name__ == "__main__":
    previous = json.loads(PATH.read_text()) if PATH.exists() else {}
    if previous and previous.get("schemaVersion") != 1:
        raise ValueError("Invalid prior drought cache")
    points = json.loads(POINTS.read_text())
    result = refresh(previous, points)
    write_cache(PATH, result)
    print("gdo", result["status"], result.get("error", ""))
    raise SystemExit(int(result["status"] != "ok"))
