"""Run with the isolated geospatial environment, not production's stdlib Python."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import netCDF4
import numpy as np
import rasterio
from affine import Affine
from scipy.sparse import csr_matrix
from shapely.geometry import box

from collect import ROOT, external_cache, collect
from run import build_overlap, summarize, run
from spatial import (SpatialIssue, crop_masks, days_between, denominators, demonstration_screen,
                     digest, load_weather, polygon_mask_area, validate_cdl, weather_footprint)


class CropAreaTests(unittest.TestCase):
    def test_class_1_only_and_nodata_not_noncorn(self):
        values = np.array([[1, 5, 0], [12, 13, 255]], dtype=np.uint8)
        corn, valid = crop_masks(values, 255)
        self.assertEqual(corn.sum(), 1)
        self.assertEqual(valid.sum(), 4)
        self.assertFalse(valid[0, 2])
        self.assertFalse(valid[1, 2])

    def test_exact_partial_boundary_not_centre_inflation(self):
        mask = np.ones((2, 2), dtype=bool)
        transform = Affine(30, 0, 0, 0, -30, 60)
        self.assertAlmostEqual(polygon_mask_area(mask, transform, box(15, 0, 45, 60)), 1800)
        self.assertAlmostEqual(polygon_mask_area(mask, transform, box(-15, 0, 15, 60)), 900)
        self.assertEqual(polygon_mask_area(mask, transform, box(90, 0, 120, 60)), 0)

    def test_conservation_partition_and_determinism(self):
        corn = np.array([[1, 0], [0, 1]], dtype=bool)
        transform = Affine(30, 0, 0, 0, -30, 60)
        a, b = box(0, 0, 45, 60), box(45, 0, 60, 60)
        result = polygon_mask_area(corn, transform, a)
        self.assertEqual(result, polygon_mask_area(corn, transform, a))
        self.assertAlmostEqual(result+polygon_mask_area(corn, transform, b), 1800)

    def test_native_crs_origin_and_resolution_guard(self):
        with rasterio.io.MemoryFile() as memory:
            with memory.open(driver="GTiff", width=2, height=2, count=1, dtype="uint8",
                             crs=5070, transform=Affine(30, 0, 0, 0, -30, 60)) as source:
                validate_cdl(source, {"originX": 0, "originY": 60})
                with self.assertRaises(SpatialIssue) as error:
                    validate_cdl(source, {"originX": 15, "originY": 60})
                self.assertEqual(error.exception.detail, "spatial_eligibility_failure")
        with rasterio.io.MemoryFile() as memory:
            with memory.open(driver="GTiff", width=2, height=2, count=1, dtype="uint8",
                             crs=4326, transform=Affine(.01,0,-93,0,-.01,42)) as source:
                with self.assertRaises(SpatialIssue) as error:
                    validate_cdl(source, {"originX": 0, "originY": 60})
                self.assertEqual(error.exception.detail, "projection_mismatch")

    def test_reprojection_and_adjacent_native_footprints(self):
        a = weather_footprint(42, -93.5)
        b = weather_footprint(42, -93.5+1/24)
        self.assertTrue(a.is_valid)
        self.assertGreater(a.area, 10_000_000)
        self.assertLess(a.area, 20_000_000)
        self.assertLess(a.intersection(b).area, .01)
        self.assertEqual(a.wkb, weather_footprint(42,-93.5).wkb)
        fine = weather_footprint(42,-93.5,segments=32)
        self.assertLess(abs(a.area-fine.area)/fine.area, 1e-7)

    def test_small_cdl_sparse_intersection_clipped_extent(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            path = cache/"tiny.tif"
            with rasterio.open(path, "w", driver="GTiff", width=3, height=3, count=1,
                               dtype="uint8", crs=5070, transform=Affine(30,0,0,0,-30,90)) as source:
                source.write(np.array([[1,5,0],[1,1,5],[0,5,1]], dtype=np.uint8),1)
            weather = {"lat": np.array([1]), "lon": np.array([1,2])}
            grid = {"originX": 0, "originY": 90, "cellSizeM": 9000, "edgeSegments": 16}
            with patch("run.weather_footprint", side_effect=lambda y,x,segments: box(0 if x==1 else 45,0,45 if x==1 else 90,90)):
                cells, matrix, metadata = build_overlap(path, weather, grid, box(0,0,90,90), cache)
            self.assertEqual(len(cells),1)
            self.assertEqual(cells[0]["cornAreaM2"],3600)
            self.assertEqual(cells[0]["validCropDataAreaM2"],6300)
            self.assertLess(cells[0]["validCropDataCoverage"],1)
            self.assertAlmostEqual(matrix.sum(),3600)
            self.assertAlmostEqual(matrix[0,0],2250)
            self.assertAlmostEqual(matrix[0,1],1350)
            self.assertAlmostEqual(metadata["areaConservationResidualM2"],0)


class WeatherTests(unittest.TestCase):
    def fixture(self, path, *, units="K", missing_date=False, crs="EPSG:4326"):
        with netCDF4.Dataset(path,"w",format="NETCDF3_CLASSIC") as source:
            source.geospatial_bounds_crs = crs
            count = 13 if missing_date else 14
            for key, length in (("day",count),("lat",2),("lon",2)):
                source.createDimension(key,length)
            time = source.createVariable("day","f8",("day",))
            time.units = "days since 2015-07-01 00:00:00"
            time[:] = np.arange(count)
            source.createVariable("lat","f8",("lat",))[:] = [42,42-1/24]
            source.createVariable("lon","f8",("lon",))[:] = [-93.5,-93.5+1/24]
            values = source.createVariable("air_temperature","i2",("day","lat","lon"),fill_value=32767)
            values.units = units
            values.scale_factor, values.add_offset = .1,220.
            values.set_auto_maskandscale(False)
            packed = np.full((count,2,2),800,dtype=np.int16)
            packed[0,0,1] = 32767
            values[:] = packed

    def test_packing_kelvin_and_missing_before_scaling(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"weather.nc"
            self.fixture(path)
            result = load_weather(path,"air_temperature",days_between("2015-07-01","2015-07-14"))
            self.assertAlmostEqual(result["values"][0,0,0],26.85)
            self.assertTrue(np.isnan(result["values"][0,0,1]))
            self.assertIsNone(result["metadata"]["publishedAt"])
            self.assertEqual(result["metadata"]["contentHash"],load_weather(path,"air_temperature",days_between("2015-07-01","2015-07-14"))["metadata"]["contentHash"])

    def test_dates_units_crs_and_invalid_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"weather.nc"
            for kwargs, expected in (({"missing_date":True},"missing_date"),({"units":"degF"},"invalid_units"),({"crs":"EPSG:3857"},"projection_mismatch")):
                self.fixture(path,**kwargs)
                with self.assertRaises(SpatialIssue) as error:
                    load_weather(path,"air_temperature",days_between("2015-07-01","2015-07-14"))
                self.assertEqual(error.exception.detail,expected)
            path.write_text("not NetCDF")
            with self.assertRaises(SpatialIssue) as error:
                load_weather(path,"air_temperature",days_between("2015-07-01","2015-07-14"))
            self.assertEqual(error.exception.format_state,"failed")

    def test_demonstration_missing_not_zero_and_no_new_threshold(self):
        config = {"tmaxC":35,"minimumDays":3,"windows":[[0,7],[7,14]]}
        values = np.full((14,3),30.)
        values[:3,0] = 35
        values[:2,1] = 35
        values[:3,2] = 40
        values[4,2] = np.nan
        complete, flag = demonstration_screen(values,config)
        self.assertEqual(complete.tolist(),[True,True,False])
        self.assertEqual(flag.tolist(),[True,False,False])


class SummaryTests(unittest.TestCase):
    def test_partial_coverage_not_normalized_and_no_valid_not_zero(self):
        result = denominators(100,72,36)
        self.assertEqual(result["coverage_Y_over_X"],.72)
        self.assertEqual(result["overlap_Z_over_Y"],.5)
        self.assertEqual(result["knownContribution_Z_over_X"],.36)
        empty = denominators(100,0,0)
        self.assertIsNone(empty["Z_screenOverlapM2"])
        self.assertIsNone(empty["overlap_Z_over_Y"])
        with self.assertRaises(SpatialIssue):
            denominators(100,72,80)

    def inputs(self):
        config = json.loads(Path(__file__).with_name("config.json").read_text())
        cells = [{"gridCellId":"test-corn","cornAreaM2":100.,"validCropDataAreaM2":200.,"unclassifiedInsideGeneralizedBoundaryM2":0.},
                 {"gridCellId":"test-no-corn","cornAreaM2":0.,"validCropDataAreaM2":200.,"unclassifiedInsideGeneralizedBoundaryM2":0.}]
        weather = {}
        for key,value in (("tmmx",30.),("tmmn",20.),("pr",1.)):
            array = np.full((14,1,2),value)
            if key == "tmmx":
                array[:3,0,0] = 35.
            if key == "pr":
                array[0,0,1] = np.nan
            weather[key] = {"values":array,"lat":np.array([42]),"lon":np.array([-93.5,-93.5+1/24]),"metadata":{"contentHash":key}}
        return cells,csr_matrix([[72.,28.],[0.,0.]]),weather,config,{"contentHash":"crop"},{}

    def test_partial_corn_fraction_joint_weather_and_provenance(self):
        result = summarize(*self.inputs())
        self.assertEqual(result["denominators"]["coverage_Y_over_X"],.72)
        self.assertEqual(result["denominators"]["overlap_Z_over_Y"],1)
        self.assertEqual(result["provenance"]["localStageEligibility"],"insufficient")
        self.assertEqual(len(result["provenance"]["inputs"]),4)
        self.assertEqual(result["provenance"]["methodVersion"],"iowa-mapped-corn-weather-intersection/1")

    def test_no_corn_and_repeatability(self):
        a = summarize(*self.inputs())
        b = summarize(*self.inputs())
        self.assertEqual(a,b)
        self.assertEqual(digest(a),digest(b))
        self.assertNotIn("damage", a["denominators"])

    def test_native_screen_before_weather_average(self):
        args = self.inputs()
        args[2]["pr"]["values"][:] = 1.
        result = summarize(*args)
        self.assertEqual(result["denominators"]["coverage_Y_over_X"],1)
        self.assertEqual(result["denominators"]["Z_screenOverlapM2"],72)
        # A mean-temperature-first implementation would incorrectly flag zero.
        self.assertLess(.72*35+.28*30,35)

    def test_failed_validation_preserves_previous_compact_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)/"summary.json"
            output.write_bytes(b"previous valid summary")
            with patch("run.source_requests",return_value=[]), patch("run.load_weather",side_effect=SpatialIssue("missing_date","missing date")):
                with self.assertRaises(SpatialIssue):
                    run(Path(directory),output)
            self.assertEqual(output.read_bytes(),b"previous valid summary")

    def test_retrieval_failure_preserves_existing_input_and_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            old = cache/"CDL_2015_19.tif"
            old.write_bytes(b"old accepted offline bytes")
            (cache/"acquisition.json").write_text(json.dumps({"sources":{"CDL_2015_19.tif":{"sha256":"old","publishedAt":None}}}))
            with patch("collect.urlopen",side_effect=OSError("offline")):
                with self.assertRaises(OSError):
                    collect(cache,json.loads(Path(__file__).with_name("config.json").read_text()))
            self.assertEqual(old.read_bytes(),b"old accepted offline bytes")
            manifest = json.loads((cache/"acquisition.json").read_text())
            self.assertEqual(manifest["sources"]["CDL_2015_19.tif"]["attempt"]["reason"],"retrieval_failed")
            self.assertEqual(manifest["sources"]["CDL_2015_19.tif"]["sha256"],"old")

    def test_repository_rejects_raw_cache(self):
        with self.assertRaises(ValueError):
            external_cache(ROOT/"public/data")

    def test_missing_retrieval_does_not_claim_invalid_parsed_format(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(SpatialIssue) as error:
                run(Path(directory),Path(directory)/"summary.json")
            self.assertEqual(error.exception.reason,"retrieval_failed")
            self.assertEqual(error.exception.format_state,"unknown")


if __name__ == "__main__":
    unittest.main()
