import copy
import unittest
from datetime import date
from test_macro_sources import usda_zip
from macro_sources import parse_usda
from usda_coverage import assess_coverage
from refresh_data import refresh_bundle


def grain(**kwargs):
    return parse_usda(usda_zip(**kwargs), date(2026, 10, 4))


def record(data):
    return {"source": {"label": "USDA", "url": "https://apps.fas.usda.gov/", "period": data["latestPeriod"], "unit": "1000 MT"},
            "data": data, "status": "ok", "fetchedAt": "2026-10-03T12:00:00Z"}


class CoverageTests(unittest.TestCase):
    def test_normal_vintage_and_same_identity_renaming(self):
        old, new = grain(), grain(release_month="10")
        for entry in new["coverage"].values():
            entry["contributors"][0]["name"] = "Display-name correction"
        result = assess_coverage(new, old)
        self.assertEqual(result["state"], "compared")
        self.assertTrue(all(row["retainedShares"]["production"] == 1 for row in result["comparisons"]))

    def test_missing_country_with_plausible_ratio_is_quarantined_and_cache_retained(self):
        old, new = grain(), grain(omit_country="United Kingdom")
        self.assertEqual(old["stockToUse"], new["stockToUse"])
        with self.assertRaisesRegex(ValueError, "coverage"):
            assess_coverage(new, old)
        previous = {"sources": {"usda": record(old)}}
        untouched = copy.deepcopy(previous)
        result, errors = refresh_bundle(previous, {"usda": lambda: record(new)}, "2026-10-04T12:00:00Z")
        self.assertIn("usda", errors)
        self.assertEqual(result["sources"]["usda"]["data"], old)
        self.assertEqual(result["sources"]["usda"]["fetchedAt"], previous["sources"]["usda"]["fetchedAt"])
        self.assertEqual(result["sources"]["usda"]["metadata"]["attempt"]["reason"], "coverage_incomplete")
        self.assertEqual(previous, untouched)

    def test_china_loss_and_legacy_bootstrap_count_loss_rejected(self):
        old, new = grain(), grain(omit_country="China")
        with self.assertRaisesRegex(ValueError, "coverage"):
            assess_coverage(new, old)
        del old["coverage"]
        with self.assertRaisesRegex(ValueError, "bootstrap"):
            assess_coverage(new, old)

    def test_legitimate_small_composition_changes_and_additions(self):
        old = grain()
        for year, entry in old["coverage"].items():
            entry["contributors"] += [{"id": f"usda-psd:zero-{n}", "name": "zero", "production": 0, "consumption": 0, "endingStocks": 0} for n in range(10)]
            entry["count"] = len(entry["contributors"])
        new = copy.deepcopy(old)
        for entry in new["coverage"].values():
            entry["contributors"].pop()
            entry["count"] -= 1
        result = assess_coverage(new, old)
        self.assertTrue(all(len(row["missingIds"]) == 1 and row["retainedShares"]["production"] == 1 for row in result["comparisons"]))
        self.assertEqual(assess_coverage(old, new)["state"], "compared")

    def test_changed_values_must_reconcile_and_metadata_cannot_disappear(self):
        old, new = grain(), grain()
        new["coverage"][new["latestPeriod"]]["contributors"][0]["production"] += 1
        with self.assertRaisesRegex(ValueError, "reconcile"):
            assess_coverage(new, old)
        del new["coverage"]
        with self.assertRaisesRegex(ValueError, "disappeared"):
            assess_coverage(new, old)

    def test_authoritative_world_totals_allow_aggregation_basis_change(self):
        old, new = grain(), grain()
        for row in new["history"]:
            entry = new["coverage"][row["year"]]
            totals = {f: row[f] for f in ("production", "consumption", "endingStocks")}
            entry.update(basis="official-world", count=1, officialTotals=totals,
                         contributors=[{"id": "usda-psd:world", "name": "World", **totals}])
        result = assess_coverage(new, old)
        self.assertTrue(all(row["state"] == "official-total" for row in result["comparisons"]))
