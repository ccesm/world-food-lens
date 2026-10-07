"""Phase 4B-2.2a VPD artifact contract (stdlib only; no GIS runtime needed)."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from corn_vpd import METHOD, NC_VARIABLE, UNITS, VPD_METRICS, build_artifact  # noqa: E402

REGISTRY = json.loads((ROOT / "src/data/evidenceRegistry.json").read_text())


def level_c():
    states = [{"state": "IA", "status": "ok", "mappedCornAreaM2": 60.},
              {"state": "IL", "status": "unavailable", "mappedCornAreaM2": 30.},
              {"state": "NE", "status": "ok", "mappedCornAreaM2": 10.}]
    return {"methodVersion": "mapped-corn-weather-production/1", "analysisHash": "c" * 64, "gridVersion": "g/1",
            "period": {"start": "2026-09-22", "end": "2026-10-05"}, "states": states,
            "combined": {"knownMappedCornAreaM2": 100., "mappedCornAreaM2": 100., "scope": "ten-state-corn-belt-only"}}


def stats():
    return {k: {"mean": 1., "min": .5, "max": 2., "p10": .6, "p50": 1., "p90": 1.8} for k in VPD_METRICS}


class VpdContractTests(unittest.TestCase):
    def test_registry_drives_names_and_has_no_threshold(self):
        rule = REGISTRY["rules"]["atmospheric_demand_vpd"]
        self.assertEqual(rule["reviewStatus"], "reviewed")
        self.assertEqual(VPD_METRICS, ("vpdDailyMeanKPa", "vpdPeriodMaximumKPa"))
        self.assertEqual((NC_VARIABLE, UNITS, METHOD), ("mean_vapor_pressure_deficit", "kPa", "mapped-corn-vpd-screen/1"))
        self.assertFalse(rule["exactThresholdSupported"])
        self.assertTrue(rule["denominator"].startswith("mappedCornAreaM2"))
        self.assertEqual(REGISTRY["rules"]["heat_vpd_overlap"]["reviewStatus"], "draft")

    def test_vpd_is_independent_of_level_c_status_and_keeps_missing_area(self):
        # IL failed in Level C but has VPD; NE succeeded in Level C but VPD failed.
        results = {"IA": {"validVpdAreaM2": 54., "vpdSummary": stats(), "weatherVersions": {}},
                   "IL": {"validVpdAreaM2": 30., "vpdSummary": stats(), "weatherVersions": {}},
                   "NE": {"reason": "retrieval_failed"}}
        artifact = build_artifact(level_c(), results, stats(), "2026-10-07T00:00:00.000Z")
        by_state = {s["state"]: s for s in artifact["states"]}
        self.assertEqual(by_state["IL"]["status"], "ok")
        self.assertEqual((by_state["IA"]["missingAreaM2"], by_state["IA"]["coverage"]), (6., .9))
        self.assertEqual(by_state["NE"]["status"], "unavailable")
        self.assertEqual((by_state["NE"]["missingAreaM2"], by_state["NE"]["coverage"], by_state["NE"]["reasons"]),
                         (10., 0., ["retrieval_failed"]))
        self.assertTrue(all(v is None for v in by_state["NE"]["vpdSummary"].values()))
        combined = artifact["combined"]
        self.assertEqual((combined["validVpdAreaM2"], combined["coverage"]), (84., .84))
        self.assertEqual(artifact["denominator"], "mappedCornAreaM2")
        self.assertIsNone(artifact["threshold"])
        self.assertEqual(artifact["baseArtifact"]["analysisHash"], "c" * 64)

    def test_unattempted_and_unknown_geography(self):
        lc = level_c()
        lc["combined"]["mappedCornAreaM2"] = None
        artifact = build_artifact(lc, {}, {k: None for k in VPD_METRICS}, "2026-10-07T00:00:00.000Z")
        self.assertTrue(all(s["status"] == "unavailable" and s["reasons"] == ["vpd_not_attempted"] for s in artifact["states"]))
        self.assertIsNone(artifact["combined"]["coverage"])

    def test_analysis_hash_excludes_run_clock(self):
        one = build_artifact(level_c(), {}, stats(), "2026-10-07T00:00:00.000Z")
        two = build_artifact(level_c(), {}, stats(), "2026-10-08T00:00:00.000Z")
        self.assertEqual(one["analysisHash"], two["analysisHash"])


if __name__ == "__main__":
    unittest.main()
