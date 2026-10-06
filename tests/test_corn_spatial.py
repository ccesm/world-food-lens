"""Production contract tests run in the standard Python suite (no GIS needed)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from corn_spatial import (ANNUAL_METHOD, GRID, annual_identity, combine, dates, digest,
                          file_hash, record, validate_manifest, write_json)
from data_contract import DataIssue, valid_metadata


class ProductionSpatialTests(unittest.TestCase):
    def package(self, directory):
        coords = {"lat": [42., 42. - 1/24], "lon": [-94., -94. + 1/24],
                  "bounds": {"north": 43, "south": 41, "west": -95, "east": -93}}
        identity = annual_identity("IA", 2023, "a" * 64, "b" * 64,
                                  digest({k: coords[k] for k in ("lat", "lon")} | {"crs": "EPSG:4326"}))
        write_json(directory / "cells.json", [{"id": "r1:c1", "cornAreaM2": 8100., "validAreaM2": 81000000., "cornFraction": .0001}])
        write_json(directory / "coordinates.json", coords)
        # Matrix validation is tested separately in the pinned geo suite.
        write_json(directory / "overlap.npz", {"fixture": True})
        manifest = {"identity": identity, "key": digest(identity), "mappedCornAreaM2": 8100.,
                    "artifacts": {k: file_hash(directory / k) for k in ("cells.json", "coordinates.json", "overlap.npz")}}
        write_json(directory / "manifest.json", manifest)
        return manifest

    def test_valid_annual_cache_reuse_and_determinism(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            self.package(p)
            self.assertEqual(validate_manifest(p), validate_manifest(p))

    def test_missing_crop_grid_not_zero(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(DataIssue) as error:
                validate_manifest(d)
            self.assertEqual(error.exception.reason, "crop_grid_unavailable")

    def test_corrupt_annual_grid(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            self.package(p)
            write_json(p / "cells.json", [])
            with self.assertRaises(DataIssue):
                validate_manifest(p)

    def test_changed_cdl_or_year_invalidates_key(self):
        a = annual_identity("IA", 2023, "a" * 64, "b" * 64, "c" * 64)
        for k, v in (("cdlHash", "d" * 64), ("cropYear", 2022), ("weatherGeometryHash", "e" * 64), ("state", "IL")):
            self.assertNotEqual(digest(a), digest({**a, k: v}))

    def test_obsolete_method_version_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            m = self.package(p)
            m["identity"]["methodVersion"] = "obsolete/0"
            m["key"] = digest(m["identity"])
            write_json(p / "manifest.json", m)
            with self.assertRaises(DataIssue) as e:
                validate_manifest(p)
            self.assertEqual(e.exception.reason, "crop_grid_version_mismatch")

    def test_grid_change_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            m = self.package(p)
            m["identity"]["grid"] = {**GRID, "cellSizeM": 10000}
            m["key"] = digest(m["identity"])
            write_json(p / "manifest.json", m)
            with self.assertRaises(DataIssue):
                validate_manifest(p)

    def test_impossible_or_zero_annual_area(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            m = self.package(p)
            write_json(p / "cells.json", [{"id": "r1:c1", "cornAreaM2": 0, "validAreaM2": 0, "cornFraction": 0}])
            m["artifacts"]["cells.json"] = file_hash(p / "cells.json")
            m["mappedCornAreaM2"] = 0
            write_json(p / "manifest.json", m)
            with self.assertRaises(DataIssue):
                validate_manifest(p)

    def states(self):
        return [{"state": "IA", "status": "ok", "mappedCornAreaM2": 100, "validWeatherAreaM2": 100,
                 "annualKey": "a" * 64, "weatherVersions": {"pr": [{"contentHash": "b" * 64}]}},
                {"state": "NE", "status": "ok", "mappedCornAreaM2": 200, "validWeatherAreaM2": 200,
                 "annualKey": "c" * 64, "weatherVersions": {"pr": [{"contentHash": "d" * 64}]}}]

    def test_multiple_states_area_and_provenance_reconcile(self):
        c = combine(self.states())
        self.assertEqual(c["mappedCornAreaM2"], 300)
        self.assertEqual(c["validWeatherAreaM2"], 300)
        self.assertEqual(c["coverage"], 1)
        self.assertEqual(c["contributingInputs"][1]["annualKey"], "c" * 64)

    def test_one_state_failure_never_normalizes(self):
        s = self.states()
        s[1].update(status="unavailable", validWeatherAreaM2=0)
        c = combine(s)
        self.assertEqual(c["coverage"], 1/3)
        self.assertEqual(c["unavailableStates"], ["NE"])
        self.assertEqual(c["missingAreaM2"], 200)

    def test_partial_weather_coverage_remains_partial(self):
        s = self.states()
        s[1]["validWeatherAreaM2"] = 170
        self.assertEqual(combine(s)["coverage"], .9)

    def test_unknown_geography_is_not_zero_denominator(self):
        s = self.states()
        s[1].update(status="unavailable", mappedCornAreaM2=None, validWeatherAreaM2=0)
        c = combine(s)
        self.assertIsNone(c["coverage"])
        self.assertIsNone(c["mappedCornAreaM2"])
        self.assertEqual(c["knownMappedCornAreaM2"], 100)

    def test_impossible_combined_area_rejected(self):
        s = self.states()
        s[0]["validWeatherAreaM2"] = 500
        with self.assertRaises(DataIssue):
            combine(s)

    def test_frozen_window_and_cross_year_dates(self):
        self.assertEqual(len(dates("2025-12-25", "2026-01-07")), 14)
        with self.assertRaises(DataIssue):
            dates("2026-01-01", "2026-01-13")

    def test_canonical_failure_retains_previous_not_newer_clock(self):
        previous = record("cornSpatial", "IA", {"coverage": 1}, "2026-10-04T12:00:00.000Z", "2026-10-02")
        current = record("cornSpatial", "IA", None, "2026-10-05T12:00:00.000Z", "2026-10-03",
                         failure=DataIssue("outage", "retrieval_failed", "unknown"), previous=previous)
        self.assertTrue(valid_metadata(current["metadata"]))
        self.assertEqual(current["fetchedAt"], previous["fetchedAt"])
        self.assertEqual(current["source"]["period"], "2026-10-02")
        self.assertEqual(current["metadata"]["cache"], "retained-retrieval")
        self.assertEqual(current["metadata"]["version"]["contentHash"], previous["metadata"]["version"]["contentHash"])

    def test_canonical_no_data_failure_and_narrow_reason_codes(self):
        for code in ("crop_grid_unavailable", "crop_grid_version_mismatch", "weather_grid_incomplete", "spatial_alignment_failed"):
            r = record("cornSpatial", "IA", None, "2026-10-05T12:00:00.000Z", None, failure=DataIssue("failure", code))
            self.assertTrue(valid_metadata(r["metadata"]))
            self.assertEqual(r["metadata"]["cache"], "unavailable")
            self.assertIsNone(r["metadata"]["accepted"]["fetchedAt"])

    def test_missing_annual_cache_degrades_without_zero_or_clock_identity(self):
        from refresh_corn_spatial import refresh
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            first,_=refresh(root,root,"2026-09-20","2026-10-03","2026-10-05T12:00:00.000Z")
            second,_=refresh(root,root,"2026-09-20","2026-10-03","2026-10-05T13:00:00.000Z")
            self.assertEqual(first["analysisHash"],second["analysisHash"])
            self.assertEqual(len(first["combined"]["unavailableStates"]),10)
            self.assertIsNone(first["combined"]["mappedCornAreaM2"])
            self.assertIsNone(first["combined"]["coverage"])
            for s in first["states"]:
                self.assertEqual(s["records"]["crop"]["metadata"]["extensions"]["spatialReason"],"crop_grid_unavailable")
                self.assertEqual(s["records"]["crop"]["metadata"]["attempt"]["reason"],"coverage_incomplete")


if __name__ == "__main__":
    unittest.main()
