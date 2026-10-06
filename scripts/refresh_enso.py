"""Cache the NOAA CPC advisory, official ENSO probabilities and RONI outlook.

The three documents must describe the same issue month. On any parse/network
failure, retain the last successful outlook and its original fetch timestamp.
"""
import json
import re
from datetime import datetime, timezone
from html import unescape
from urllib.request import Request, urlopen
from refresh_data import ROOT, utc_now, write_cache, failure_kind
from data_contract import attach_metadata, DataIssue

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
MONTH_NAMES = "January February March April May June July August September October November December".split()


def strength_period(label):
    """Only explicitly dated periods; never infer a year from the issue date."""
    fall_winter = re.fullmatch(r"(?:the\s+)?(?:Northern Hemisphere\s+)?fall and winter\s+(20\d\d)[–/-](\d{2}|20\d\d)", label, re.I)
    months = "|".join(MONTH_NAMES)
    named = re.fullmatch(rf"({months})\s*[-–]\s*({months})\s+(20\d\d)(?:[–/-](\d{{2}}|20\d\d))?", label, re.I)
    if fall_winter:
        start_year, end_year = fall_winter.groups()
        start_month, end_month = 9, 2
    elif named:
        start_name, end_name, start_year, end_year = named.groups()
        start_month, end_month = MONTHS[start_name[:3].title()], MONTHS[end_name[:3].title()]
        end_year = end_year or start_year
    else:
        return None
    start_year = int(start_year)
    end_year = int(end_year) if len(end_year) == 4 else start_year // 100 * 100 + int(end_year)
    if end_year < start_year or end_year > start_year + 1:
        return None
    start, end = f"{start_year}-{start_month:02d}", f"{end_year}-{end_month:02d}"
    if start > end or (fall_winter and end_year != start_year + 1):
        return None
    return {"startMonth": start, "endMonth": end, "label": label}


def strength_evidence(discussion, issued_at, forecasts):
    """Conservative extraction of one explicit probability/event/period assertion.

    Unknown grammar, negation, uncertainty and conflicting assertions stay
    unextracted. Repeated synopsis/summary assertions may corroborate each other.
    This is not a general natural-language classifier.
    """
    sentences = [text.strip() for text in re.split(r"(?<=[.!?])\s+", discussion)]
    candidates = [text for text in sentences if re.search(r"\b(?:very )?strong (?:event|El Niño|La Niña)\b", text, re.I)]
    result = {"status": "not-reliably-extracted", "reason": "missing-strength-statement",
              "event": None, "probability": None, "period": None,
              "sourceText": " ".join(candidates), "sourceUrl": URLS["advisory"], "issuedAt": issued_at}
    pattern = re.compile(
        r"^(?:Synopsis:\s*|In summary,\s*)?(?P<phase>El Niño|La Niña)\s+"
        r"(?:is strengthening,\s+with|has|is forecast to have)\s+(?:a\s+)?"
        r"(?:(?P<operator>greater than|more than|over|at least|less than|under|at most)\s+)?"
        r"(?P<percent>\d+(?:\.\d+)?)%\s+(?:chance|probability)\s+of\s+(?:a\s+)?"
        r"(?P<strength>very strong|strong)\s+(?P<event>event|El Niño event|La Niña event)\s+"
        r"(?:during|in|for)\s+(?P<period>.+?)\.?$", re.I)
    operators = {None: "eq", "greater than": "gt", "more than": "gt", "over": "gt",
                 "at least": "gte", "less than": "lt", "under": "lt", "at most": "lte"}
    last_year, last_month = map(int, forecasts[-1]["startMonth"].split("-"))
    end_year, end_month0 = divmod(last_year * 12 + last_month - 1 + 2, 12)
    horizon_end = f"{end_year}-{end_month0+1:02d}"
    claims = []
    for sentence in candidates:
        if re.search(r"\b(?:not|no|never|unlikely|uncertain|may|might|could|possible|possibly|unclear|if|whether)\b|n't\b", sentence, re.I):
            result["reason"] = "negated-or-uncertain"
            return result
        match = pattern.fullmatch(sentence)
        if not match:
            result["reason"] = "unsupported-strength-statement"
            return result
        values = match.groupdict()
        event = values["event"].lower()
        phase = values["phase"].lower()
        if event != "event" and not event.startswith(phase):
            result["reason"] = "event-phase-mismatch"
            return result
        period = strength_period(values["period"])
        percent = float(values["percent"])
        operator = operators[values["operator"].lower() if values["operator"] else None]
        if not 0 <= percent <= 100 or (operator == "gt" and percent == 100) or (operator == "lt" and percent == 0) or not period:
            result["reason"] = "invalid-probability-or-period"
            return result
        if period["endMonth"] < issued_at[:7] or period["startMonth"] < forecasts[0]["startMonth"] or period["endMonth"] > horizon_end:
            result["reason"] = "outside-forecast-horizon"
            return result
        claim = {"event": {"phase": "el-nino" if phase == "el niño" else "la-nina",
                           "strength": values["strength"].lower().replace(" ", "-")},
                 "probability": {"operator": operator, "percent": percent},
                 "period": period}
        if claims and any(claim[key] != claims[0][key] for key in ("event", "probability", "period")):
            result["reason"] = "multiple-strength-claims"
            return result
        claims.append(claim)
    if claims:
        result.update(status="extracted", reason="explicit-probability-event-period", **claims[0])
    return result


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
    issued_at = f"{issued}-{int(date_match.group(1)):02d}"
    strength = strength_evidence(plain[status.end():].strip(), issued_at, forecasts)
    high_strength = strength["status"] == "extracted" and strength["event"] == {"phase": "el-nino", "strength": "very-strong"} and \
        strength["probability"]["operator"] in ("gt", "gte", "eq") and strength["probability"]["percent"] >= 90
    trend = "strengthening" if re.search(r"El Niño is strengthening", plain, re.I) else "not-specified"
    return {"issuedAt": issued_at, "phase": phase,
            "trend": trend, "nino34": float(value.group(1)), "nino34Month": f"{issued[:4]}-{month-1:02d}" if month>1 else f"{int(issued[:4])-1}-12",
            "strengthOutlook": "very-strong-likely" if high_strength else "not-reliably-extracted" if strength["status"] != "extracted" else "not-specified",
            "strengthEvidence": strength,
            "forecasts": forecasts, "urls": URLS}


def refresh(previous, fetcher=download, stamp=None):
    stamp = stamp or utc_now()
    result = dict(previous)
    result["schemaVersion"] = 1
    result["lastAttemptAt"] = stamp
    failure, parsed = None, False
    try:
        pages = {key: fetcher(url) for key, url in URLS.items()}
        data = parse(pages["advisory"], pages["probabilities"], pages["outlook"])
        parsed = True
        old_issued = previous.get("data", {}).get("issuedAt", "")
        if old_issued and data["issuedAt"] < old_issued:
            raise DataIssue("NOAA issue date regressed", "publication_regression")
        result.update(data=data, fetchedAt=stamp, status="ok")
        result.pop("error", None)
        result.pop("failureKind", None)
    except Exception as exc:
        failure = exc
        result.update(status="error", error=str(exc)[:200], failureKind=failure_kind(exc))
    return attach_metadata(result, "enso", previous, failure=failure, parsed=parsed)


if __name__ == "__main__":
    previous = json.loads(PATH.read_text()) if PATH.exists() else {}
    if previous.get("schemaVersion", 1) != 1:
        raise ValueError("Invalid prior ENSO cache")
    result = refresh(previous)
    write_cache(PATH, result)
    print(result["status"], result.get("data", {}).get("issuedAt", "unavailable"), result.get("error", ""))
    raise SystemExit(int(result["status"] != "ok"))
