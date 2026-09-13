"""Copernicus GDO drought rasters sampled at WFL representative points."""
import copy
import json
import re
import struct
import zlib
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from refresh_data import ROOT, utc_now, write_cache

PATH = ROOT / "public/data/drought-monitor.json"
POINTS = ROOT / "src/data/weatherPoints.json"
SERVICE_PAGE = "https://drought.emergency.copernicus.eu/data/wms-service"
WMS = "https://drought.emergency.copernicus.eu/api/wms?"
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
    periods = {}
    for key, config in LAYERS.items():
        match = re.search(rf"LAYERS={config['id']}[^\"<]*?TIME=(\d{{4}}-\d{{2}}-\d{{2}})", html, re.I)
        if not match:
            raise ValueError(f"Missing current period for {config['id']}")
        periods[key] = match.group(1)
    return periods


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
    request = Request(SERVICE_PAGE, headers={"User-Agent": "WorldFoodLens/1.0 (public official-data dashboard)"})
    with urlopen(request, timeout=60) as response:
        periods = latest_periods(response.read().decode("utf-8", "replace"))

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
        return key, {"period": periods[key], "url": url, "layer": config["id"], "title": config["title"]}, sampled

    maps, sampled = {}, {point["id"]: {} for point in points}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for key, metadata, values in pool.map(fetch_layer, LAYERS.items()):
            maps[key] = metadata
            for point_id, value in values.items():
                sampled[point_id][key] = value
    return {"maps": maps, "points": sampled}


def refresh(previous, points, fetcher=fetch_current, stamp=None):
    stamp = stamp or utc_now()
    output = copy.deepcopy(previous)
    output.update(schemaVersion=1, generatedAt=stamp)
    try:
        current = fetcher(points)
        output.update(current)
        output.update(status="ok", fetchedAt=stamp, lastAttemptAt=stamp, source={
            "name": "Copernicus Emergency Management Service / Global Drought Observatory",
            "url": "https://drought.emergency.copernicus.eu/tumbo/gdo/map/",
            "serviceUrl": SERVICE_PAGE,
            "license": "European Union, Copernicus CEMS; see provider terms",
        })
        output.pop("error", None)
    except Exception as exc:
        output.update(status="error", lastAttemptAt=stamp, error=str(exc)[:200])
    return output


if __name__ == "__main__":
    previous = json.loads(PATH.read_text()) if PATH.exists() else {}
    if previous and previous.get("schemaVersion") != 1:
        raise ValueError("Invalid prior drought cache")
    points = json.loads(POINTS.read_text())
    result = refresh(previous, points)
    write_cache(PATH, result)
    print("gdo", result["status"], result.get("error", ""))
    raise SystemExit(int(result["status"] != "ok"))
