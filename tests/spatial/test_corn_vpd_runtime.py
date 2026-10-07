"""Phase 4B-2.2a VPD reader and orchestration. Run with the pinned GIS runtime."""
import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import netCDF4
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from corn_spatial import dates  # noqa: E402
from corn_vpd import MAX_OUTPUT, MEAN_OUTPUT, NC_VARIABLE, read_vpd, vpd_cell_values  # noqa: E402
from data_contract import DataIssue  # noqa: E402
import refresh_corn_spatial  # noqa: E402

PERIOD = dates("2026-09-22", "2026-10-05")
COORDS = {"lat": [42., 42. - 1 / 24], "lon": [-94., -94. + 1 / 24],
          "bounds": {"north": 43, "south": 41, "east": -93, "west": -95}}


def write_nc(path, days=None, variable=NC_VARIABLE, units="kPa", value=1.5, lat=None):
    days = list(range(14)) if days is None else days
    with netCDF4.Dataset(path, "w") as nc:
        nc.geospatial_bounds_crs = "EPSG:4326"
        for name, size in (("day", len(days)), ("lat", 2), ("lon", 2)):
            nc.createDimension(name, size)
        d = nc.createVariable("day", "f8", ("day",)); d.units = "days since 2026-09-22"; d[:] = days
        nc.createVariable("lat", "f8", ("lat",))[:] = lat or COORDS["lat"]
        nc.createVariable("lon", "f8", ("lon",))[:] = COORDS["lon"]
        v = nc.createVariable(variable, "f4", ("day", "lat", "lon"), fill_value=-9999)
        v.units = units
        data = np.full((len(days), 2, 2), value)
        data[:, 1, 1] = np.arange(len(days)) / 10 + 1  # A varying cell.
        v[:] = data


class VpdReaderTests(unittest.TestCase):
    def test_reads_kpa_and_keeps_missing_dates_nan(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "v.nc"; write_nc(path, days=[0, 1, 3])
            values, metadata = read_vpd(path, PERIOD, COORDS)
            self.assertEqual(values.shape, (14, 4))
            self.assertTrue(np.isnan(values[2]).all())
            self.assertEqual(len(metadata["missingDates"]), 11)
            self.assertEqual(metadata["variable"], NC_VARIABLE)

    def test_fails_closed_on_unverified_name_units_or_geometry(self):
        for kwargs in ({"variable": "vapor_pressure_deficit"}, {"units": "hPa"}, {"lat": [43., 43. - 1 / 24]}, {"value": 40.}):
            with tempfile.TemporaryDirectory() as d:
                path = Path(d) / "v.nc"; write_nc(path, **kwargs)
                with self.assertRaises(DataIssue, msg=str(kwargs)):
                    read_vpd(path, PERIOD, COORDS)

    def test_cell_values_need_a_complete_window(self):
        vpd = np.full((14, 3), 2.)
        vpd[:, 1] = np.linspace(1, 3, 14)
        vpd[4, 2] = np.nan
        values, complete = vpd_cell_values(vpd)
        self.assertEqual(complete.tolist(), [True, True, False])
        self.assertAlmostEqual(values[MEAN_OUTPUT][1], 2.)
        self.assertAlmostEqual(values[MAX_OUTPUT][1], 3.)
        self.assertTrue(np.isnan(values[MEAN_OUTPUT][2]))


class BuildVpdTests(unittest.TestCase):
    def level_c(self, states=("IA", "IL")):
        return {"methodVersion": "mapped-corn-weather-production/1", "analysisHash": "a" * 64, "gridVersion": "g/1",
                "period": {"start": PERIOD[0], "end": PERIOD[-1]},
                "states": [{"state": s, "status": "ok", "annualKey": "k" + s, "mappedCornAreaM2": 100.} for s in states],
                "combined": {"knownMappedCornAreaM2": 200., "mappedCornAreaM2": 200., "scope": "s"}}

    def run_build(self, level_c, fetch):
        manifest = lambda state: ({"key": "k" + state, "identity": {"weatherGeometryHash": "g" * 64}}, COORDS, np.array([40., 20., 20., 10.]))
        with tempfile.TemporaryDirectory() as d, \
                patch("corn_spatial_geo.load_annual", side_effect=lambda p: manifest(Path(p).name)), \
                patch.object(refresh_corn_spatial, "fetch_weather", side_effect=lambda cache, url, identity, day, deadline=None: fetch(Path(d), url)):
            return refresh_corn_spatial.build_vpd(Path(d), Path(d), level_c, "2026-10-07T00:00:00.000Z", 60)

    def test_end_to_end_with_partial_cell_and_failed_state(self):
        calls = []

        def fetch(root, url):  # First state (IA) succeeds; second (IL) is offline.
            calls.append(url)
            if len(calls) > 1:
                raise DataIssue("offline", "retrieval_failed", "unknown")
            path = root / "ia.nc"
            write_nc(path, days=[d for d in range(14) if d != 5])  # Day 5 missing everywhere ...
            return path, {}, 0
        level_c = self.level_c()
        before = copy.deepcopy(level_c)
        result = self.run_build(level_c, fetch)
        self.assertEqual(level_c, before)  # Level C content is never modified.
        self.assertIn("var=mean_vapor_pressure_deficit", calls[0])
        artifact = result["artifact"]
        self.assertNotIn("error", result)
        ia, il = artifact["states"]
        # ... so no cell has a complete window: IA is unavailable, never zero or partial.
        self.assertEqual((ia["status"], ia["reasons"]), ("unavailable", ["weather_grid_incomplete"]))
        self.assertEqual((il["status"], il["reasons"]), ("unavailable", ["retrieval_failed"]))

    def test_complete_window_area_and_summary(self):
        def fetch(root, url):
            path = root / "v.nc"
            write_nc(path)
            return path, {}, 0
        artifact = self.run_build(self.level_c(("IA",)), fetch)["artifact"]
        ia = artifact["states"][0]
        self.assertEqual(ia["status"], "ok")
        self.assertEqual((ia["validVpdAreaM2"], ia["missingAreaM2"], ia["coverage"]), (90., 10., .9))
        self.assertAlmostEqual(ia["vpdSummary"][MAX_OUTPUT]["max"], 2.3)
        self.assertEqual(artifact["combined"]["coverage"], .45)  # 90 of the 200 combined mapped area.
        self.assertEqual(artifact["denominator"], "mappedCornAreaM2")

    def test_any_failure_degrades_to_explicit_unavailability(self):
        def fetch(root, url):
            raise DataIssue("offline", "retrieval_failed", "unknown")
        artifact = self.run_build(self.level_c(), fetch)["artifact"]
        self.assertEqual([s["status"] for s in artifact["states"]], ["unavailable", "unavailable"])
        self.assertEqual(artifact["states"][0]["reasons"], ["retrieval_failed"])
        self.assertEqual(artifact["combined"]["coverage"], 0.)

    def test_state_without_validated_geography_is_unavailable(self):
        level_c = self.level_c(("IA",))
        level_c["states"][0]["annualKey"] = None
        artifact = self.run_build(level_c, lambda root, url: (_ for _ in ()).throw(AssertionError("must not fetch")))["artifact"]
        self.assertEqual(artifact["states"][0]["reasons"], ["crop_grid_unavailable"])


if __name__ == "__main__":
    unittest.main()
