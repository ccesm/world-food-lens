"""Cache the NOAA CPC advisory, official ENSO probabilities and RONI outlook.

The three documents must describe the same issue month. On any parse/network
failure, retain the last successful outlook and its original fetch timestamp.
"""
import json
import re
from datetime import datetime, timezone
from html import unescape
from urllib.request import Request, urlopen
from refresh_data import ROOT, utc_now, write_cache

PATH = ROOT / "public/data/enso-outlook.json"
BASE = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/"
URLS = {
    "advisory": BASE + "enso_advisory/ensodisc.shtml",
    "probabilities": BASE + "enso/roni/probabilities/",
    "outlook": BASE + "enso/roni/outlook/",
}
MONTHS = {name: n for n, name in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}
# Explicit mapping avoids ambiguities in JJA/JAS seasonal abbreviations.
SEASONS = dict(zip("DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ".split(),
                   [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))


def download(url):
    request = Request(url, headers={"User-Agent": "WorldFoodLens/1.1 (public climate outlook cache)"})
    with urlopen(request, timeout=25) as response:
        data = response.read(1_000_001)
    if len(data) > 1_000_000:
        raise ValueError("NOAA document exceeds size limit")
    return data.decode("utf-8", "replace")


def issue_month(html):
    found = re.search(r"Issued\s+([A-Z][a-z]+)\s+(20\d\d)", unescape(re.sub(r"<[^>]+>", " ", html)), re.I)
    if not found or found.group(1)[:3].title() not in MONTHS:
        raise ValueError("Missing NOAA issue month")
    return f"{found.group(2)}-{MONTHS[found.group(1)[:3].title()]:02d}"


def season_rows(html, count):
    rows = []
    for raw in re.findall(r"<tr\b[^>]*>.*?</tr>", html, re.S | re.I):
        code = re.search(r"<abbr>\s*([A-Z]{3})\b", raw)
        if not code or code.group(1) not in SEASONS:
            continue
        values = re.findall(r"<td[^>]*>\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*</td>", raw)
        if len(values) != count:
            raise ValueError("NOAA season row columns changed")
        rows.append((code.group(1), [float(value) for value in values]))
    if len(rows) != 9 or len({code for code, _ in rows}) != 9:
        raise ValueError("Expected nine unique NOAA season rows")
    return rows


def parse(advisory, probability_page, outlook_page):
    plain = unescape(re.sub(r"<[^>]+>", " ", advisory))
    plain = re.sub(r"\s+", " ", plain)
    date_match = re.search(r"\b(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d\d)\b", plain)
    status = re.search(r"ENSO Alert System Status:\s*(El Niño Advisory|La Niña Advisory|ENSO-Neutral)", plain, re.I)
    value = re.search(r"reaching\s+([+-]?[0-9]+(?:\.[0-9]+)?)\s*°C\s+in\s+Niño-3\.4", plain, re.I)
    if not date_match or not status or not value:
        raise ValueError("NOAA advisory date, status or Niño-3.4 changed")
    month = MONTHS.get(date_match.group(2)[:3].title())
    if not month:
        raise ValueError("Invalid advisory month")
    issued = f"{date_match.group(3)}-{month:02d}"
    if issue_month(probability_page) != issued or issue_month(outlook_page) != issued:
        raise ValueError("NOAA advisory/probability/outlook vintages differ")
    phase = "el-nino" if "Advisory" in status.group(1) and "El" in status.group(1) else "la-nina" if "Advisory" in status.group(1) else "neutral"
    probs, outlook = season_rows(probability_page, 3), season_rows(outlook_page, 7)
    if [code for code, _ in probs] != [code for code, _ in outlook]:
        raise ValueError("NOAA season tables disagree")
    first_month = SEASONS[probs[0][0]]
    delta = first_month - month
    first_year = int(date_match.group(3)) + (-1 if delta > 6 else 1 if delta < -6 else 0)
    first_index = first_year * 12 + first_month - 1
    forecasts = []
    for index, ((code, probability), (_, band)) in enumerate(zip(probs, outlook)):
        year, mon0 = divmod(first_index + index, 12)
        if SEASONS[code] != mon0 + 1 or sum(probability) < 99 or sum(probability) > 101:
            raise ValueError("Invalid NOAA season sequence or probability total")
        if any(not 0 <= item <= 100 for item in probability) or band != sorted(band):
            raise ValueError("Invalid NOAA probability or percentile order")
        forecasts.append({"season": code, "startMonth": f"{year}-{mon0+1:02d}",
                          "laNina": probability[0], "neutral": probability[1], "elNino": probability[2],
                          "roniPercentiles": band})
    strength = re.search(r"(greater than 90% chance of a very strong event|very strong event|strong El Niño event)", plain, re.I)
    trend = "strengthening" if re.search(r"El Niño is strengthening", plain, re.I) else "not-specified"
    return {"issuedAt": f"{issued}-{int(date_match.group(1)):02d}", "phase": phase,
            "trend": trend, "nino34": float(value.group(1)), "nino34Month": f"{issued[:4]}-{month-1:02d}" if month>1 else f"{int(issued[:4])-1}-12",
            "strengthOutlook": "very-strong-likely" if strength and "very strong" in strength.group(1).lower() else "not-specified",
            "forecasts": forecasts, "urls": URLS}


def refresh(previous, fetcher=download, stamp=None):
    stamp = stamp or utc_now()
    result = dict(previous)
    result["schemaVersion"] = 1
    result["lastAttemptAt"] = stamp
    try:
        pages = {key: fetcher(url) for key, url in URLS.items()}
        data = parse(pages["advisory"], pages["probabilities"], pages["outlook"])
        old_issued = previous.get("data", {}).get("issuedAt", "")
        if old_issued and data["issuedAt"] < old_issued:
            raise ValueError("NOAA issue date regressed")
        result.update(data=data, fetchedAt=stamp, status="ok")
        result.pop("error", None)
    except Exception as exc:
        result.update(status="error", error=str(exc)[:200])
    return result


if __name__ == "__main__":
    previous = json.loads(PATH.read_text()) if PATH.exists() else {}
    if previous.get("schemaVersion", 1) != 1:
        raise ValueError("Invalid prior ENSO cache")
    result = refresh(previous)
    write_cache(PATH, result)
    print(result["status"], result.get("data", {}).get("issuedAt", "unavailable"), result.get("error", ""))
    raise SystemExit(int(result["status"] != "ok"))
