"""NASA POWER representative grid points, independently retained on failure."""
import copy
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import urlopen
from refresh_data import ROOT, utc_now, write_cache

PATH = ROOT / "public/data/local-weather.json"
POINTS = ROOT / "src/data/weatherPoints.json"
FIELDS = {"T2M_MAX": ("max", "C"), "T2M_MIN": ("min", "C"), "PRECTOTCORR": ("rain", "mm/day")}


def parse_daily(payload, start, end):
    if payload.get("header", {}).get("time_standard") != "UTC":
        raise ValueError("Unexpected time standard")
    parameters = payload.get("properties", {}).get("parameter", {})
    for key, (_, unit) in FIELDS.items():
        if payload.get("parameters", {}).get(key, {}).get("units") != unit:
            raise ValueError("Unexpected units")
    rows = []
    day = start
    while day <= end:
        row = {"date": day.isoformat()}
        for key, (field, _) in FIELDS.items():
            value = parameters.get(key, {}).get(day.strftime("%Y%m%d"))
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
                raise ValueError("Missing/nonfinite daily value")
            if not ((0 <= value <= 2000) if field == "rain" else (-100 <= value <= 70)):
                raise ValueError("Missing sentinel or implausible daily value")
            row[field] = value
        if row["min"] > row["max"]:
            raise ValueError("Minimum above maximum")
        rows.append(row)
        day += timedelta(days=1)
    return rows


def fetch_point(point, start, end):
    url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode({
        "parameters": ",".join(FIELDS), "community": "AG", "latitude": point["lat"],
        "longitude": point["lon"], "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"), "format": "JSON", "time-standard": "UTC"})
    with urlopen(url, timeout=45) as response:
        payload = json.load(response)
    coords = payload.get("geometry", {}).get("coordinates", [])
    if len(coords) < 2 or abs(coords[0]-point["lon"]) > .01 or abs(coords[1]-point["lat"]) > .01:
        raise ValueError("Unexpected response location")
    return {"days": parse_daily(payload, start, end), "url": url,
            "providerSources": payload.get("header", {}).get("sources", [])}


def refresh(previous, points, today, fetcher=fetch_point, stamp=None):
    stamp = stamp or utc_now()
    # Conservative publication delay. Exact represented dates are always exposed.
    end = today - timedelta(days=4)
    start = date(2024, 1, 1)
    output = copy.deepcopy(previous)
    output.update(schemaVersion=1, generatedAt=stamp)
    records = output.setdefault("points", {})
    def run(point):
        old = records.get(point["id"], {})
        try:
            result = fetcher(point, start, end)
            if old.get("days") and result["days"][-1]["date"] < old["days"][-1]["date"]:
                raise ValueError("Regressed weather period")
            return point["id"], dict(result, status="ok", fetchedAt=stamp, lastAttemptAt=stamp)
        except Exception as exc:
            return point["id"], dict(old, status="error", lastAttemptAt=stamp, error=str(exc)[:200])
    with ThreadPoolExecutor(max_workers=3) as pool:
        for key, value in pool.map(run, points):
            records[key] = value
    return output


if __name__ == "__main__":
    previous = json.loads(PATH.read_text()) if PATH.exists() else {"points": {}}
    if previous.get("schemaVersion", 1) != 1 or not isinstance(previous.get("points"), dict):
        raise ValueError("Invalid prior cache")
    points = json.loads(POINTS.read_text())
    result = refresh(previous, points, datetime.now(timezone.utc).date())
    write_cache(PATH, result)
    for point in points:
        record = result["points"][point["id"]]
        print(point["id"], record["status"], record.get("error", ""))
    raise SystemExit(int(any(p["status"] != "ok" for p in result["points"].values())))
