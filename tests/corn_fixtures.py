"""Offline fixtures: annual values transcribed from NASS Jan 12 2026 corn tables.
Weekly/weather cases are explicitly synthetic, never published as observations.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_corn import CONFIG, REGIONS, parse_production, parse_progress, power_url, accept

NOW = "2026-07-25T12:00:00Z"
VALUES = {
    "IA": (13200, 210, 2772000), "IL": (11000, 214, 2354000), "NE": (10450, 194, 2027300),
    "MN": (8450, 201, 1698450), "IN": (5230, 204, 1066920), "SD": (6350, 171, 1085850),
    "KS": (6500, 145, 942500), "OH": (3160, 185, 584600), "MO": (3660, 185, 677100),
    "WI": (3220, 188, 605360), "US": (91258, 186.5, 17020549),
}
NAMES = {r["id"]: r["name"]["en"] for r in REGIONS} | {"US": "United States"}


def annual_text():
    title = "Corn Area Planted for All Purposes and Harvested for Grain, Yield, and Production -\nStates and United States: 2023-2025"
    header = "\n State :\n : 2023 : 2024 : 2025 : 2023 : 2024 : 2025\n"
    area = "\n".join(f"{NAMES[k]} ...: {a} {a} {a} {a} {a} {a}" for k, (a, y, p) in VALUES.items())
    production = "\n".join(f"{NAMES[k]} ...: {y} {y} {y} {p} {p} {p}" for k, (a, y, p) in VALUES.items())
    return "This report was approved on January 12, 2026.\n" + title + header + "1,000 acres\n" + area + "\n" + title + " (continued)" + header + "Yield per acre : Production\n1,000 bushels\n" + production + "\n"


def progress_text(week="2026-07-19", good=60):
    d = date.fromisoformat(week)
    issued = (d+timedelta(days=1)).strftime("%B %d, %Y")
    dates = [d.replace(year=d.year-1), d-timedelta(days=7), d]
    prefix = f"Released {issued}, by the National Agricultural Statistics Service\n"
    for stage, value in (("Silking", 75), ("Dough", 20)):
        prefix += f"Corn {stage} - Selected States\n State :"+":".join(x.strftime("%B %d,") for x in dates)+": Average\n :"+":".join(str(x.year) for x in dates)+": Average\npercent\n"
        prefix += "\n".join(f"{r['name']['en']} ...: 50 60 {value} 55" for r in REGIONS)+"\n"
    prefix += f"Corn Condition - Selected States: Week Ending {d.strftime('%B %d, %Y')}\n State : Very poor : Poor : Fair : Good : Excellent\npercent\n"
    prefix += "\n".join(f"{r['name']['en']} ...: 5 10 {75-good} {good} 10" for r in REGIONS)+"\n- Represents zero.\n"
    return prefix


def fixture():
    def record(key, data):
        return {"data": data, "source": {"url": CONFIG["productionSource" if key == "cornProduction" else "progressSource"],
            "downloadUrl": "https://esmis.nal.usda.gov/sites/default/release-files/1/fixture.txt", "period": data.get("year") or data["weekEnding"]}}
    production = accept("cornProduction", {}, NOW, lambda: record("cornProduction", parse_production(annual_text())))
    previous = accept("cornProgress", {}, NOW, lambda: record("cornProgress", parse_progress(progress_text("2026-07-12", 65))))
    progress = accept("cornProgress", previous, NOW, lambda: record("cornProgress", parse_progress(progress_text())))
    pilot = {"schemaVersion": 1, "sources": {"cornProduction": production, "cornProgress": progress}, "weather": {}, "baselines": {}}
    for r in REGIONS:
        start, end = date(2026, 7, 8), date(2026, 7, 21)
        days = [{"date": (start+timedelta(days=i)).isoformat(), "max": 30, "min": 20, "rain": 4, "rootWetness": .6, "surfaceWetness": .5} for i in range(14)]
        pilot["weather"][r["id"]] = accept("weather", {}, NOW, lambda: {"url": power_url(r, start, end), "days": days}, point_id=f"corn-{r['id']}")
        windows = {(date(2001, 1, 1)+timedelta(days=i)).strftime("%m-%d"): {"samples": 30, "maxMean": 30, "rainMean": 28, "rainP20": 10, "rootMean": .6, "rootP20": .3} for i in range(365)}
        url = power_url(r, date(1990, 12, 26), date(2020, 12, 31))
        pilot["baselines"][r["id"]] = accept("cornBaseline", {}, NOW, lambda: {"source": {"url": url, "downloadUrl": url, "period": "1991-2020"}, "data": {
            "baseline": "1991-2020", "windowDays": 7, "lat": r["lat"], "lon": r["lon"], "rawHash": "a"*64, "windows": windows}}, point_id=r["id"])
    return pilot


if __name__ == "__main__":
    print(json.dumps(fixture()))
