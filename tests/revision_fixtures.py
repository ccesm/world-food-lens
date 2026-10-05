"""Phase 2 consumes real Phase 1 collector decisions; no network or file writes."""
import copy
import json
import sys
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from test_macro_sources import usda_zip
from macro_sources import parse_usda, usda_identity
from refresh_data import refresh_bundle


def record(**options):
    data = parse_usda(usda_zip(**options), date(2026, 10, 4))
    return {"source": {"label": "USDA", "url": "https://apps.fas.usda.gov/psdonline/",
                       "period": data["latestPeriod"], "unit": "1000 metric tons; ratio: %"}, "data": data}


initial, _ = refresh_bundle({}, {"usda": record}, "2026-10-03T12:00:00Z")
corrected = record()
for row in corrected["data"]["history"]:
    row["production"] += 1
    corrected["data"]["coverage"][row["year"]]["contributors"][0]["production"] += 1
    if row.get("excludingChina"):
        row["excludingChina"]["production"] += 1
corrected["data"].update(usda_identity(corrected["data"], "410000"))
revised, _ = refresh_bundle(initial, {"usda": lambda: copy.deepcopy(corrected)}, "2026-10-04T12:00:00Z")
missing, _ = refresh_bundle(initial, {"usda": lambda: record(omit_country="United Kingdom")}, "2026-10-04T12:00:00Z")
older, _ = refresh_bundle(initial, {"usda": lambda: record(release_month="08")}, "2026-10-04T12:00:00Z")
print(json.dumps({name: value["sources"]["usda"] for name, value in
                 (("initial", initial), ("revised", revised), ("missing", missing), ("older", older))}))
