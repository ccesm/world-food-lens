"""Phase 4B-2.1 heat-screen definitions (stdlib only; no GIS runtime needed)."""
import json
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from corn_heat import (BASES, COUNT_OUTPUT, EDD_OUTPUTS, HEAT_METRICS, METHOD, RUN_OUTPUT, THRESHOLD,  # noqa: E402
                       build_artifact, edd_day, hot_day_stats)

REGISTRY = json.loads((ROOT / "src/data/evidenceRegistry.json").read_text())


def integrated(tmin, tmax, base, steps=200_000):
    """Midpoint integral of max(T(t) - base, 0) over one day of a sine cycle."""
    mean, amplitude = (tmax + tmin) / 2, (tmax - tmin) / 2
    return sum(max(mean + amplitude * math.sin(2 * math.pi * (i + .5) / steps) - base, 0.) for i in range(steps)) / steps


class EddDefinitionTests(unittest.TestCase):
    def test_parameters_and_names_come_from_the_registry(self):
        self.assertEqual(BASES, (29, 30))
        self.assertEqual(THRESHOLD, 35)
        self.assertEqual(set(HEAT_METRICS), {k for r in ("heat_extreme_degree_days", "hot_day_tmax35")
                                             for k in REGISTRY["rules"][r]["outputs"]})
        self.assertEqual(METHOD, "mapped-corn-heat-screen/1")
        self.assertEqual((EDD_OUTPUTS[29], EDD_OUTPUTS[30], COUNT_OUTPUT, RUN_OUTPUT),
                         ("edd29Window14DayCDay", "edd30Window14DayCDay", "hotDays35Count", "hotDays35LongestRun"))

    def test_analytic_cases(self):
        self.assertEqual(edd_day(15, 29, 29), 0)
        self.assertEqual(edd_day(10, 25, 29), 0)
        self.assertAlmostEqual(edd_day(31, 37, 29), 5)          # Whole day above base: mean - base.
        self.assertAlmostEqual(edd_day(23, 35, 29), 6 / math.pi)  # Mean on the base: amplitude / pi.

    def test_matches_numerical_integration_of_the_sine_model(self):
        for tmin, tmax, base in [(18, 34, 29), (22, 36, 30), (28.5, 29.5, 29), (10, 40, 30)]:
            self.assertAlmostEqual(edd_day(tmin, tmax, base), integrated(tmin, tmax, base), places=6)

    def test_monotone_in_tmax_and_in_base(self):
        values = [edd_day(18, tmax, 29) for tmax in (28, 29, 30, 32, 35, 38)]
        self.assertEqual(values, sorted(values))
        for tmin, tmax in [(18, 34), (25, 40), (30, 33)]:
            self.assertGreaterEqual(edd_day(tmin, tmax, 29), edd_day(tmin, tmax, 30))

    def test_order_matters_compute_per_cell_before_averaging(self):
        cells = [(20, 30), (24, 40)]
        per_cell = sum(edd_day(n, x, 29) for n, x in cells) / 2
        averaged_weather = edd_day(sum(n for n, _ in cells) / 2, sum(x for _, x in cells) / 2, 29)
        self.assertNotAlmostEqual(per_cell, averaged_weather, places=3)

    def test_invalid_inputs_are_rejected_not_zero(self):
        for tmin, tmax in [(30, 20), (math.nan, 30), (20, math.inf)]:
            with self.assertRaises(ValueError):
                edd_day(tmin, tmax, 29)


class HotDayTests(unittest.TestCase):
    def test_count_and_longest_run(self):
        self.assertEqual(hot_day_stats([34.9] * 14), (0, 0))
        self.assertEqual(hot_day_stats([35, 36, 20, 35, 35, 35, 20] + [20] * 7), (5, 3))
        self.assertEqual(hot_day_stats([36] * 14), (14, 14))

    def test_missing_day_is_not_a_cool_day(self):
        with self.assertRaises(ValueError):
            hot_day_stats([36] * 13 + [math.nan])


class ArtifactTests(unittest.TestCase):
    def level_c(self):
        states = [{"state": "IA", "status": "ok", "mappedCornAreaM2": 60., "validWeatherAreaM2": 60., "coverage": 1., "reasons": []},
                  {"state": "IL", "status": "ok", "mappedCornAreaM2": 30., "validWeatherAreaM2": 30., "coverage": 1., "reasons": []},
                  {"state": "NE", "status": "unavailable", "mappedCornAreaM2": 10., "validWeatherAreaM2": 0., "coverage": 0.,
                   "reasons": ["retrieval_failed"]}]
        return {"methodVersion": "mapped-corn-weather-production/1", "analysisHash": "f" * 64, "gridVersion": "g/1",
                "period": {"start": "2026-09-22", "end": "2026-10-05"}, "states": states,
                "combined": {"knownMappedCornAreaM2": 100., "mappedCornAreaM2": 100., "validWeatherAreaM2": 90.,
                             "coverage": .9, "scope": "ten-state-corn-belt-only"}}

    def stats(self):
        return {k: {"mean": 1., "min": 0., "max": 2., "p10": 0., "p50": 1., "p90": 2.} for k in HEAT_METRICS}

    def test_binding_coverage_and_failure_isolation(self):
        # IL kept by Level C but its heat summary failed: it must leave the heat numerator.
        artifact = build_artifact(self.level_c(), {"IA": self.stats()}, self.stats(), "2026-10-07T00:00:00.000Z")
        self.assertEqual(artifact["baseArtifact"], {"file": "corn-spatial.json", "methodVersion": "mapped-corn-weather-production/1",
                                                    "analysisHash": "f" * 64})
        by_state = {s["state"]: s for s in artifact["states"]}
        self.assertEqual(by_state["IA"]["status"], "ok")
        self.assertEqual(by_state["IL"]["status"], "unavailable")
        self.assertEqual(by_state["IL"]["reasons"], ["heat_screen_unavailable"])
        self.assertEqual(by_state["NE"]["reasons"], ["retrieval_failed"])
        self.assertTrue(all(v is None for v in by_state["NE"]["heatSummary"].values()))
        combined = artifact["combined"]
        self.assertEqual((combined["validWeatherAreaM2"], combined["coverage"]), (60., .6))
        self.assertEqual(combined["unavailableStates"], ["IL", "NE"])
        self.assertEqual(artifact["localStageEligibility"], "insufficient")
        self.assertEqual(artifact["parameters"], {"eddBaseC": [29, 30], "hotDayThresholdC": 35})

    def test_unknown_geography_keeps_coverage_unknown(self):
        level_c = self.level_c()
        level_c["combined"]["mappedCornAreaM2"] = None
        artifact = build_artifact(level_c, {"IA": self.stats(), "IL": self.stats()}, self.stats(), "2026-10-07T00:00:00.000Z")
        self.assertIsNone(artifact["combined"]["coverage"])

    def test_analysis_hash_excludes_run_clock(self):
        one = build_artifact(self.level_c(), {"IA": self.stats()}, self.stats(), "2026-10-07T00:00:00.000Z")
        two = build_artifact(self.level_c(), {"IA": self.stats()}, self.stats(), "2026-10-08T00:00:00.000Z")
        self.assertEqual(one["analysisHash"], two["analysisHash"])
        self.assertNotEqual(one["generatedAt"], two["generatedAt"])


if __name__ == "__main__":
    unittest.main()
