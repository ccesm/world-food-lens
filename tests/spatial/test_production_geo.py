"""Run separately using the pinned optional GIS runtime."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import netCDF4
import numpy as np
from scipy.sparse import csr_matrix, save_npz
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from corn_spatial import annual_identity, digest, file_hash, write_json, dates, combine, METRICS
from corn_spatial_geo import read_weather, summarize, load_annual
from corn_spatial_cache import pack, unpack, verify
from refresh_corn_spatial import fetch_weather, refresh, archive_inputs
from data_contract import DataIssue


class SpatialRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.period = dates("2026-09-20", "2026-10-03")
        self.coords = {"lat": [42., 42.-1/24], "lon": [-94., -94.+1/24]}

    def arrays(self):
        return {"tmmx": np.full((14,4),30.), "tmmn":np.full((14,4),15.), "pr":np.full((14,4),2.)}

    def test_complete_and_partial_weather_no_normalization(self):
        arrays=self.arrays();weights=np.array([10.,20.,30.,40.])
        stats,_,joint,_,_=summarize(arrays,weights,self.period)
        self.assertEqual(joint,100);self.assertEqual(stats["precipitation14DayMm"]["mean"],28)
        arrays["pr"][0,3]=np.nan
        _,diagnostics,joint,_,_=summarize(arrays,weights,self.period)
        self.assertEqual(joint,60);self.assertEqual(diagnostics["missingValueDates"]["pr"],[self.period[0]])

    def test_whole_missing_date_no_false_precipitation_zero(self):
        arrays=self.arrays();arrays["pr"][3,:]=np.nan
        stats,_,joint,_,_=summarize(arrays,np.ones(4),self.period)
        self.assertEqual(joint,0);self.assertIsNone(stats["precipitation14DayMm"])

    def test_impossible_temperature_pair_rejected(self):
        arrays=self.arrays();arrays["tmmn"][0,0]=31
        with self.assertRaises(DataIssue):summarize(arrays,np.ones(4),self.period)

    def test_combined_distribution_is_not_average_of_state_percentiles(self):
        a={k:np.array([1.]) for k in METRICS};b={k:np.array([100.]) for k in METRICS}
        states=[{"state":"IA","status":"ok","mappedCornAreaM2":99,"validWeatherAreaM2":99,"annualKey":"a","weatherVersions":{}},
                {"state":"IL","status":"ok","mappedCornAreaM2":1,"validWeatherAreaM2":1,"annualKey":"b","weatherVersions":{}}]
        c=combine(states,[(a,np.array([99.])),(b,np.array([1.]))])
        self.assertEqual(c["weatherSummary"][METRICS[0]]["p90"],1)

    def nc(self,path,days):
        with netCDF4.Dataset(path,"w") as nc:
            nc.geospatial_bounds_crs="EPSG:4326"
            for name,size in (("day",len(days)),("lat",2),("lon",2)):nc.createDimension(name,size)
            d=nc.createVariable("day","f8",("day",));d.units="days since 2026-09-20";d[:]=days
            for k in ("lat","lon"):nc.createVariable(k,"f8",(k,))[:]=self.coords[k]
            v=nc.createVariable("air_temperature","f4",("day","lat","lon"),fill_value=-9999)
            v.units="K";v[:]=np.full((len(days),2,2),300.)

    def test_reader_preserves_missing_dates_and_geometry_identity(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"source.nc";self.nc(path,[0,2])
            array,metadata=read_weather(path,"air_temperature",self.period,self.coords)
            self.assertTrue(np.isnan(array[1]).all());self.assertEqual(len(metadata["missingDates"]),12)
            other={**self.coords,"lat":[43.,43.-1/24]}
            with self.assertRaises(DataIssue):read_weather(path,"air_temperature",self.period,other)

    def test_reader_empty_or_out_of_period_dates(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"source.nc";self.nc(path,[20])
            with self.assertRaises(DataIssue):read_weather(path,"air_temperature",self.period,self.coords)

    def package(self,root,state="IA",partial=0):
        p=root/state;p.mkdir(parents=True)
        coords={**self.coords,"bounds":{"north":43,"south":41,"east":-93,"west":-95}}
        identity=annual_identity(state,2023,"a"*64,"b"*64,digest({**self.coords,"crs":"EPSG:4326"}))
        write_json(p/"cells.json",[{"id":"grid:r1:c1","cornAreaM2":100.,"validAreaM2":100.,"cornFraction":100/81000000}])
        write_json(p/"coordinates.json",coords)
        save_npz(p/"overlap.npz",csr_matrix([[25.,25.,25.,25.-partial]]))
        m={"key":digest(identity),"identity":identity,"mappedCornAreaM2":100.,
           "artifacts":{f:file_hash(p/f) for f in ("cells.json","coordinates.json","overlap.npz")}}
        write_json(p/"manifest.json",m);return m

    def test_valid_annual_matrix_reuse_and_small_positive_residual(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);self.package(p,partial=.082)
            m,_,weights=load_annual(p/"IA")
            self.assertAlmostEqual(float(weights.sum()),99.918)
            self.assertEqual(m["mappedCornAreaM2"],100)

    def test_bad_matrix_fails_not_zero(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);m=self.package(p)
            save_npz(p/"IA/overlap.npz",csr_matrix([[200.,0.,0.,0.]]))
            m["artifacts"]["overlap.npz"]=file_hash(p/"IA/overlap.npz");write_json(p/"IA/manifest.json",m)
            with self.assertRaises(DataIssue):load_annual(p/"IA")

    def test_immutable_annual_archive_is_deterministic_and_checked(self):
        from corn_spatial import STATES,GRID,ANNUAL_METHOD
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/"annual";root.mkdir();manifests=[self.package(root,s["id"]) for s in STATES]
            write_json(root/"index.json",{"cropYear":2023,"grid":GRID,"methodVersion":ANNUAL_METHOD,"failures":{},
                "states":{m["identity"]["state"]:m["key"] for m in manifests},
                "partitionAudit":{"sumSafe":True,"duplicateCornAreaM2":0,"inputHashes":{s["id"]:"a"*64 for s in STATES},
                                  "nativeAreaM2":{s["id"]:100 for s in STATES}}})
            one,two=Path(d)/"one.tar.gz",Path(d)/"two.tar.gz"
            self.assertEqual(pack(root,one),pack(root,two))
            self.assertEqual(unpack(one,Path(d)/"restored",file_hash(one)),verify(root))
            with self.assertRaises(ValueError):unpack(one,Path(d)/"rejected","0"*64)

    def test_weather_cache_valid_reuse_and_corruption_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);identity={"variable":"pr","dates":self.period,"geometry":"a"*64};key=digest(identity)
            write_json(p/(key+".nc"),{"fixture":True})
            write_json(p/(key+".json"),{"identity":identity,"url":"https://example.org","checkedDay":"2026-10-05","rawHash":file_hash(p/(key+".nc"))})
            with patch("refresh_corn_spatial.urlopen",side_effect=OSError("offline")) as fetch:
                fetch_weather(p,"https://example.org",identity,"2026-10-05");self.assertEqual(fetch.call_count,0)
                write_json(p/(key+".nc"),{})
                with self.assertRaises(DataIssue):fetch_weather(p,"https://example.org",identity,"2026-10-05",attempts=1)

    def test_weather_preliminary_requires_new_day_recheck(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);identity={"variable":"pr"};key=digest(identity)
            write_json(p/(key+".nc"),{});write_json(p/(key+".json"),{"identity":identity,"url":"https://example.org",
                "checkedDay":"2026-10-04","rawHash":file_hash(p/(key+".nc"))})
            with patch("refresh_corn_spatial.urlopen",side_effect=OSError("offline")):
                with self.assertRaises(DataIssue):fetch_weather(p,"https://example.org",identity,"2026-10-05",attempts=1)

    def test_exact_weather_input_archive_is_checked_and_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);key="a"*64
            write_json(root/(key+".nc"),{"source":"fixture"});sha=file_hash(root/(key+".nc"))
            write_json(root/(key+".json"),{"rawHash":sha})
            artifact={"states":[{"weatherVersions":{"pr":[{"rawFileHash":sha}]}}]}
            one=archive_inputs(root,artifact,root/"one.tar.gz")
            two=archive_inputs(root,artifact,root/"two.tar.gz")
            self.assertEqual(one["sha256"],two["sha256"])
            write_json(root/(key+".nc"),{})
            with self.assertRaises(DataIssue):archive_inputs(root,artifact,root/"bad.tar.gz")


if __name__=="__main__":unittest.main()
