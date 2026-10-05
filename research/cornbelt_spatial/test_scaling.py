"""Offline deterministic scaling tests; run in Iowa's pinned geospatial environment."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import rasterio
from affine import Affine
from scipy.sparse import csr_matrix
from shapely.geometry import box

import acquire
import geometry
import validate
from audit_boundaries import duplicate_corn_pixels
from spatial import SpatialIssue, digest, file_hash


def state_fixture():
    states,distributions = [],{}
    for state in acquire.STATES:
        states.append({"state":state["id"],"status":"ok","mappedCornAreaM2":100.,
                       "validWeatherAreaM2":100.,"analysisHash":state["id"]})
        distributions[state["id"]] = {"weights":np.array([25.,75.]),
                                     **{key:np.array([10.,30.]) for key in validate.METRICS}}
    return states,distributions


class CombinedTests(unittest.TestCase):
    def test_all_ten_succeed_area_reconciliation(self):
        result = validate.aggregate(*state_fixture())
        self.assertEqual(len(result["contributingStates"]),10)
        self.assertEqual(result["totalMappedCornAreaM2"],1000)
        self.assertEqual(result["validWeatherAreaM2"],1000)
        self.assertEqual(result["coverage"],1)
        self.assertNotIn("national",result["label"]["en"].lower())

    def test_failed_weather_state_not_zero_or_renormalized(self):
        states,distributions = state_fixture()
        states[2].update(status="unavailable",validWeatherAreaM2=None)
        result = validate.aggregate(states,distributions)
        self.assertEqual(result["coverage"],.9)
        self.assertEqual(result["totalMappedCornAreaM2"],1000)
        self.assertEqual(result["unavailableStates"],["NE"])
        self.assertEqual(result["states"][2]["status"],"unavailable")

    def test_unknown_failed_geography_does_not_claim_full_coverage(self):
        states,distributions = state_fixture()
        states[2].update(status="unavailable",mappedCornAreaM2=None,validWeatherAreaM2=None)
        result = validate.aggregate(states,distributions)
        self.assertIsNone(result["coverage"])
        self.assertIsNone(result["totalMappedCornAreaM2"])
        self.assertEqual(result["knownMappedCornAreaM2"],900)
        self.assertEqual(result["missingGeographyStates"],["NE"])

    def test_partial_state_remains_partial(self):
        states,distributions = state_fixture()
        states[0]["validWeatherAreaM2"] = 85
        distributions["IA"]["weights"] = np.array([25.,60.])
        self.assertEqual(validate.aggregate(states,distributions)["coverage"],.985)

    def test_quantiles_from_area_distribution_not_mean_state_percentile(self):
        states,distributions = state_fixture()
        distributions["IA"].update({key:np.array([1000.,2000.]) for key in validate.METRICS})
        result = validate.aggregate(states,distributions)["weatherSummary"][validate.METRICS[0]]
        self.assertEqual(result["p90"],30)
        self.assertAlmostEqual(result["mean"],197.5)

    def test_all_fail_weather_summary_unavailable_not_zero(self):
        states,distributions = state_fixture()
        for state in states:
            state.update(status="unavailable",validWeatherAreaM2=None)
        result = validate.aggregate(states,distributions)
        self.assertEqual(result["coverage"],0)
        self.assertTrue(all(value is None for value in result["weatherSummary"].values()))

    def test_missing_or_reordered_state_rejected(self):
        states,distributions = state_fixture()
        with self.assertRaises(ValueError):
            validate.aggregate(states[:-1],distributions)
        with self.assertRaises(ValueError):
            validate.aggregate(list(reversed(states)),distributions)

    def test_invalid_state_area_or_distribution_cannot_inflate_combined_area(self):
        states,distributions = state_fixture()
        states[0]["validWeatherAreaM2"] = 120
        with self.assertRaises(ValueError):
            validate.aggregate(states,distributions)
        states[0]["validWeatherAreaM2"] = 100
        distributions["IA"]["weights"] = np.array([25.,74.])
        with self.assertRaises(ValueError):
            validate.aggregate(states,distributions)

    def test_provenance_and_deterministic_summary(self):
        a = validate.aggregate(*state_fixture())
        b = validate.aggregate(*state_fixture())
        self.assertEqual(digest(a),digest(b))
        self.assertEqual([v["analysisHash"] for v in a["provenance"]["stateArtifacts"]],
                         [s["id"] for s in acquire.STATES])
        self.assertEqual(a["provenance"]["localStageEligibility"],"insufficient")

    def test_subprocess_failure_does_not_stop_other_states_or_use_stale_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            states,distributions = state_fixture()
            def attempt(command,check):
                state = command[-1]
                cache = root/state
                cache.mkdir()
                summary = next(s for s in states if s["state"]==state)
                acquire.write_json(cache/"state-summary.json",summary)  # Deliberately stale on failure.
                if state == "NE":
                    acquire.write_json(cache/"failure.json",{"reason":"retrieval_failed"})
                    return subprocess.CompletedProcess(command,1)
                np.savez_compressed(cache/"distribution.npz",**distributions[state])
                acquire.write_json(cache/"performance.json",{"peakResidentBytes":1024})
                return subprocess.CompletedProcess(command,0)
            with patch("validate.subprocess.run",side_effect=attempt),patch("validate.retained_static_area",return_value=None):
                validate.orchestrate(root,root/"result.json")
            result = json.loads((root/"result.json").read_text())
            self.assertEqual(len(result["contributingStates"]),9)
            self.assertEqual(result["states"][2]["status"],"unavailable")
            self.assertIsNone(result["coverage"])


class WeatherSummaryTests(unittest.TestCase):
    def inputs(self):
        return {key:{"values":np.full((14,1,2),value),"lat":np.array([42.]),"lon":np.array([-93.5,-93.5+1/24]),
                     "metadata":{"contentHash":key}} for key,value in (("tmmx",30.),("tmmn",20.),("pr",1.))}

    def test_partial_missing_date_area_preserved_and_recorded(self):
        weather = self.inputs()
        weather["pr"]["values"][3,0,1] = np.nan
        values,eligible,stats,coverage = validate.distributions(weather,np.array([72.,28.]))
        self.assertEqual(eligible.tolist(),[True,False])
        self.assertEqual(coverage["jointValidAreaM2"],72)
        self.assertEqual(coverage["missingWeatherCellsWithCorn"],1)
        self.assertEqual(coverage["missingValueDates"]["pr"],["2015-07-04"])
        self.assertEqual(stats["precipitation14DayMm"]["mean"],14)

    def test_no_valid_weather_not_zero(self):
        weather = self.inputs()
        weather["pr"]["values"][0] = np.nan
        _,_,stats,coverage = validate.distributions(weather,np.array([50.,50.]))
        self.assertEqual(coverage["jointValidAreaM2"],0)
        self.assertTrue(all(v is None for v in stats.values()))

    def test_daily_mean_and_period_extreme_are_distinct(self):
        weather = self.inputs()
        weather["tmmx"]["values"][0] = 44
        _,_,stats,_ = validate.distributions(weather,np.array([50.,50.]))
        self.assertEqual(stats["tmaxDailyMeanC"]["mean"],31)
        self.assertEqual(stats["tmaxPeriodMaximumC"]["mean"],44)

    def test_tmin_exceeds_tmax_rejected(self):
        weather = self.inputs()
        weather["tmmn"]["values"][0,0,0] = 31
        with self.assertRaises(SpatialIssue):
            validate.distributions(weather,np.ones(2))

    def test_state_summary_preserves_partial_denominator_and_versions(self):
        weather = self.inputs()
        weather["pr"]["values"][0,0,1] = np.nan
        cells = [{"cornAreaM2":100.}]
        result,_,weights = validate.state_summary(acquire.STATES[0],cells,csr_matrix([[72.,28.]]),
                                                 {"contentHash":"crop"},weather,{},None,{})
        self.assertEqual(result["coverage"],.72)
        self.assertEqual(result["missingAreaM2"],28)
        self.assertEqual(result["provenance"]["methodVersion"],acquire.CONFIG["methodVersion"])
        self.assertEqual(len(result["provenance"]["inputs"]),4)
        self.assertEqual(result["pointComparison"]["powerUtcReference"]["eligibility"],"insufficient")

    def test_existing_power_point_comparison_keeps_provider_caveat(self):
        weather = self.inputs()
        values,eligible,stats,_ = validate.distributions(weather,np.array([50.,50.]))
        power = {"days":[{"date":day,"max":32.,"min":21.,"rain":2.} for day in
                          validate.days_between("2015-07-01","2015-07-14")],"rawHash":"power","url":"official"}
        result = validate.point_comparison(acquire.STATES[0],weather,values,eligible,stats,power)
        self.assertEqual(result["powerUtcPointMinusAreaMean"]["precipitation14DayMm"],14)
        self.assertEqual(result["gridmetPointMinusAreaMean"]["precipitation14DayMm"],0)
        self.assertIn("provider",result["caveat"])


class AnnualCacheTests(unittest.TestCase):
    def fixture(self,root):
        path = root/"cdl.tif"
        with rasterio.open(path,"w",driver="GTiff",width=4,height=2,count=1,dtype="uint8",crs=5070,
                           transform=Affine(30,0,15,0,-30,75)) as source:
            source.write(np.ones((2,4),dtype=np.uint8),1)
        (root/"boundary.geojson").write_text("{}")
        weather = {"lat":np.array([1.]),"lon":np.array([1.,2.])}
        grid = {"cellSizeM":60,"originX":0,"originY":90,"edgeSegments":16,"version":"fixture"}
        return weather,grid

    def overlap(self,root,weather,grid):
        with patch("geometry.weather_footprint",side_effect=lambda y,x,segments: box(0 if x==1 else 90,0,90 if x==1 else 150,100)):
            return geometry.annual_overlap(root,acquire.STATES[0],weather,grid,box(15,15,135,75))

    def test_shifted_native_origin_shared_grid_conserves_area(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cells,matrix,metadata,cache = self.overlap(root,*self.fixture(root))
            self.assertEqual(sum(c["cornAreaM2"] for c in cells),7200)
            self.assertAlmostEqual(matrix.sum(),7200)
            self.assertAlmostEqual(matrix[:,0].sum(),4500)
            self.assertAlmostEqual(matrix[:,1].sum(),2700)
            self.assertTrue(all(c["cornFraction"]<=1 for c in cells))
            self.assertEqual(cache["state"],"prepared")

    def test_annual_cache_reuse_deterministic_no_weather_reintersection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            weather,grid = self.fixture(root)
            a = self.overlap(root,weather,grid)
            weather["values"] = np.ones((14,1,2))*99  # Dynamic values do not invalidate static geometry.
            with patch("geometry.weather_footprint",side_effect=AssertionError("Must not re-intersect")):
                b = geometry.annual_overlap(root,acquire.STATES[0],weather,grid,box(15,15,135,75))
            self.assertEqual(a[0],b[0])
            self.assertEqual((a[1]!=b[1]).nnz,0)
            self.assertEqual(b[3]["state"],"reused")

    def test_changed_grid_or_weather_coordinates_invalidates_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            weather,grid = self.fixture(root)
            self.overlap(root,weather,grid)
            changed = dict(grid,version="changed")
            self.assertEqual(self.overlap(root,weather,changed)[3]["state"],"rebuilt")
            weather["lon"] = np.array([1.,3.])
            self.assertEqual(self.overlap(root,weather,changed)[3]["state"],"rebuilt")

    def test_corrupted_cache_rebuilds_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            weather,grid = self.fixture(root)
            self.overlap(root,weather,grid)
            (root/"annual-cells.json").write_text("[]")
            result = self.overlap(root,weather,grid)
            self.assertEqual(result[3]["state"],"rebuilt")
            self.assertEqual(result[2]["cornAreaM2"],7200)

    def test_changed_crop_input_invalidates_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            weather,grid = self.fixture(root)
            self.overlap(root,weather,grid)
            with rasterio.open(root/"cdl.tif","r+") as source:
                source.write(np.full((2,4),5,dtype=np.uint8),1)
            result = self.overlap(root,weather,grid)
            self.assertEqual(result[3]["state"],"rebuilt")
            self.assertEqual(result[2]["cornAreaM2"],0)

    def test_verified_static_denominator_retained_on_weather_failure_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            weather,grid = self.fixture(root)
            self.overlap(root,weather,grid)
            with patch.dict(acquire.CONFIG,{"grid":grid}):
                self.assertEqual(validate.retained_static_area(root),7200)
                result = validate.unavailable_state(acquire.STATES[0],root,{"reason":"missing_date"})
                self.assertEqual(result["mappedCornAreaM2"],7200)
                self.assertIsNone(result["validWeatherAreaM2"])
                self.assertTrue(result["provenance"]["annualWeightVersion"])
                self.assertEqual(len(result["provenance"]["inputs"]),1)
                (root/"boundary.geojson").write_text('{"changed":true}')
                self.assertIsNone(validate.retained_static_area(root))

    def test_partial_spatial_matrix_not_normalized(self):
        target,support = geometry.check_matrix([{"cornAreaM2":100.}],csr_matrix([[42.,30.]]),2)
        self.assertEqual(support[0]/target[0],.72)

    def test_invalid_or_inflated_matrix_rejected(self):
        for values,target in (([-1,30],100),([60,60],100),([np.nan,0],100),([10,0],np.nan)):
            with self.assertRaises(SpatialIssue):
                geometry.check_matrix([{"cornAreaM2":target}],csr_matrix([values]),2)


class SourceTests(unittest.TestCase):
    def test_metadata_official_date_not_fetch_date_and_state_year_guard(self):
        html = '2015 Iowa Cropland Data Layer <span>Publication_Date:</span> <span>20160212</span>'
        result = acquire.metadata(html,acquire.STATES[0])
        self.assertEqual(result["publicationDate"],"2016-02-12")
        self.assertIsNone(result["publishedAt"])
        with self.assertRaises(ValueError):
            acquire.metadata(html,acquire.STATES[1])

    def test_raw_cache_rejected_inside_repository(self):
        with self.assertRaises(ValueError):
            acquire.cache_root(acquire.ROOT/"research/raw")

    def test_missing_official_reference_does_not_fabricate_acreage(self):
        with tempfile.TemporaryDirectory() as directory:
            result = validate.acreage_reference(Path(directory)/"missing.txt")
        self.assertTrue(all(value is None for value in result.values()))

    def test_changed_official_year_table_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"acreage.txt"
            path.write_text("Corn Area Planted for All Purposes and Harvested for Grain, Yield, and Production -\nStates and United States: 2014-2016\n")
            with self.assertRaises(ValueError):
                validate.acreage_reference(path)

    def test_duplicate_state_crop_pixels_detected(self):
        with rasterio.io.MemoryFile() as a,rasterio.io.MemoryFile() as b:
            profile = dict(driver="GTiff",width=2,height=2,count=1,dtype="uint8",crs=5070,transform=Affine(30,0,0,0,-30,60))
            with a.open(**profile) as first,b.open(**profile) as second:
                first.write(np.array([[1,5],[1,5]],dtype=np.uint8),1)
                second.write(np.array([[1,1],[5,5]],dtype=np.uint8),1)
                self.assertEqual(duplicate_corn_pixels(first,second),1)

    def test_legacy_iowa_reference_artifact_unchanged(self):
        self.assertEqual(file_hash(acquire.ROOT/"research/iowa-spatial-summary.json"),
                         "b1cd12ac741e916d8f4e179658f09228b1061692e1b3ffae82935aa4f0327c6d")


if __name__ == "__main__":
    unittest.main()
