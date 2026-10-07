#!/usr/bin/env python3
"""G1.0 read-only audit of the USDA PSD bulk files (no production parsing).

Records what the files actually contain, so the G1 contract is not built on
guessed field names: columns, attribute and unit identifiers, geography codes,
market-year and release-month structure, zero/negative counts, and
year-over-year change distributions per commodity x attribute. Writes one JSON
file; publishes nothing and changes no production data.
"""
import argparse
import csv
import io
import json
import statistics
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

from macro_sources import download, numeric

FILES = {
    "grains": ("https://apps.fas.usda.gov/psdonline/downloads/psd_grains_pulses_csv.zip", "psd_grains_pulses.csv"),
    "oilseeds": ("https://apps.fas.usda.gov/psdonline/downloads/psd_oilseeds_csv.zip", "psd_oilseeds.csv"),
}
COMMODITIES = {"0410000": "wheat", "0440000": "corn", "0422110": "rice", "2222000": "soybean"}


def quantiles(values):
    if not values:
        return None
    ordered = sorted(values)
    pick = lambda q: ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1) + .5))]
    return {"count": len(ordered), "p50": pick(.5), "p75": pick(.75), "p90": pick(.9), "max": ordered[-1]}


def audit_file(raw, member):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        text = archive.read(member if member in names else names[0]).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    header = reader.fieldnames
    attrs = defaultdict(lambda: {"rows": 0, "zeros": 0, "negatives": 0, "blank": 0, "years": set()})
    geos = defaultdict(lambda: defaultdict(set))
    releases = defaultdict(set)
    series = defaultdict(dict)  # (commodity, attribute, geo) -> {year: value}
    descriptions = {}
    for row in reader:
        code = row["Commodity_Code"].strip()
        if code not in COMMODITIES:
            continue
        commodity = COMMODITIES[code]
        descriptions[commodity] = row.get("Commodity_Description")
        key = (commodity, row.get("Attribute_ID"), row["Attribute_Description"], row.get("Unit_ID"), row["Unit_Description"].strip())
        a = attrs[key]
        a["rows"] += 1
        value = numeric(row["Value"])
        year = int(row["Market_Year"])
        a["years"].add(year)
        if value is None:
            a["blank"] += 1
        elif value == 0:
            a["zeros"] += 1
        elif value < 0:
            a["negatives"] += 1
        geos[commodity][(row["Country_Code"].strip(), row["Country_Name"].strip())].add(year)
        releases[commodity].add((year, f"{int(row['Calendar_Year']):04d}-{int(row['Month']):02d}"))
        if value is not None and year >= 2000:
            series[(commodity, row["Attribute_Description"], row["Country_Code"].strip())][year] = value
    yoy = defaultdict(list)
    for (commodity, attribute, geo), by_year in series.items():
        for year in sorted(by_year):
            prior = by_year.get(year - 1)
            if prior and prior > 0:
                yoy[(commodity, attribute)].append(abs(by_year[year] / prior - 1) * 100)
    latest = {c: max(y for y, _ in r) for c, r in releases.items()}
    return {
        "header": header,
        "commodityDescriptions": descriptions,
        "attributes": [{"commodity": k[0], "attributeId": k[1], "attribute": k[2], "unitId": k[3], "unit": k[4],
                        "rows": v["rows"], "zeros": v["zeros"], "negatives": v["negatives"], "blank": v["blank"],
                        "firstMarketYear": min(v["years"]), "lastMarketYear": max(v["years"])}
                       for k, v in sorted(attrs.items())],
        "geographies": {c: [{"code": code, "name": name, "firstMarketYear": min(ys), "lastMarketYear": max(ys)}
                            for (code, name), ys in sorted(g.items())] for c, g in geos.items()},
        "releaseMonthsForLatestMarketYear": {c: sorted({m for y, m in r if y == latest[c]}) for c, r in releases.items()},
        "latestMarketYear": latest,
        "absoluteYoYPctByAttribute": {f"{c}|{a}": quantiles(v) for (c, a), v in sorted(yoy.items())},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = {"auditedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
              "purpose": "G1.0 read-only structure audit; not production data", "files": {}}
    for name, (url, member) in FILES.items():
        try:
            raw = download(url, max_bytes=80_000_000)
            result["files"][name] = {"url": url, "bytes": len(raw), **audit_file(raw, member)}
        except Exception as error:  # Report, never guess.
            result["files"][name] = {"url": url, "error": f"{type(error).__name__}: {error}"}
    with open(args.output, "w") as out:
        json.dump(result, out, indent=1, sort_keys=True, default=sorted)
        out.write("\n")


if __name__ == "__main__":
    main()
