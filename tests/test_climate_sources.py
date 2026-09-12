from datetime import date
from io import BytesIO
import unittest
from unittest.mock import patch

from scripts.climate_sources import fetch_noaa, parse_roni, RONI_URL


class ClimateSourcesTests(unittest.TestCase):
    def test_year_boundary_and_future_windows(self):
        data = parse_roni("SEAS YR ANOM\nNDJ 2025 -1.04\nDJF 2026 -0.91\nJFM 2026 0.5\n", as_of=date(2026, 3, 12))
        self.assertEqual(data["latest"]["period"], "2026 DJF")
        self.assertEqual(data["latest"]["startMonth"], "2025-12")
        self.assertEqual(data["latest"]["endMonth"], "2026-02")
        self.assertEqual(data["history"][0]["startMonth"], "2025-11")
        self.assertEqual(data["history"][0]["endMonth"], "2026-01")

    def test_missing_sentinels_and_gaps_are_not_plotted(self):
        data = parse_roni("SEAS YR ANOM\nDJF 2026 0\nJFM 2026 -99.9\nMAM 2026 NaN\nAMJ 2026 0.49\nMJJ 2026 99.99\n", as_of=date(2026, 9, 12))
        self.assertEqual(data["latest"]["period"], "2026 AMJ")
        self.assertEqual([row["value"] for row in data["history"]], [0.0, None, None, None, 0.49])
        self.assertEqual(data["history"][2]["season"], "FMA")

    def test_history_limit_sorting_and_recent_estimates(self):
        data = parse_roni("SEAS YR ANOM\nAMJ 2026 0.49\nDJF 2026 -0.91\nMJJ 2026 0.97\nJJA 2026 1.36\n", as_of=date(2026, 9, 12), history_limit=4)
        self.assertEqual([row["season"] for row in data["history"]], ["MAM", "AMJ", "MJJ", "JJA"])
        self.assertEqual([row["provisional"] for row in data["history"]], [False, True, True, True])
        self.assertEqual(data["latest"]["value"], 1.36)
        self.assertNotIn("ensoStatus", data)

    def test_fail_closed_on_format_duplicates_and_bad_values(self):
        for payload in ["<html>error</html>", "SEAS YR ANOM\nJJA 2026 12\n", "SEAS YR ANOM\nBAD 2026 1\n", "SEAS YR ANOM\nJJA 2026 1\nJJA 2026 2\n", "SEAS YR ANOM\nJJA 2026 1 extra\n", "SEAS YR ANOM\nJJA 2026 none\n"]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_roni(payload, as_of=date(2026, 9, 12))

    def test_no_completed_observation_is_not_success(self):
        for payload in ["SEAS YR ANOM\n", "SEAS YR ANOM\nJJA 2026 -99.9\n", "SEAS YR ANOM\nJAS 2026 1.4\n"]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_roni(payload, as_of=date(2026, 9, 12))

    def test_downloader_contract_and_provenance(self):
        with patch("scripts.climate_sources.urlopen", return_value=BytesIO(b"SEAS YR ANOM\nJJA 2026 1.36\n")) as mocked:
            result = fetch_noaa(as_of=date(2026, 9, 12))
        self.assertEqual(mocked.call_args.args[0].full_url, RONI_URL)
        self.assertEqual(result["source"]["period"], "2026 JJA")
        self.assertEqual(result["source"]["unit"], "°C")
        self.assertEqual(result["data"]["latest"]["value"], 1.36)
        self.assertNotIn("fetchedAt", result)

    def test_failed_download_propagates_to_cache_owner(self):
        with patch("scripts.climate_sources.urlopen", side_effect=OSError("offline")), self.assertRaises(OSError):
            fetch_noaa()


if __name__ == "__main__":
    unittest.main()
