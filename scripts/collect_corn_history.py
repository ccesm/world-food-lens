"""Explicit, offline-replay research collection. Never touches live caches or SMTP.

Selection and evaluation choices are frozen in docs/CORN_HISTORY_PROTOCOL.md.
Raw responses are cached by URL in a caller-selected directory, with byte hashes;
normalized evidence and canonical metadata are saved for deterministic replay.
"""
import argparse
import copy
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen

from data_contract import attach_metadata
from refresh_data import ROOT, utc_now, write_cache
from refresh_corn import REGIONS, parse_production, parse_progress, publication, row_numbers, power_url, power_days

YEARS = list(range(2012, 2020))
ARCHIVE = "https://esmis.nal.usda.gov/publication/"
SOURCES = {"annual": ARCHIVE+"crop-production-annual-summary", "progress": ARCHIVE+"crop-progress", "supply": ARCHIVE+"crop-production"}
ALTERNATES = [{"id": "IA-west", "lat": 42, "lon": -94.5, "calendar": "central"},
              {"id": "IA-east", "lat": 42, "lon": -92.5, "calendar": "central"}]


def text(raw):
    try:
        return raw.decode("utf-8-sig").replace("\r\n", "\n")
    except UnicodeDecodeError:
        return raw.decode("cp1252").replace("\r\n", "\n")


def archive_links(html):
    # Ignore the separate Latest Release footer, which is not the selected month.
    table = re.search(r"<table\b.*?</table>", html, re.S)
    if not table:
        return []
    links = list(dict.fromkeys(urljoin(ARCHIVE, u) for u in re.findall(r'href="([^"]+\.txt)"', table[0])))
    if any(not u.startswith("https://esmis.nal.usda.gov/sites/default/release-files/") for u in links):
        raise ValueError("Nonofficial archive URL")
    return links


def parse_supply(raw):
    issued = publication(raw)
    # Require the table, not a narrative estimate or the table of contents.
    matches = re.findall(r"^Corn for Grain Area Harvested, Yield, and Production - ((?:[^\n]*\n){1,3})-{10,}(.*?)(?=\n(?:Corn |Sorghum |Oat |Barley )|\Z)", raw, re.M | re.S)
    matches = [(title, block) for title, block in matches if "States and United States:" in title and "Forecasted" in title and len(title)<220]
    if len(matches) != 1:
        raise ValueError("Unique national corn forecast table missing")
    title, block = matches[0]
    forecast = re.search(r"Forecasted\s+(\w+ 1, (\d{4}))", title)
    if not forecast or forecast[2] != issued[:4] or not all(u in block for u in ("Area harvested", "Yield per acre", "Production", "1,000 acres", "1,000 bushels")):
        raise ValueError("Supply table identity or units changed")
    # August has 6 columns; later reports may add prior-month yield, never production.
    line = re.search(r"^United States\s*\.+\s*:\s*(.*?)\s*$", block, re.M)
    if not line or len(line[1].split()) not in (6, 7):
        raise ValueError("Supply column count changed")
    n = len(line[1].split())
    header = block[:block.index("1,000 acres")]
    year = int(forecast[2])
    year_line = next((l for l in header.splitlines() if str(year-1) in l and l.count(str(year))>=2), "")
    # These are deliberately narrow known table layouts, not positional guesses.
    years = [int(y) for y in re.findall(r"\b(?:19|20)\d{2}\b", year_line)]
    expected = [year-1, year, year-1, year, year-1, year] if n == 6 else [year-1, year, year-1, year-1, year]
    if years != expected or n == 7 and forecast[1].split(",")[0].replace(" ", "") not in header.replace(" ", ""):
        raise ValueError("Supply year columns changed")
    values = row_numbers(block, "United States", n, optional_columns=(3,) if n == 7 else ())
    area, yield_, production = values[1], values[-3], values[-1]
    if min(area, yield_, production)<=0 or abs(area*yield_-production)/production>.015:
        raise ValueError("Supply quantities inconsistent")
    return {"year": str(year), "publishedDate": issued, "national": {"harvestedArea": area, "yield": yield_, "production": production},
            "unit": "1000 bushels", "areaUnit": "1000 acres", "yieldUnit": "bushels/acre",
            "observationId": f"NASS/corn-grain/{year}", "rawHash": hashlib.sha256(raw.encode()).hexdigest()}


def canonical(data, kind, url, fetched, raw_hash):
    key = "cornProgress" if kind == "progress" else "cornProduction"
    period = data.get("weekEnding") or data["year"]
    record = {"status": "ok", "fetchedAt": fetched, "lastAttemptAt": fetched, "data": data,
              "source": {"url": SOURCES[kind], "downloadUrl": url, "period": period}}
    result = attach_metadata(record, key)
    m = result["metadata"]
    m["observation"]["vintage"] = data["publishedDate"][:7]
    m["version"]["observationId"] = data["observationId"]
    m["extensions"] = {"publicationDate": data["publishedDate"], "historyKind": "published-report-vintage",
                       "rawBytesSha256": raw_hash, "archiveKind": kind, "publicationPrecision": "day"}
    return result


class Collector:
    def __init__(self, cache):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)

    def get(self, url):
        stem = self.cache / hashlib.sha256(url.encode()).hexdigest()
        body, info = stem.with_suffix(".body"), stem.with_suffix(".json")
        if body.exists() and info.exists():
            meta, raw = json.loads(info.read_text()), body.read_bytes()
            if meta["url"] != url or hashlib.sha256(raw).hexdigest() != meta["sha256"]:
                raise ValueError("Raw cache identity mismatch")
            return raw, meta
        with urlopen(url, timeout=55) as response:
            if response.url.split("/")[2] not in {"esmis.nal.usda.gov", "power.larc.nasa.gov"}:
                raise ValueError("Unexpected archive redirect")
            raw = response.read()
        meta = {"url": url, "fetchedAt": utc_now(), "sha256": hashlib.sha256(raw).hexdigest()}
        body.write_bytes(raw)  # Downloaded artifact, not a source-code edit.
        write_cache(info, meta)
        return raw, meta

    def reports(self, kind, month):
        raw, _ = self.get(SOURCES[kind]+"?date="+month)
        links = archive_links(text(raw))
        records, errors = [], []
        for url in links:
            try:
                raw, meta = self.get(url)
                data = {"annual": parse_production, "progress": parse_progress, "supply": parse_supply}[kind](text(raw))
                if not data["publishedDate"].startswith(month):
                    raise ValueError("Archive filter/publication mismatch")
                records.append(canonical(data, kind, url, meta["fetchedAt"], meta["sha256"]))
            except Exception as error:
                errors.append({"kind": kind, "period": month, "url": url, "reason": str(error)})
        if not links:
            errors.append({"kind": kind, "period": month, "reason": "No archived text release found"})
        return records, errors

    def weather(self, region):
        begin, end = date(YEARS[0], 3, 25), date(YEARS[-1], 12, 7)
        url = power_url(region, begin, end)
        raw, meta = self.get(url)
        record = {"status": "ok", "fetchedAt": meta["fetchedAt"], "lastAttemptAt": meta["fetchedAt"], "url": url,
                  "rawHash": meta["sha256"], "days": power_days(text(raw), region, begin, end)}
        result = attach_metadata(record, "weather", point_id="corn-"+region["id"])
        result["metadata"]["extensions"] = {"historyKind": "retrospective-reanalysis", "rawBytesSha256": meta["sha256"],
                                              "lat": region["lat"], "lon": region["lon"]}
        return result


def collect(cache, output):
    c = Collector(cache)
    bundle = {"schemaVersion": 1, "protocol": "corn-history/1", "seasons": YEARS, "annual": [], "progress": [], "supply": [],
              "weather": {}, "spatial": {}, "baselines": copy.deepcopy(json.loads((ROOT/"public/data/official-data.json").read_text())["cornPilot"]["baselines"]), "errors": []}
    requests = [("annual", f"{y}-01") for y in range(YEARS[0], YEARS[-1]+2)]
    requests += [("progress", f"{y}-{m:02d}") for y in YEARS for m in range(4, 12)]
    requests += [("supply", f"{y}-{m:02d}") for y in YEARS for m in range(8, 12)]
    # 2019 government shutdown: January summary may actually be released February.
    requests += [("annual", "2019-02")]
    def job(pair):
        try:
            return pair, c.reports(*pair)
        except Exception as error:
            return pair, ([], [{"kind": pair[0], "period": pair[1], "reason": str(error)}])
    with ThreadPoolExecutor(max_workers=4) as pool:
        for (kind, month), (records, errors) in pool.map(job, requests):
            bundle[kind].extend(records)
            bundle["errors"].extend(errors)
            print(kind, month, len(records), "accepted;", len(errors), "gaps", flush=True)
    for group in ("annual", "progress", "supply"):
        bundle[group].sort(key=lambda r: (r["data"]["publishedDate"], r["source"]["downloadUrl"]))
    def weather_job(region):
        try:
            return region, c.weather(region), None
        except Exception as error:
            return region, None, {"kind": "weather", "region": region["id"], "reason": str(error)}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for region, record, error in pool.map(weather_job, [*REGIONS, *ALTERNATES]):
            if error:
                bundle["errors"].append(error)
            else:
                bundle["spatial" if region in ALTERNATES else "weather"][region["id"]] = record
            print("weather", region["id"], "accepted" if record else "unavailable", flush=True)
    write_cache(Path(output), bundle)
    print("Saved research inputs only:", output, "gaps:", len(bundle["errors"]), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--output", default=str(ROOT/"research/corn-history-inputs.json"))
    options = parser.parse_args()
    collect(options.cache_dir, options.output)
