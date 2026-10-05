import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from corn_spatial import digest, GRID, ANNUAL_METHOD
from ensure_corn_spatial import approved,cache_key,ensure
from validate_spatial_operation import inspect_public,decision
from send_alert_email import select_changes,build_message
from test_alert_email import fixture,NOW


class SpatialOperationsTests(unittest.TestCase):
    def settings(self):
        index={"cropYear":2023,"grid":GRID,"methodVersion":ANNUAL_METHOD}
        settings={"cropGeographyYear":2023,"annualMethodVersion":ANNUAL_METHOD,
                  "annualIndexHash":digest(index),"annualAsset":{"sha256":"a"*64}}
        return index,settings

    def test_valid_reuse_no_download_or_rebuild(self):
        index,s=self.settings()
        with tempfile.TemporaryDirectory() as d,patch('ensure_corn_spatial.verify',return_value=index):
            result=ensure(d,d,s,restore=lambda:self.fail('Restored matching cache'),generate=lambda:self.fail('Rebuilt matching cache'))
            self.assertEqual(result['action'],'reuse')

    def test_cold_generation_and_corrupt_restore_failures(self):
        index,s=self.settings()
        with tempfile.TemporaryDirectory() as d,patch('ensure_corn_spatial.verify',side_effect=[ValueError('missing'),ValueError('corrupt'),index]):
            calls=[]
            result=ensure(d,d,s,restore=lambda:calls.append('restore'),generate=lambda:calls.append('generate'))
            self.assertEqual(calls,['restore','generate']);self.assertEqual(result['action'],'generate')
            self.assertTrue(result['available'])

    def test_unapproved_rebuild_remains_unavailable(self):
        index,s=self.settings()
        with tempfile.TemporaryDirectory() as d,patch('ensure_corn_spatial.verify',return_value={**index,'cropYear':2022}):
            result=ensure(d,d,s,restore=lambda:None,generate=lambda:None)
            self.assertFalse(result['available']);self.assertNotIn('mappedCornArea',result)

    def test_scientific_identity_changes_cache_key(self):
        _,s=self.settings();key=cache_key(s)
        self.assertNotEqual(cache_key({**s,'annualIndexHash':'b'*64}),key)
        self.assertNotEqual(cache_key({**s,'annualAsset':{'sha256':'c'*64}}),key)
        for altered in ({**s,'cropGeographyYear':2025},{**s,'annualMethodVersion':'obsolete'}):
            with self.assertRaises(ValueError):cache_key(altered)

    def test_internal_paths_and_raw_cells_never_public(self):
        for value in ({'states':[],'detail':'/home/runner/work/raw.tif'},{'states':[],'cells':[]}):
            with self.assertRaises(AssertionError):inspect_public(value)

    def test_spatial_health_never_changes_notification_eligibility_or_body(self):
        baseline=fixture();ledger={}
        for mode in ('healthy','partial','unavailable','stale','proxy'):
            feed=copy.deepcopy(baseline)
            feed['analysis']={'cornSpatial':{'status':mode}}
            feed['dataHealth']={'datasets':[{'id':'cornSpatial/IA','status':mode}]}
            before=select_changes(baseline,ledger,NOW);after=select_changes(feed,ledger,NOW)
            self.assertEqual(after,before)
            config={'user':'test@example.com','recipient':'test@example.com'}
            self.assertEqual(build_message(feed,*after,config,NOW).get_content(),build_message(baseline,*before,config,NOW).get_content())

    def test_release_identity_not_alert_policy(self):
        self.assertEqual(decision({'releaseId':'x','severity':'red'}),decision({'releaseId':'y','severity':'red'}))

if __name__=='__main__':unittest.main()
