"""Phase 4B-2.1 vectorized heat screens. Run with the pinned GIS runtime."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from corn_heat import COUNT_OUTPUT, EDD_OUTPUTS, HEAT_METRICS, RUN_OUTPUT, edd_array, edd_day, heat_cell_values, summarize_heat  # noqa: E402
from corn_spatial import METRICS, combine  # noqa: E402
from refresh_corn_spatial import build_heat  # noqa: E402


class HeatRuntimeTests(unittest.TestCase):
    def test_vectorized_matches_scalar_reference(self):
        rng = np.random.default_rng(7)
        tmin = rng.uniform(5, 32, 500)
        tmax = tmin + rng.uniform(0, 18, 500)
        for base in (29, 30):
            expected = [edd_day(n, x, base) for n, x in zip(tmin, tmax)]
            np.testing.assert_allclose(edd_array(tmin, tmax, base), expected, rtol=0, atol=1e-12)

    def test_missing_input_is_nan_never_zero(self):
        out = edd_array(np.array([np.nan, 20.]), np.array([35., np.nan]), 29)
        self.assertTrue(np.isnan(out).all())

    def test_cell_values_and_incomplete_cells(self):
        tmmn = np.full((14, 3), 20.)
        tmmx = np.full((14, 3), 30.)
        tmmx[[2, 3, 4, 9], 0] = 36.          # Cell 0: four hot days, longest run three.
        tmmx[5, 2] = np.nan                  # Cell 2: incomplete window.
        values = heat_cell_values(tmmn, tmmx)
        self.assertEqual(values[COUNT_OUTPUT][0], 4)
        self.assertEqual(values[RUN_OUTPUT][0], 3)
        self.assertEqual((values[COUNT_OUTPUT][1], values[RUN_OUTPUT][1]), (0, 0))
        self.assertTrue(all(np.isnan(values[k][2]) for k in HEAT_METRICS))
        self.assertAlmostEqual(values[EDD_OUTPUTS[29]][1], 14 * edd_day(20, 30, 29))
        self.assertGreater(values[EDD_OUTPUTS[29]][0], values[EDD_OUTPUTS[30]][0])

    def test_area_weighting_happens_after_cell_computation(self):
        values = {k: np.array([0., 10.]) for k in HEAT_METRICS}
        summary = summarize_heat([(values, np.array([3., 1.]))])
        self.assertAlmostEqual(summary[EDD_OUTPUTS[29]]["mean"], 2.5)
        self.assertEqual(summarize_heat([]), {k: None for k in HEAT_METRICS})

    def test_heat_values_do_not_change_level_c_combination(self):
        states = [{"state": "IA", "status": "ok", "mappedCornAreaM2": 2, "validWeatherAreaM2": 2, "annualKey": "a", "weatherVersions": {}}]
        base = {k: np.array([1., 3.]) for k in METRICS}
        with_heat = {**base, **{k: np.array([5., 7.]) for k in HEAT_METRICS}}
        weights = np.array([1., 1.])
        self.assertEqual(combine(states, [(base, weights)]), combine(states, [(with_heat, weights)]))

    def test_build_heat_end_to_end_and_degraded_state(self):
        level_c = {"methodVersion": "mapped-corn-weather-production/1", "analysisHash": "a" * 64, "gridVersion": "g/1",
                   "period": {"start": "2026-09-22", "end": "2026-10-05"},
                   "states": [{"state": "IA", "status": "ok", "mappedCornAreaM2": 2., "validWeatherAreaM2": 2., "coverage": 1., "reasons": []},
                              {"state": "IL", "status": "ok", "mappedCornAreaM2": 1., "validWeatherAreaM2": 1., "coverage": 1., "reasons": []}],
                   "combined": {"knownMappedCornAreaM2": 3., "mappedCornAreaM2": 3., "validWeatherAreaM2": 3., "coverage": 1., "scope": "s"}}
        tmmn, tmmx = np.full((14, 2), 22.), np.full((14, 2), 36.)
        ia = ({**{k: np.ones(2) for k in METRICS}, **heat_cell_values(tmmn, tmmx)}, np.array([1., 1.]))
        il_without_heat = ({k: np.ones(1) for k in METRICS}, np.array([1.]))
        result = build_heat(level_c, {"IA": ia, "IL": il_without_heat}, "2026-10-07T00:00:00.000Z")
        artifact = result["artifact"]
        self.assertNotIn("error", result)
        self.assertEqual([s["status"] for s in artifact["states"]], ["ok", "unavailable"])
        self.assertEqual(artifact["combined"]["heatSummary"][COUNT_OUTPUT]["mean"], 14)
        self.assertAlmostEqual(artifact["combined"]["coverage"], 2 / 3)


if __name__ == "__main__":
    unittest.main()
