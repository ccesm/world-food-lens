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
    def test_extended_grains_validate_and_bad_extension_retains_full_cache(self):
        previous = json.loads((Path(__file__).resolve().parents[1] / "public/data/official-data.json").read_text())
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
