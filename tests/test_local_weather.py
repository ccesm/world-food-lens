import sys
import unittest
from pathlib import Path
from datetime import date, timedelta
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_weather import parse_daily, refresh, FIELDS

class LocalWeatherTests(unittest.TestCase):
    def payload(self):
        return {"header":{"time_standard":"UTC"},"parameters":{k:{"units":u} for k,(_,u) in FIELDS.items()},
                "properties":{"parameter":{"T2M_MAX":{"20260101":20},"T2M_MIN":{"20260101":5},"PRECTOTCORR":{"20260101":0}}}}
    def test_units_sentinels_and_missing(self):
        p=self.payload()
        self.assertEqual(parse_daily(p,date(2026,1,1),date(2026,1,1))[0]["rain"],0)
        p['properties']['parameter']['T2M_MAX']['20260101']=-999
        with self.assertRaises(ValueError):parse_daily(p,date(2026,1,1),date(2026,1,1))
        p=self.payload();p['parameters']['T2M_MAX']['units']='F'
        with self.assertRaises(ValueError):parse_daily(p,date(2026,1,1),date(2026,1,1))
        with self.assertRaises(ValueError):parse_daily(self.payload(),date(2026,1,1),date(2026,1,2))
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
