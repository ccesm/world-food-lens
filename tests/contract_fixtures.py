"""Deterministic actual Python-ingestion output shared with Node contract tests."""
import copy
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_data import refresh_bundle
from data_contract import attach_metadata

STAMP = "2026-10-04T12:00:00Z"


def fixture():
    return {"source": {"label": "FAO", "url": "https://www.fao.org/", "downloadUrl": "https://www.fao.org/new.csv",
                       "period": "2026-09", "unit": "2014–2016 = 100"},
            "data": {"headline": {"period": "2026-09", "value": 110, "momPct": 10, "unit": "2014–2016 = 100"},
                     "monthly": [{"month": "2026-08", "fao": 100}, {"month": "2026-09", "fao": 110}]}}


def records():
    new, _ = refresh_bundle({}, {"fao": fixture}, "2026-10-03T12:00:00Z")
    unchanged, _ = refresh_bundle(new, {"fao": fixture}, STAMP)
    def fail():
        raise TimeoutError("offline")
    offline, _ = refresh_bundle(new, {"fao": fail}, STAMP)
    invalid = fixture()
    invalid["data"]["headline"]["value"] = -1
    semantic, _ = refresh_bundle(new, {"fao": lambda: invalid}, STAMP)
    structural, _ = refresh_bundle(new, {"fao": lambda: {}}, STAMP)
    older = fixture()
    older["source"]["period"] = older["data"]["headline"]["period"] = "2026-08"
    regression, _ = refresh_bundle(new, {"fao": lambda: older}, STAMP)
    return {k: copy.deepcopy(v["sources"]["fao"]) for k, v in
            (("new", new), ("unchanged", unchanged), ("offline", offline), ("semantic", semantic),
             ("structural", structural), ("regression", regression))}


if __name__ == "__main__":
    if "--all" in sys.argv:
        root = Path(__file__).resolve().parents[1] / "public/data"
        all_records = json.loads((root / "official-data.json").read_text())["sources"]
        for key in ("drought", "enso"):
            all_records[key] = json.loads((root / ("drought-monitor.json" if key == "drought" else "enso-outlook.json")).read_text())
        point_id, point = next(iter(json.loads((root / "local-weather.json").read_text())["points"].items()))
        all_records["weather"] = point
        for key, record in all_records.items():
            attach_metadata(record, key, point_id=point_id if key == "weather" else None)
        print(json.dumps(all_records))
    else:
        print(json.dumps(records()))
