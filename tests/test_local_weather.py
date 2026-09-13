import sys
import unittest
from pathlib import Path
from datetime import date, timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_weather import parse_daily, parse_soil_climatology, refresh, FIELDS

class LocalWeatherTests(unittest.TestCase):
    def payload(self):
        return {"header":{"time_standard":"UTC"},"parameters":{k:{"units":u} for k,(_,u) in FIELDS.items()},
                "properties":{"parameter":{"T2M_MAX":{"20260101":20},"T2M_MIN":{"20260101":5},"PRECTOTCORR":{"20260101":0},
                                             "GWETROOT":{"20260101":.4},"GWETTOP":{"20260101":.3}}}}
    def test_units_sentinels_and_missing(self):
        p=self.payload()
        self.assertEqual(parse_daily(p,date(2026,1,1),date(2026,1,1))[0]["rain"],0)
        p['properties']['parameter']['T2M_MAX']['20260101']=-999
        with self.assertRaises(ValueError):parse_daily(p,date(2026,1,1),date(2026,1,1))
        p=self.payload();p['parameters']['T2M_MAX']['units']='F'
        with self.assertRaises(ValueError):parse_daily(p,date(2026,1,1),date(2026,1,1))
        p=self.payload();p['properties']['parameter']['GWETROOT']['20260101']=1.2
        with self.assertRaises(ValueError):parse_daily(p,date(2026,1,1),date(2026,1,1))
        with self.assertRaises(ValueError):parse_daily(self.payload(),date(2026,1,1),date(2026,1,2))
    def test_soil_climatology_uses_same_month_distribution(self):
        values={key:{} for key in ('GWETROOT','GWETTOP')}
        for year in range(1991,2021):
            for month in range(1,13):
                values['GWETROOT'][f'{year}{month:02d}']=round(.2+(year-1991)/100,2)
                values['GWETTOP'][f'{year}{month:02d}']=round(.1+(year-1991)/100,2)
        payload={'parameters':{key:{'units':'1'} for key in values},'properties':{'parameter':values}}
        parsed=parse_soil_climatology(payload)
        self.assertEqual(parsed['baseline'],'1991–2020')
        self.assertEqual(len(parsed['months']),12)
        self.assertAlmostEqual(parsed['months']['01']['root']['median'],.345)
        del values['GWETROOT']['199101']
        with self.assertRaises(ValueError):parse_soil_climatology(payload)
    def test_independent_last_good_fallback(self):
        old={'points':{'bad':{'days':[{'date':'2026-09-08'}],'fetchedAt':'old'}}}
        def fetch(p,start,end):
            if p['id']=='bad':raise ValueError('offline')
            self.assertEqual(start,date(2024,1,1))
            self.assertEqual(end,date(2026,9,9))
            return {'days':[{'date':end.isoformat()}]}
        result=refresh(old,[{'id':'bad'},{'id':'ok'}],date(2026,9,13),fetch,'new')
        self.assertEqual(result['points']['bad']['fetchedAt'],'old')
        self.assertEqual(result['points']['bad']['status'],'error')
        self.assertEqual(result['points']['ok']['status'],'ok')
        self.assertNotIn('status',old['points']['bad'])
