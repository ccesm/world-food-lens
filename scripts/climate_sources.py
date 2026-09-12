"""NOAA CPC observed RONI adapter; stdlib only, with no disk writes.

The owner of the refresh job records attempt/success times and keeps the last
successful payload if this function raises. A RONI value is not an ENSO advisory.
"""

from datetime import date, datetime, timezone
import math
from urllib.request import Request, urlopen


RONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"
SOURCE_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/"
ADVISORY_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"
SEASONS = ("DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ")
MAX_BYTES = 2_000_000


def _month_label(ordinal):
    year, month = divmod(ordinal, 12)
    return f"{year:04d}-{month + 1:02d}"


def parse_roni(text, *, as_of=None, history_limit=120):
    """Parse NOAA's SEAS / YR / ANOM table, retaining gaps, not forecasts.

    NOAA names each season by its middle month/year: DJF 2026 spans
    December 2025 to February 2026; NDJ 2025 spans November 2025 to January
    2026. Only windows ending before the current calendar month are eligible.
    """
    as_of = as_of or datetime.now(timezone.utc).date()
    if not isinstance(as_of, date):
        raise TypeError("as_of must be a date")
    if not isinstance(history_limit, int) or history_limit < 1:
        raise ValueError("history_limit must be positive")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines or lines[0].split() != ["SEAS", "YR", "ANOM"]:
        raise ValueError("NOAA RONI table header changed")
    current_month = as_of.year * 12 + as_of.month - 1
    observations = {}
    for line_number, line in enumerate(lines[1:], start=2):
        fields = line.split()
        if len(fields) != 3 or fields[0] not in SEASONS:
            raise ValueError(f"Invalid NOAA RONI row {line_number}")
        season, year_text, anomaly_text = fields
        try:
            year = int(year_text)
            value = float(anomaly_text)
        except ValueError as error:
            raise ValueError(f"Invalid NOAA RONI number at row {line_number}") from error
        if not 1950 <= year <= as_of.year + 1:
            raise ValueError(f"Invalid NOAA RONI year at row {line_number}")
        middle_month = year * 12 + SEASONS.index(season)
        if middle_month in observations:
            raise ValueError(f"Duplicate NOAA RONI season: {year} {season}")
        # Missing-value sentinels must not appear as extreme observations.
        if not math.isfinite(value) or abs(value) in (99.9, 99.99, 999, 999.9):
            value = None
        elif abs(value) > 10:
            raise ValueError(f"Implausible NOAA RONI anomaly at row {line_number}")
        observations[middle_month] = value

    eligible = {middle: value for middle, value in observations.items()
                if middle + 1 < current_month}
    available = [middle for middle, value in eligible.items() if value is not None]
    if not available:
        raise ValueError("NOAA RONI has no completed observation window")
    latest_middle = max(available)
    first_middle = max(min(eligible), latest_middle - history_limit + 1)
    history = []
    for middle in range(first_middle, latest_middle + 1):
        year, season_index = divmod(middle, 12)
        season = SEASONS[season_index]
        history.append({
            "period": f"{year} {season}",
            "year": year,
            "season": season,
            "startMonth": _month_label(middle - 1),
            "endMonth": _month_label(middle + 1),
            "value": eligible.get(middle),
            # Conservatively flag the last three reported windows, since NOAA
            # may revise a value for two months after its initial publication.
            "provisional": latest_middle - middle <= 2,
        })
    return {
        "index": "RONI",
        "baseline": "1991–2020",
        "latest": history[-1].copy(),
        "history": history,
        "advisoryUrl": ADVISORY_URL,
    }


def fetch_noaa(*, as_of=None):
    """Download and validate NOAA's published observations, or raise on failure."""
    request = Request(RONI_URL, headers={
        "User-Agent": "WorldFoodLens/1.0 (public official-data dashboard)",
        "Accept": "text/plain",
    })
    with urlopen(request, timeout=40) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("NOAA RONI response exceeded size limit")
    data = parse_roni(raw.decode("utf-8-sig"), as_of=as_of)
    return {
        "source": {
            "label": "NOAA CPC · RONI",
            "url": SOURCE_URL,
            "downloadUrl": RONI_URL,
            "period": data["latest"]["period"],
            "unit": "°C",
            "methodology": "ERSSTv6; overlapping 3-month relative Niño 3.4 sea-surface temperature anomalies; 1991–2020 baseline, tropical-mean adjusted and variance scaled. Recent values are provisional. Not an ENSO advisory or a crop forecast.",
        },
        "data": data,
    }
