"""Public official macro downloads. Standard library only; no API keys.

Parsers fail closed on changed columns/units, duplicate periods or empty data.
The refresh orchestrator owns persistence and last-good cache preservation.
"""
import csv
from datetime import datetime, timezone
from html import unescape
import io
import math
import posixpath
import re
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
import zipfile

WB_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx"
FAO_URL = "https://www.fao.org/media/docs/worldfoodsituationlibraries/default-document-library/food_price_indices_data.csv"
EIA_URL = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RBRTE&f=M"
USDA_URL = "https://apps.fas.usda.gov/psdonline/downloads/psd_grains_pulses_csv.zip"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def download(url, max_bytes=30_000_000):
    request = Request(url, headers={"User-Agent": "WorldFoodLens/1.1 (public official-data dashboard)"})
    with urlopen(request, timeout=35) as response:
        content = response.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise ValueError("Official download exceeds size limit")
    return content


def numeric(value):
    text = str("" if value is None else value).strip().replace(",", "")
    if text in ("", "...", "…", "NA", "N/A", "--", "(s)"):
        return None
    number = float(text)
    if not math.isfinite(number):
        raise ValueError("Non-finite observation")
    return number


def complete_month(value, as_of=None):
    as_of = as_of or datetime.now(timezone.utc).date()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        raise ValueError(f"Invalid monthly period: {value}")
    return value < as_of.strftime("%Y-%m")


def monthly_series(rows, field, as_of=None):
    indexed = {}
    for row in rows:
        if not complete_month(row["month"], as_of):
            continue
        if row["month"] in indexed:
            raise ValueError(f"Duplicate {field} observation: {row['month']}")
        value = row[field]
        if value is not None and value > 0:
            indexed[row["month"]] = row
    if len(indexed) < 2:
        raise ValueError(f"Too few valid {field} observations")
    return [indexed[month] for month in sorted(indexed)][-600:]


def latest_headline(rows, field, unit):
    last = rows[-1]
    year, month = map(int, last["month"].split("-"))
    previous_month = f"{year-1}-12" if month == 1 else f"{year}-{month-1:02d}"
    prior = next((row[field] for row in rows if row["month"] == previous_month), None)
    change = round((last[field] / prior - 1) * 100, 4) if prior else None
    return {"value": last[field], "momPct": change, "period": last["month"], "unit": unit}


def xlsx_rows(content, sheet_name):
    """Resolve sheet by name, not ordinal (providers may add hidden sheets)."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if sum(item.file_size for item in archive.infolist()) > 100_000_000:
            raise ValueError("Expanded workbook exceeds size limit")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        sheets = ET.fromstring(archive.read("xl/workbook.xml")).find("s:sheets", NS)
        sheet = next((node for node in sheets if node.get("name") == sheet_name), None)
        if sheet is None:
            raise ValueError(f"Missing workbook sheet: {sheet_name}")
        relationship = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        links = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(node.get("Target") for node in links if node.get("Id") == relationship)
        path = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        rows = []
        for row in ET.fromstring(archive.read(path)).findall(".//s:row", NS):
            values = {}
            for cell in row:
                column = re.sub(r"\d", "", cell.get("r", ""))
                value = cell.findtext("s:v", None, NS)
                if cell.get("t") == "s" and value is not None:
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                values[column] = value
            rows.append(values)
        return rows


def parse_world_bank(content, as_of=None):
    rows = xlsx_rows(content, "Monthly Prices")
    clean = lambda value: str(value or "").replace("**", "").strip()
    header_index = next((i for i, row in enumerate(rows) if "Crude oil, Brent" in row.values()), None)
    if header_index is None:
        raise ValueError("World Bank price columns changed")
    columns = {clean(value): key for key, value in rows[header_index].items() if value}
    specifications = [
        ("brent", "Crude oil, Brent", "Brent 原油", "($/bbl)"),
        ("urea", "Urea", "尿素", "($/mt)"),
        ("dap", "DAP", "磷酸二铵 DAP", "($/mt)"),
        ("tsp", "TSP", "重过磷酸钙 TSP", "($/mt)"),
        ("potash", "Potassium chloride", "氯化钾", "($/mt)"),
        ("wheat", "Wheat, US HRW", "小麦（美国硬红冬麦）", "($/mt)"),
        ("maize", "Maize", "玉米", "($/mt)"),
        ("rice", "Rice, Thai 5%", "大米（泰国 5% 破碎率）", "($/mt)"),
        ("soybeans", "Soybeans", "大豆", "($/mt)"),
    ]
    for _, name, _, expected_unit in specifications:
        if name not in columns or clean(rows[header_index+1].get(columns[name])) != expected_unit:
            raise ValueError(f"World Bank column or unit changed: {name}")
    observations = []
    for row in rows[header_index+2:]:
        period = str(row.get("A") or "")
        if not re.fullmatch(r"\d{4}M\d{2}", period):
            continue
        observation = {"month": period.replace("M", "-")}
        for key, name, _, _ in specifications:
            observation[key] = numeric(row.get(columns[name]))
        observations.append(observation)
    series = {key: monthly_series(observations, key, as_of) for key, *_ in specifications}
    latest = series["brent"][-1]["month"]
    if any(values[-1]["month"] != latest for values in series.values()):
        raise ValueError("World Bank latest commodity cells incomplete")
    headline = {key: latest_headline(series[key], key, "USD / barrel" if key == "brent" else "USD / mt")
                for key in ("brent", "urea")}
    table = []
    for key, name, chinese, _ in specifications[1:]:
        point = latest_headline(series[key], key, "USD / mt")
        table.append({"nameEn": name, "nameZh": chinese, "price": point["value"],
                      "period": point["period"], "momPct": point["momPct"], "unit": point["unit"]})
    return {"monthly": [{"month": row["month"], **{key: row[key] for key, *_ in specifications}}
                        for row in series["brent"]], "headline": headline,
            "fertilizers": table[:4], "agriculture": table[4:]}


def parse_fao(content, as_of=None):
    text = content.decode("utf-8-sig") if isinstance(content, bytes) else content
    rows = list(csv.reader(io.StringIO(text)))
    if "2014-2016=100" not in text.replace(" ", ""):
        raise ValueError("FAO index base changed")
    header_index = next((i for i, row in enumerate(rows) if len(row) > 1 and
                         row[0].strip() == "Date" and row[1].strip() == "Food Price Index"), None)
    if header_index is None:
        raise ValueError("FAO monthly CSV header changed")
    observations = [{"month": row[0].strip(), "fao": numeric(row[1])} for row in rows[header_index+1:]
                    if len(row) > 1 and row[0].strip()]
    series = monthly_series(observations, "fao", as_of)
    return {"monthly": series, "headline": latest_headline(series, "fao", "2014–2016 = 100")}


def parse_eia(text, as_of=None):
    if isinstance(text, bytes):
        text = text.decode("utf-8-sig")
    if "Dollars per Barrel" not in text:
        raise ValueError("EIA unit or table changed")
    observations = []
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", text, re.S | re.I):
        year_match = re.search(r"<td\b[^>]*class=['\"]B4['\"][^>]*>(.*?)</td>", row, re.S | re.I)
        if not year_match:
            continue
        year = unescape(re.sub(r"<[^>]+>", "", year_match[1])).strip()
        if not re.fullmatch(r"\d{4}", year):
            continue
        cells = re.findall(r"<td\b[^>]*class=['\"]B3['\"][^>]*>(.*?)</td>", row, re.S | re.I)
        if len(cells) != 12:
            raise ValueError("EIA monthly table no longer has twelve columns")
        for month, cell in enumerate(cells, 1):
            value = numeric(unescape(re.sub(r"<[^>]+>", "", cell)))
            observations.append({"month": f"{year}-{month:02d}", "brent": value})
    series = monthly_series(observations, "brent", as_of)
    return {"monthly": series, "headline": latest_headline(series, "brent", "USD / barrel")}


def wrap(data, label, homepage, download_url, period, unit, methodology):
    return {"source": {"label": label, "url": homepage, "downloadUrl": download_url,
                       "period": period, "unit": unit, "methodology": methodology}, "data": data}


def fetch_world_bank():
    data = parse_world_bank(download(WB_URL))
    return wrap(data, "World Bank · Pink Sheet", "https://www.worldbank.org/en/research/commodity-markets",
                WB_URL, data["headline"]["urea"]["period"], "USD / mt; Brent: USD / barrel",
                "Nominal monthly commodity benchmarks; percentage changes use adjacent calendar months, not trading quotes.")


def fetch_fao():
    data = parse_fao(download(FAO_URL))
    return wrap(data, "FAO · Food Price Index", "https://www.fao.org/worldfoodsituation/foodpricesindex/en/",
                FAO_URL, data["headline"]["period"], "2014–2016 = 100",
                "Nominal export-weighted food price index. Recent meat inputs mix projected and observed prices; the index can be revised.")


def fetch_eia():
    data = parse_eia(download(EIA_URL))
    return wrap(data, "EIA · Brent", EIA_URL, EIA_URL, data["headline"]["period"], "USD / barrel",
                "Europe Brent spot price FOB, published monthly averages. Not a real-time or futures quote.")


EU_MEMBERS = {"Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
              "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
              "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
              "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden"}


def parse_usda(content, as_of=None, commodity_code="410000"):
    as_of = as_of or datetime.now(timezone.utc).date()
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        info = archive.getinfo("psd_grains_pulses.csv")
        if info.file_size > 150_000_000:
            raise ValueError("Expanded USDA dataset exceeds size limit")
        reader = csv.DictReader(io.StringIO(archive.read(info).decode("utf-8-sig")))
        required = {"Commodity_Code", "Country_Name", "Country_Code", "Market_Year", "Calendar_Year", "Month",
                    "Attribute_Description", "Unit_Description", "Value"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("USDA bulk CSV columns changed")
        attributes = {"Production": "production", "Domestic Consumption": "consumption", "Ending Stocks": "endingStocks"}
        years = {}
        released = set()
        for row in reader:
            if row["Commodity_Code"].lstrip("0") != commodity_code or row["Attribute_Description"] not in attributes:
                continue
            year = int(row["Market_Year"])
            # Start at 2000: avoid predecessor-state and EU-15-era aggregation.
            # Use the provider's contemporary EU aggregate for each year.
            if year < 2000 or year > as_of.year:
                continue
            release = f"{int(row['Calendar_Year']):04d}-{int(row['Month']):02d}"
            if release > as_of.strftime("%Y-%m"):
                raise ValueError("USDA data has a future release month")
            released.add(release)
            if row["Unit_Description"].strip().upper() != "(1000 MT)":
                raise ValueError("USDA grain quantity unit changed")
            value = numeric(row["Value"])
            if value is None or value < 0:
                raise ValueError("Missing or negative USDA grain quantity")
            country = years.setdefault(year, {}).setdefault(row["Country_Name"], {})
            attribute = attributes[row["Attribute_Description"]]
            if attribute in country:
                raise ValueError("Duplicate USDA country/year/attribute")
            country[attribute] = value
    history = []
    for year, countries in sorted(years.items()):
        if "World" in countries:
            chosen = {"World": countries["World"]}
        else:
            # Current PSD uses the EU-27 aggregate plus a separate UK series.
            # Never count EU member rows again if an EU aggregate is supplied.
            chosen = {name: values for name, values in countries.items()
                      if name != "EU-15" and not ("European Union" in countries and name in EU_MEMBERS)}
        if not chosen or any(set(values) != set(attributes.values()) for values in chosen.values()):
            raise ValueError("Incomplete USDA country supply/use/stocks rows")
        totals = {key: sum(values[key] for values in chosen.values()) for key in attributes.values()}
        if totals["consumption"] <= 0 or totals["production"] <= 0:
            raise ValueError("Invalid USDA global denominator/production")
        china = countries.get("China")
        excluding_china = None
        if china and set(china) == set(attributes.values()):
            rest = {key: totals[key] - china[key] for key in totals}
            if any(value < 0 for value in rest.values()) or rest["consumption"] <= 0:
                raise ValueError("Invalid USDA ex-China quantities")
            excluding_china = {**rest, "ratio": round(rest["endingStocks"] / rest["consumption"] * 100, 4)}
        history.append({"year": f"{year}/{year+1}", **totals,
                        "ratio": round(totals["endingStocks"] / totals["consumption"] * 100, 4),
                        "excludingChina": excluding_china,
                        "countryAreaCount": len(chosen)})
    if len(history) < 2 or any(int(b["year"][:4])-int(a["year"][:4]) != 1
                               for a, b in zip(history, history[1:])):
        raise ValueError("USDA requires consecutive market years")
    return {"latestPeriod": history[-1]["year"], "stockToUse": history[-1]["ratio"],
            "priorStockToUse": history[-2]["ratio"], "history": history,
            "releasePeriod": max(released), "unit": "1000 metric tons; ratio: %",
            "methodology": "World grain totals calculated from USDA PSD country/area records since 2000. The supplied EU aggregate is counted once per year; separate UK records are included only when supplied. EU coverage changes over history. Ending stocks / domestic consumption × 100. Ex-China subtracts China from BOTH stocks and consumption; it is not an estimate of exportable stocks. Marketing years vary by country; figures include forecasts and revisions. Rice is on a milled basis."}


def fetch_usda():
    content = download(USDA_URL)
    grains = {key: parse_usda(content, commodity_code=code) for key, code in
              (("wheat", "410000"), ("maize", "440000"), ("rice", "422110"))}
    if len({grain["latestPeriod"] for grain in grains.values()}) != 1:
        raise ValueError("USDA grain marketing years are not aligned")
    # Keep the legacy wheat shape for existing cards and consumers.
    data = {**grains["wheat"], "grains": grains}
    return wrap(data, "USDA · PSD", "https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads",
                USDA_URL, data["latestPeriod"], data["unit"], data["methodology"])
