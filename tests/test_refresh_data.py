import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_data import refresh_bundle, write_cache, validate_result


def fixture(value=130, period="2026-07"):
    return {"source": {"label": "FAO", "url": "https://www.fao.org/", "period": period,
                       "unit": "index"},
            "data": {"headline": {"value": value, "period": period,"unit":"index","momPct":0},
                     "monthly":[{"month":"2026-05","fao":100,"brent":80},
                                {"month":"2026-06","fao":110,"brent":85}]}}


class RefreshTests(unittest.TestCase):
    def usda_previous(self):
        bundle = json.loads((Path(__file__).resolve().parents[1] / "tests/fixtures/official-data-baseline.json").read_text())
        return {"sources": {"usda": bundle["sources"]["usda"]}}

    def set_usda_vintage(self, record, vintage):
        record["data"]["releasePeriod"] = vintage
        for grain in record["data"].get("grains", {}).values():
            grain["releasePeriod"] = vintage
        return record

    def test_usda_older_publication_for_same_market_year_preserves_data_and_fetch_time(self):
        previous = self.usda_previous()
        incoming = self.set_usda_vintage(copy.deepcopy(previous["sources"]["usda"]), "2026-08")
        untouched = copy.deepcopy(previous)
        result, failures = refresh_bundle(previous, {"usda": lambda: incoming}, "2026-10-04T13:00:00Z")
        self.assertIn("usda", failures)
        retained = result["sources"]["usda"]
        self.assertEqual(retained["status"], "error")
        self.assertEqual(retained["data"], previous["sources"]["usda"]["data"])
        self.assertEqual(retained["fetchedAt"], previous["sources"]["usda"]["fetchedAt"])
        self.assertEqual(retained["lastAttemptAt"], "2026-10-04T13:00:00Z")
        self.assertEqual(previous, untouched)

    def test_usda_newer_publication_for_same_market_year_is_accepted(self):
        previous = self.usda_previous()
        incoming = self.set_usda_vintage(copy.deepcopy(previous["sources"]["usda"]), "2026-10")
        result, failures = refresh_bundle(previous, {"usda": lambda: incoming}, "2026-10-04T13:00:00Z")
        self.assertFalse(failures)
        self.assertEqual(result["sources"]["usda"]["data"]["latestPeriod"], "2026/2027")
        self.assertEqual(result["sources"]["usda"]["data"]["releasePeriod"], "2026-10")
        self.assertEqual(result["sources"]["usda"]["refreshKind"], "new-publication")

    def test_usda_same_vintage_revision_is_identified_and_allowed(self):
        previous = self.usda_previous()
        incoming = copy.deepcopy(previous["sources"]["usda"])
        incoming["data"]["grains"]["rice"]["history"][-1]["production"] += 100
        result, failures = refresh_bundle(previous, {"usda": lambda: incoming}, "2026-10-04T13:00:00Z")
        self.assertFalse(failures)
        record = result["sources"]["usda"]
        self.assertEqual(record["refreshKind"], "same-vintage-revision")
        grain = record["data"]["grains"]["rice"]
        self.assertEqual(grain["observationId"], "usda-psd/422110/2026/2027")
        self.assertRegex(grain["revisionId"], r"^[a-f0-9]{64}$")
        self.assertEqual(grain["releasePeriod"], previous["sources"]["usda"]["data"]["releasePeriod"])

    def test_usda_missing_invalid_future_or_mixed_vintages_cannot_replace_cache(self):
        previous = self.usda_previous()
        for vintage in (None, "", "2026-13", "2026-9", "2027-01"):
            incoming = self.set_usda_vintage(copy.deepcopy(previous["sources"]["usda"]), vintage)
            result, failures = refresh_bundle(previous, {"usda": lambda: incoming}, "2026-10-04T13:00:00Z")
            self.assertIn("usda", failures)
            self.assertEqual(result["sources"]["usda"]["data"], previous["sources"]["usda"]["data"])
        incoming = self.set_usda_vintage(copy.deepcopy(previous["sources"]["usda"]), "2026-10")
        incoming["data"]["grains"]["rice"]["releasePeriod"] = "2026-08"
        _, failures = refresh_bundle(previous, {"usda": lambda: incoming}, "2026-10-04T13:00:00Z")
        self.assertIn("usda", failures)

    def test_usda_unchanged_data_and_legacy_wheat_cache_remain_supported(self):
        previous = self.usda_previous()
        for legacy in (False, True):
            snapshot = copy.deepcopy(previous)
            if legacy:
                snapshot["sources"]["usda"]["data"].pop("grains")
            result, failures = refresh_bundle(snapshot, {"usda": lambda: copy.deepcopy(snapshot["sources"]["usda"])}, "2026-10-04T13:00:00Z")
            self.assertFalse(failures)
            self.assertEqual(result["sources"]["usda"]["refreshKind"], "unchanged")
            self.assertEqual(result["sources"]["usda"]["data"]["observationId"], "usda-psd/410000/2026/2027")

    def test_usda_revision_fingerprint_must_match_corrected_content(self):
        previous = self.usda_previous()
        accepted, failures = refresh_bundle(previous, {"usda": lambda: copy.deepcopy(previous["sources"]["usda"])}, "2026-10-04T13:00:00Z")
        self.assertFalse(failures)
        incoming = copy.deepcopy(accepted["sources"]["usda"])
        rice = incoming["data"]["grains"]["rice"]
        rice["history"][-1]["production"] += 100
        _, failures = refresh_bundle(accepted, {"usda": lambda: incoming}, "2026-10-04T14:00:00Z")
        self.assertIn("usda", failures)
        from macro_sources import usda_identity
        rice.update(usda_identity(rice, "422110"))
        revised, failures = refresh_bundle(accepted, {"usda": lambda: incoming}, "2026-10-04T14:00:00Z")
        self.assertFalse(failures)
        self.assertEqual(revised["sources"]["usda"]["refreshKind"], "same-vintage-revision")

    def test_usda_marketing_year_change_cannot_bypass_publication_check(self):
        previous = self.usda_previous()
        for shift,vintage in ((1,"2026-08"),(-1,"2026-10"),(1,"2026-10")):
            incoming = self.set_usda_vintage(copy.deepcopy(previous["sources"]["usda"]), vintage)
            data = incoming["data"]
            observations = [data,*data["grains"].values()]
            seen = set()
            for observation in observations:
                observation["latestPeriod"] = f"{2026+shift}/{2027+shift}"
                for row in observation["history"]:
                    if id(row) in seen: continue
                    seen.add(id(row))
                    year = int(row["year"][:4])+shift
                    row["year"] = f"{year}/{year+1}"
            incoming["source"]["period"] = data["latestPeriod"]
            result, failures = refresh_bundle(previous, {"usda": lambda: incoming}, "2026-10-04T13:00:00Z")
            if shift<0 or vintage=="2026-08":
                self.assertIn("usda",failures)
                self.assertEqual(result["sources"]["usda"]["data"],previous["sources"]["usda"]["data"])
            else:
                self.assertFalse(failures)
                self.assertEqual(result["sources"]["usda"]["refreshKind"],"new-market-year")

    def test_usda_invalid_identity_or_source_market_year_is_rejected(self):
        previous = self.usda_previous()
        for location in ("source","root","grain"):
            incoming = copy.deepcopy(previous["sources"]["usda"])
            if location=="source":
                incoming["source"]["period"]="2025/2026"
            elif location=="root":
                incoming["data"]["observationId"]="usda-psd/410000/2025/2026"
            else:
                incoming["data"]["grains"]["rice"]["revisionId"]="0"*64
            result, failures = refresh_bundle(previous,{"usda":lambda:incoming},"2026-10-04T13:00:00Z")
            self.assertIn("usda",failures)
            self.assertEqual(result["sources"]["usda"]["data"],previous["sources"]["usda"]["data"])

    def test_extended_grains_validate_and_bad_extension_retains_full_cache(self):
        previous = json.loads((Path(__file__).resolve().parents[1] / "tests/fixtures/official-data-baseline.json").read_text())
        original = previous["sources"]["usda"]
        self.assertEqual(validate_result(original,"usda"),original)
        for field,value in (("consumption",0),("ratio",999),("year","2024/2025")):
            bad = copy.deepcopy(original)
            bad["data"]["grains"]["rice"]["history"][-1][field] = value
            result, failures = refresh_bundle(previous,{"usda":lambda:bad},"test-attempt")
            self.assertIn("usda",failures)
            self.assertEqual(result["sources"]["usda"]["data"],original["data"])
            self.assertEqual(result["sources"]["usda"]["fetchedAt"],original["fetchedAt"])

    def test_independent_failure_retains_last_success_and_original_input(self):
        previous = {"sources": {"fao": dict(fixture(), fetchedAt="old", status="ok")}}
        untouched = copy.deepcopy(previous)
        def fail():
            raise TimeoutError("offline")
        result, failures = refresh_bundle(previous, {"fao": fail, "eia": fixture}, "new")
        self.assertEqual(previous, untouched)
        self.assertEqual(result["sources"]["fao"]["data"], previous["sources"]["fao"]["data"])
        self.assertEqual(result["sources"]["fao"]["fetchedAt"], "old")
        self.assertEqual(result["sources"]["fao"]["lastAttemptAt"], "new")
        self.assertEqual(result["sources"]["eia"]["status"], "ok")
        self.assertIn("fao", failures)

    def test_rejects_nan_and_regressed_period(self):
        previous = {"sources": {"fao": dict(fixture(), fetchedAt="old")}}
        for bad in (fixture(float("nan")), fixture(period="2026-06"), {}):
            result, failures = refresh_bundle(previous, {"fao": lambda: bad}, "new")
            self.assertIn("fao", failures)
            self.assertEqual(result["sources"]["fao"]["fetchedAt"], "old")

    def test_first_failure_does_not_invent_success(self):
        result, failures = refresh_bundle({"sources": {}}, {"fao": lambda: {}}, "now")
        self.assertIn("fao", failures)
        self.assertNotIn("fetchedAt", result["sources"]["fao"])
        self.assertNotIn("data", result["sources"]["fao"])

    def test_nonempty_malformed_data_cannot_replace_good_cache(self):
        previous = {"sources": {"eia": dict(fixture(), fetchedAt="old")}}
        invalid = fixture()
        invalid["data"]["monthly"] = []
        result, failures = refresh_bundle(previous, {"eia": lambda: invalid}, "new")
        self.assertIn("eia", failures)
        self.assertEqual(result["sources"]["eia"]["data"], previous["sources"]["eia"]["data"])
        self.assertEqual(result["sources"]["eia"]["fetchedAt"], "old")

    def test_success_clears_previous_error_and_writes_valid_json(self):
        previous = {"sources": {"fao": {"status": "error", "error": "old"}}}
        result, failures = refresh_bundle(previous, {"fao": fixture}, "now")
        self.assertFalse(failures)
        self.assertNotIn("error", result["sources"]["fao"])
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "official-data.json"
            write_cache(target, result)
            self.assertEqual(json.loads(target.read_text()), result)
            self.assertEqual(list(Path(folder).iterdir()), [target])


if __name__ == "__main__":
    unittest.main()
