"""Phase 0 Batch 2: retrieval failures never refresh last-good evidence."""
import copy
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from macro_sources import fetch_fao, FAO_URL, FAO_PAGE, fao_csv_url
from refresh_data import refresh_bundle
from refresh_weather import refresh

CSV = b"2014-2016=100\nDate,Food Price Index\n2026-08,100\n2026-09,110\n"
STAMP = "2026-10-04T12:00:00Z"


class SourceHealthTests(unittest.TestCase):
    def good(self):
        with patch("macro_sources.download", return_value=CSV):
            return fetch_fao()

    def test_successful_and_unchanged_fao_refresh_keep_observation_period(self):
        result, errors = refresh_bundle({}, {"fao": self.good}, "2026-10-03T12:00:00Z")
        self.assertFalse(errors)
        result2, errors = refresh_bundle(result, {"fao": self.good}, STAMP)
        self.assertFalse(errors)
        self.assertEqual(result2["sources"]["fao"]["source"]["period"], "2026-09")
        self.assertEqual(result2["sources"]["fao"]["data"], result["sources"]["fao"]["data"])
        self.assertEqual(result2["sources"]["fao"]["fetchedAt"], STAMP)

    def test_failed_check_and_invalid_response_preserve_all_success_timestamps(self):
        previous, _ = refresh_bundle({}, {"fao": self.good}, "2026-10-03T12:00:00Z")
        previous["sources"]["fao"]["source"]["publishedAt"] = "2026-10-02"
        untouched = copy.deepcopy(previous)
        for error, kind in [(HTTPError(FAO_URL, 404, "Not Found", {}, None), "retrieval"),
                            (TimeoutError("timeout"), "retrieval"),
                            (ValueError("Invalid CSV / unit"), "validation")]:
            def fail():
                raise error
            result, errors = refresh_bundle(previous, {"fao": fail}, STAMP)
            row = result["sources"]["fao"]
            self.assertIn("fao", errors)
            self.assertEqual(row["failureKind"], kind)
            self.assertEqual(row["data"], previous["sources"]["fao"]["data"])
            self.assertEqual(row["source"], previous["sources"]["fao"]["source"])
            self.assertEqual(row["fetchedAt"], "2026-10-03T12:00:00Z")
            self.assertEqual(row["lastAttemptAt"], STAMP)
            self.assertEqual(previous, untouched)
        with patch("macro_sources.download", return_value=b"<html>bad response</html>"):
            result, errors = refresh_bundle(previous, {"fao": fetch_fao}, STAMP)
        self.assertEqual(result["sources"]["fao"]["failureKind"], "validation")
        self.assertEqual(result["sources"]["fao"]["fetchedAt"], previous["sources"]["fao"]["fetchedAt"])

    def test_fao_404_fallback_is_discovered_only_from_official_page(self):
        linked = FAO_URL + "?download=true&sfvrsn=new"
        with patch("macro_sources.download", side_effect=[HTTPError(FAO_URL,404,"gone",{},None),
            f'<a href="{linked.replace("&", "&amp;")}">CSV</a>', CSV]) as download:
            result = fetch_fao()
        self.assertEqual(result["source"]["downloadUrl"], linked)
        self.assertEqual([c.args[0] for c in download.call_args_list], [FAO_URL, FAO_PAGE, linked])
        for page in ('<a href="https://other.example/food_price_indices_data.csv">CSV</a>',
                     '<html>missing</html>', f'<a href="{FAO_URL}?a=1">CSV</a><a href="{FAO_URL}?a=2">CSV</a>'):
            with self.assertRaises(ValueError): fao_csv_url(page)
        for response in (ValueError("invalid"), HTTPError(FAO_URL,403,"denied",{},None)):
            with patch("macro_sources.download", side_effect=response) as download:
                with self.assertRaises(type(response)): fetch_fao()
                self.assertEqual(download.call_count, 1)

    def test_weather_failure_classification_does_not_change_valid_cache(self):
        previous={"points":{"x":{"status":"ok","fetchedAt":"old","days":[{"date":"2026-09-30"}]}}}
        for error,kind in [(TimeoutError("offline"),"retrieval"),(ValueError("wrong units"),"validation")]:
            def fail(*_): raise error
            result=refresh(previous,[{"id":"x"}],date(2026,10,4),fail,STAMP)
            row=result["points"]["x"]
            self.assertEqual(row["failureKind"],kind)
            self.assertEqual(row["fetchedAt"],"old")
            self.assertEqual(row["days"],previous["points"]["x"]["days"])
