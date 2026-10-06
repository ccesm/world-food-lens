import copy
import unittest
from datetime import date, timedelta
from corn_fixtures import *
from refresh_corn import baseline_windows, report_links, power_days
from data_contract import valid_metadata


class CornIngestionTests(unittest.TestCase):
    def test_annual_official_values_and_coverage(self):
        d = parse_production(annual_text())
        self.assertEqual(d["national"]["production"], 17020549)
        self.assertEqual(d["regions"]["IA"]["production"], 2772000)
        self.assertAlmostEqual(sum(r["production"] for r in d["regions"].values())/d["national"]["production"], .81161189336)

    def test_missing_state_and_wrong_units_fail(self):
        for text in (annual_text().replace("Iowa", "Missing"), annual_text().replace("1,000 bushels", "tons"), annual_text().replace("2023 : 2024 : 2025", "2025 : 2024 : 2023")):
            with self.assertRaises(ValueError):
                parse_production(text)

    def test_progress_correct_column_and_condition(self):
        d = parse_progress(progress_text())
        self.assertEqual(d["weekEnding"], "2026-07-19")
        self.assertEqual(d["regions"]["IA"]["progress"], {"silking": 75, "dough": 20})
        self.assertEqual(d["regions"]["IA"]["condition"]["good"], 60)

    def test_missing_stage_not_zero(self):
        d = parse_progress(progress_text())
        self.assertNotIn("mature", d["regions"]["IA"]["progress"])

    def test_bad_week_columns_coverage_condition_fail(self):
        for text in (progress_text().replace("2025:2026:2026", "2026:2025:2026"),
                     progress_text().replace("South Dakota", "Missing"), progress_text().replace("5 10 15 60 10", "5 10 15 61 10"),
                     progress_text().replace("Corn Dough", "Corn Silking"), ""):
            with self.assertRaises(ValueError):
                parse_progress(text)

    def test_regression_retains_original_fetch_and_observation(self):
        original = fixture()["sources"]["cornProgress"]
        older = copy.deepcopy(original)
        older["data"]["weekEnding"] = "2026-07-12"
        got = accept("cornProgress", original, "2026-07-26T12:00:00Z", lambda: older)
        self.assertEqual(got["data"], original["data"])
        self.assertEqual(got["fetchedAt"], original["fetchedAt"])
        self.assertEqual(got["metadata"]["attempt"]["reason"], "publication_regression")
        self.assertEqual(got["metadata"]["observation"], original["metadata"]["observation"])
        self.assertTrue(valid_metadata(got["metadata"]))

    def test_retrieval_failure_retains_without_faking_validation(self):
        original = fixture()["weather"]["IA"]
        def fail():
            raise OSError("offline")
        got = accept("weather", original, "2026-07-26T12:00:00Z", fail, point_id="corn-IA")
        self.assertEqual(got["fetchedAt"], original["fetchedAt"])
        self.assertEqual(got["metadata"]["attempt"]["retrieval"], "failed")
        self.assertTrue(valid_metadata(got["metadata"]))

    def test_same_week_correction_and_history(self):
        original = fixture()["sources"]["cornProgress"]
        def revised():
            out = copy.deepcopy(original)
            out["data"] = parse_progress(progress_text(good=61))
            return out
        got = accept("cornProgress", original, NOW, revised)
        self.assertEqual(got["status"], "ok")
        self.assertEqual(len(got["data"]["history"]), 2)
        self.assertNotEqual(got["metadata"]["version"]["contentHash"], original["metadata"]["version"]["contentHash"])

    def test_fixed_calendar_baseline_and_missing_day(self):
        start, end = date(1990, 12, 26), date(2020, 12, 31)
        days = [{"date": (start+timedelta(days=i)).isoformat(), "max": 30, "rain": 2, "rootWetness": .5} for i in range((end-start).days+1)]
        windows = baseline_windows(days)
        self.assertEqual(len(windows), 365)
        self.assertNotIn("02-29", windows)
        self.assertEqual(windows["01-01"]["rainMean"], 14)
        self.assertEqual(windows["07-21"]["samples"], 30)
        with self.assertRaises(ValueError):
            baseline_windows(days[:100]+days[101:])

    def test_links_allow_only_official_release_files(self):
        html = '<a href="/sites/default/release-files/1/prog3926.txt">TXT</a>'
        self.assertEqual(report_links(html, "prog"), ["https://esmis.nal.usda.gov/sites/default/release-files/1/prog3926.txt"])
        self.assertEqual(report_links(html.replace("prog3926", "prog3826_0"), "prog"), ["https://esmis.nal.usda.gov/sites/default/release-files/1/prog3826_0.txt"])
        with self.assertRaises(ValueError):
            report_links(html.replace('/sites', 'https://example.com/sites'), "prog")

    def test_canonical_metadata_on_all_sources(self):
        for group in fixture().values():
            if isinstance(group, dict):
                for record in group.values():
                    self.assertTrue(valid_metadata(record["metadata"]))

    def test_wrong_power_geometry_fails_before_interpretation(self):
        with self.assertRaisesRegex(ValueError, "location"):
            power_days(json.dumps({"geometry": {"coordinates": [0, 0]}}), REGIONS[0], date(2026, 7, 1), date(2026, 7, 7))

    def test_older_weather_cannot_replace_newer_window(self):
        old = fixture()["weather"]["IA"]
        earlier = copy.deepcopy(old)
        earlier["days"] = earlier["days"][:-1]
        got = accept("weather", old, "2026-07-26T12:00:00Z", lambda: earlier, point_id="corn-IA")
        self.assertEqual(got["days"], old["days"])
        self.assertEqual(got["metadata"]["attempt"]["reason"], "publication_regression")


if __name__ == "__main__":
    unittest.main()
