"""Narrow US corn adapter. No credentials, alerts, deployments or global refresh.

Lives inside official-data.json.cornPilot so the existing immutable release binds
every byte. Each source/point retains its own last valid accepted cache on failure.
"""
import argparse
import copy
import hashlib
import json
import re
import statistics
from datetime import date, datetime, timedelta
from urllib.parse import urlencode, urljoin
from urllib.request import urlopen

from data_contract import DataIssue, attach_metadata
from refresh_data import ROOT, utc_now, write_cache, failure_kind
from refresh_weather import parse_daily, FIELDS, _percentile

CONFIG = json.loads((ROOT / "src/data/cornPilot.json").read_text())
REGIONS = CONFIG["regions"]
STAGES = ["planted", "emerged", "silking", "dough", "dented", "mature", "harvested"]
CONDITIONS = ["veryPoor", "poor", "fair", "good", "excellent"]
PATH = ROOT / "public/data/official-data.json"
HASH = lambda raw: hashlib.sha256(raw.encode()).hexdigest()


def read_url(url):
    with urlopen(url, timeout=55) as response:
        if response.url.split("/")[2] not in {"esmis.nal.usda.gov", "power.larc.nasa.gov"}:
            raise ValueError("Unexpected source redirect")
        raw = response.read()
        try:
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return raw.decode("cp1252")  # NASS annual plain-text reports use this encoding.


def report_links(html, prefix):
    links = re.findall(r'href=[\"\']([^\"\']+/sites/default/release-files/[^\"\']+\.txt|/sites/default/release-files/[^\"\']+\.txt)[\"\']', html)
    result = list(dict.fromkeys(urljoin("https://esmis.nal.usda.gov", link) for link in links if
                               re.search(r"/" + prefix + r"\d+(?:_\d+)?\.txt$", link)))
    if not result or any(not u.startswith("https://esmis.nal.usda.gov/sites/default/release-files/") for u in result):
        raise ValueError("Official report links not found")
    return result


def publication(text):
    match = re.search(r"Released (\w+ \d{1,2}, \d{4}), by the National Agricultural Statistics Service", text)
    if not match:
        match = re.search(r"This report was approved on (\w+ \d{1,2}, \d{4})\.", text)
    if not match:
        raise ValueError("NASS publication date missing")
    return datetime.strptime(match[1], "%B %d, %Y").date().isoformat()


def row_numbers(block, name, count, zero=False, optional_columns=()):
    matches = re.findall(r"^" + re.escape(name) + r"\s*\.+\s*:\s*(.*?)\s*$", block, re.M)
    if len(matches) != 1:
        raise DataIssue(f"Missing/duplicate region {name}", "coverage_incomplete")
    values = matches[0].split()
    if len(values) != count:
        raise ValueError("Unexpected column count")
    revised = bool(re.search(r"^\*\s+Revised\.", block, re.M))
    result = [None if i in optional_columns and v in {"(NA)", "NA"} else
              0.0 if v == "-" and zero else float((v[1:] if revised and v.startswith("*") else v).replace(",", ""))
              for i, v in enumerate(values)]
    if any(v is not None and not 0 <= v <= 1e10 for v in result):
        raise ValueError("Nonfinite/negative value")
    return result


def parse_production(text):
    issued = publication(text)
    tables = re.findall(r"^Corn Area Planted for All Purposes and Harvested for Grain, Yield, and Production -\s*\n"
                        r"States and United States: (\d{4})-(\d{4})([^\n]*)(.*?)(?=\nCorn |\Z)", text, re.M | re.S)
    if len(tables) != 2:
        raise ValueError("Corn grain tables missing")
    first, last = int(tables[0][0]), int(tables[0][1])
    if last - first != 2 or any(t[:2] != tables[0][:2] for t in tables) or last >= int(issued[:4]):
        raise ValueError("Unexpected production years")
    area, production = tables[0][3], tables[1][3]
    if "1,000 acres" not in area or "Yield per acre" not in production or "1,000 bushels" not in production:
        raise ValueError("Unexpected production units")
    for block in (area, production):
        header = re.search(r"^\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})\s*:\s*(\d{4})", block, re.M)
        if not header or list(map(int, header.groups())) != list(range(first, last+1))*2:
            raise ValueError("Production column years changed")
    rows = {}
    for region in [*REGIONS, {"id": "US", "name": {"en": "United States"}}]:
        name = region["name"]["en"]
        a, p = row_numbers(area, name, 6), row_numbers(production, name, 6)
        if min(a[5], p[2], p[5]) <= 0 or abs(a[5]*p[2]-p[5]) / p[5] > .015:
            raise ValueError("Yield/area/production inconsistent")
        rows[region["id"]] = {"production": p[5], "harvestedArea": a[5], "yield": p[2]}
    total = rows.pop("US")
    if sum(r["production"] for r in rows.values()) > total["production"]:
        raise ValueError("Pilot exceeds national production")
    return {"year": str(last), "publishedDate": issued, "unit": "1000 bushels", "areaUnit": "1000 acres",
            "yieldUnit": "bushels/acre", "national": total, "regions": rows, "rawHash": HASH(text),
            "observationId": f"NASS/corn-grain/{last}"}


def parse_progress(text):
    issued = publication(text)
    tables = re.findall(r"^Corn (Planted|Emerged|Silking|Dough|Dented|Mature|Harvested|Condition) - Selected States([^\n]*)(.*?)(?=\n[A-Z][^\n]* - (?:Selected States|States)|\Z)", text, re.M | re.S)
    if not tables:
        raise ValueError("No corn progress tables")
    rows = {r["id"]: {"progress": {}, "condition": None} for r in REGIONS}
    week = None
    metrics = set()
    for title, suffix, block in tables:
        metric = title.lower()
        if metric in metrics or "percent" not in block:
            raise ValueError("Duplicate table or missing units")
        metrics.add(metric)
        if metric == "condition":
            match = re.fullmatch(r": Week Ending (\w+ \d{1,2}, \d{4})\s*", suffix)
            if not match or not re.search(r"State\s*:\s*Very poor\s*:\s*Poor\s*:\s*Fair\s*:\s*Good\s*:\s*Excellent", block):
                raise ValueError("Condition header changed")
            period = datetime.strptime(match[1], "%B %d, %Y").date().isoformat()
        else:
            lines = block.splitlines()
            i = next((i for i, line in enumerate(lines) if re.match(r"\s*State\s*:", line)), None)
            if i is None:
                raise ValueError("Progress header missing")
            monthdays, years = lines[i].split(":")[1:4], lines[i+1].split(":")[1:4]
            dates = [datetime.strptime(md.strip().rstrip(",") + " " + y.strip(), "%B %d %Y").date() for md, y in zip(monthdays, years)]
            if len(dates) != 3 or dates[2]-dates[1] != timedelta(days=7) or dates[0].year != dates[2].year-1:
                raise ValueError("Progress period columns changed")
            period = dates[2].isoformat()
        if week and period != week or not 0 <= (date.fromisoformat(issued)-date.fromisoformat(period)).days <= 3:
            raise ValueError("Misaligned report dates")
        week = period
        for region in REGIONS:
            values = row_numbers(block, region["name"]["en"], 5 if metric == "condition" else 4,
                                 bool(re.search(r"-\s+Represents zero", block)),
                                 optional_columns=() if metric == "condition" else (0, 1, 3))
            if any(v is not None and (v > 100 or v != int(v)) for v in values):
                raise ValueError("Invalid percentage")
            if metric == "condition":
                if sum(values) != 100:
                    raise ValueError("Condition shares do not sum to 100")
                rows[region["id"]]["condition"] = dict(zip(CONDITIONS, values))
            else:
                rows[region["id"]]["progress"][metric] = values[2]
    for row in rows.values():
        values = [row["progress"][key] for key in STAGES if key in row["progress"]]
        if any(a < b for a, b in zip(values, values[1:])):
            raise ValueError("Inconsistent cumulative stages")
    return {"weekEnding": week, "publishedDate": issued, "regions": rows, "rawHash": HASH(text),
            "observationId": f"NASS/corn-progress/{week}"}


def power_url(region, start, end):
    return "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode({
        "parameters": ",".join(FIELDS), "community": "AG", "latitude": region["lat"], "longitude": region["lon"],
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON", "time-standard": "UTC"})


def power_days(raw, region, start, end):
    payload = json.loads(raw)
    coords = payload.get("geometry", {}).get("coordinates", [])
    if len(coords) < 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in coords[:2]) or \
            not abs(coords[0]-region["lon"]) <= .01 or not abs(coords[1]-region["lat"]) <= .01:
        raise ValueError("Unexpected POWER response location")
    return parse_daily(payload, start, end)


def baseline_windows(days):
    """30 equally weighted matching calendar 7-day windows, no seasonal pooling."""
    buckets = {}
    for i, day in enumerate(days):
        if i < 6 or not "1991" <= day["date"][:4] <= "2020" or day["date"][5:] == "02-29":
            continue
        window = days[i-6:i+1]
        if (date.fromisoformat(day["date"])-date.fromisoformat(window[0]["date"])).days != 6:
            raise ValueError("Non-contiguous baseline")
        bucket = buckets.setdefault(day["date"][5:], {"maxMean": [], "rainTotal": [], "rootMean": []})
        for key, value in (("maxMean", statistics.mean(d["max"] for d in window)),
                           ("rainTotal", sum(d["rain"] for d in window)), ("rootMean", statistics.mean(d["rootWetness"] for d in window))):
            bucket[key].append(value)
    if len(buckets) != 365 or any(len(v) != 30 for b in buckets.values() for v in b.values()):
        raise ValueError("Incomplete 30-year calendar baseline")
    return {md: {"samples": 30, "maxMean": statistics.mean(b["maxMean"]), "rainMean": statistics.mean(b["rainTotal"]),
                 "rainP20": _percentile(sorted(b["rainTotal"]), .2), "rootP20": _percentile(sorted(b["rootMean"]), .2),
                 "rootMean": statistics.mean(b["rootMean"])} for md, b in buckets.items()}


def accept(key, old, now, fetch, point_id=None):
    try:
        incoming = fetch()
        data = incoming.get("data", {})
        prior = old.get("data", {})
        if old.get("days") and incoming.get("days") and incoming["days"][-1]["date"] < old["days"][-1]["date"]:
            raise DataIssue("Older weather period rejected", "publication_regression")
        for field in ("year", "weekEnding", "publishedDate"):
            if prior.get(field) and data.get(field, "") < prior[field]:
                raise DataIssue("Older official report rejected", "publication_regression")
        if data.get("publishedDate", "") > now[:10]:
            raise ValueError("Future publication")
        if key == "cornProgress":
            history = {r["weekEnding"]: r for r in prior.get("history", [])}
            if prior.get("weekEnding"):
                history[prior["weekEnding"]] = {k: v for k, v in prior.items() if k != "history"}
            for entry in data.pop("history", []):
                history[entry["weekEnding"]] = entry
            history[data["weekEnding"]] = copy.deepcopy(data)
            data["history"] = [history[k] for k in sorted(history)[-12:]]
        incoming.update(status="ok", fetchedAt=now, lastAttemptAt=now)
        result = attach_metadata(incoming, key, old, point_id=point_id)
        if data.get("publishedDate"):
            # Source gives a DATE, not an exact timestamp. Preserve that distinction.
            result["metadata"]["observation"]["vintage"] = data["publishedDate"][:7]
            result["metadata"]["version"]["observationId"] = data["observationId"]
            result["metadata"]["extensions"]["publicationDate"] = data["publishedDate"]
        return result
    except Exception as error:
        record = copy.deepcopy(old)
        record.update(status="error", lastAttemptAt=now, failureKind=failure_kind(error), error=str(error)[:250])
        result = attach_metadata(record, key, old, point_id=point_id, failure=error,
                                 parsed=record["failureKind"] == "validation")
        if old.get("metadata"):
            result["metadata"]["observation"] = copy.deepcopy(old["metadata"]["observation"])
            result["metadata"]["extensions"] = copy.deepcopy(old["metadata"]["extensions"])
        return result


def refresh(pilot, now, get=read_url, bootstrap_baselines=False):
    result = copy.deepcopy(pilot or {"schemaVersion": 1, "sources": {}, "weather": {}, "baselines": {}})
    for key, prefix, parser, source in (("cornProduction", "cropan", parse_production, CONFIG["productionSource"]),
                                        ("cornProgress", "prog", parse_progress, CONFIG["progressSource"])):
        def fetch(key=key, prefix=prefix, parser=parser, source=source):
            links = report_links(get(source), prefix)
            url = links[0]
            raw = get(url).replace("\r\n", "\n")
            data = parser(raw)
            data["downloadUrl"] = url
            old_history = result["sources"].get(key, {}).get("data", {}).get("history", [])
            if key == "cornProgress" and len(links)>1 and not any(
                    (date.fromisoformat(data["weekEnding"])-date.fromisoformat(r["weekEnding"])).days == 7 for r in old_history):
                # Best-effort bootstrap comparator; failure cannot turn a valid
                # current report into an outage or fabricate a previous value.
                try:
                    previous = parser(get(links[1]).replace("\r\n", "\n"))
                    previous["downloadUrl"] = links[1]
                    if (date.fromisoformat(data["weekEnding"])-date.fromisoformat(previous["weekEnding"])).days == 7:
                        data["history"] = [previous]
                except (OSError, ValueError):
                    pass
            return {"data": data, "source": {"url": source, "downloadUrl": url, "period": data.get("year") or data["weekEnding"]}}
        result["sources"][key] = accept(key, result["sources"].get(key, {}), now, fetch)
    end = date.fromisoformat(now[:10])-timedelta(days=4)
    start = end-timedelta(days=13)
    for region in REGIONS:
        rid = region["id"]
        def weather():
            url = power_url(region, start, end)
            raw = get(url)
            return {"url": url, "days": power_days(raw, region, start, end), "rawHash": HASH(raw)}
        result["weather"][rid] = accept("weather", result["weather"].get(rid, {}), now, weather, point_id=f"corn-{rid}")
        if bootstrap_baselines and result["baselines"].get(rid, {}).get("status") != "ok":
            def baseline():
                begin, finish = date(1990, 12, 26), date(2020, 12, 31)
                url = power_url(region, begin, finish)
                raw = get(url)
                return {"source": {"url": url, "downloadUrl": url, "period": "1991-2020"}, "data": {
                    "baseline": "1991-2020", "windowDays": 7, "lat": region["lat"], "lon": region["lon"],
                    "windows": baseline_windows(power_days(raw, region, begin, finish)), "rawHash": HASH(raw)}}
            result["baselines"][rid] = accept("cornBaseline", result["baselines"].get(rid, {}), now, baseline, point_id=rid)
    return result


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--output", type=str, default=str(PATH))
    cli.add_argument("--bootstrap-baselines", action="store_true", help="One-time 30-year downloads; never automatically run on daily schedule")
    args = cli.parse_args()
    from pathlib import Path
    path = Path(args.output)
    bundle = json.loads(path.read_text()) if path.exists() else {"schemaVersion": 1, "sources": {}}
    bundle["cornPilot"] = refresh(bundle.get("cornPilot"), utc_now(), bootstrap_baselines=args.bootstrap_baselines)
    write_cache(path, bundle)
    errors = [r for group in ("sources", "weather", "baselines") for r in bundle["cornPilot"][group].values() if r.get("status") != "ok"]
    print(f"US corn pilot: {len(errors)} retained/unavailable source records; no notifications")
    raise SystemExit(bool(errors))
