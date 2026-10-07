import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from corn_spatial import digest, GRID, ANNUAL_METHOD
from ensure_corn_spatial import approved,cache_key,ensure
from validate_spatial_operation import inspect_public,decision,exercise_local_release
from send_alert_email import select_changes,build_message
from test_alert_email import fixture,NOW
from refresh_corn_spatial import fetch_weather
from corn_spatial import file_hash,write_json
from data_contract import DataIssue
import test_release_pipeline
import json
from validate_spatial_replay import compare



# Frozen successful Level C release (a3df594, 2026-10-07). Never read the live
# public/data copy here: a source outage there must not block the next refresh.
BASELINE=Path(__file__).resolve().parent/'fixtures/corn-spatial-baseline.json'

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

    def test_expired_budget_blocks_network_but_not_valid_cached_input(self):
        identity={'dataset':'gridMET','period':['2026-10-03']};url='https://example.com/weather'
        with tempfile.TemporaryDirectory() as d,patch('refresh_corn_spatial.urlopen') as network:
            cache=Path(d)
            with self.assertRaises(DataIssue):fetch_weather(cache,url,identity,'2026-10-05',deadline=0)
            network.assert_not_called()
            path=cache/(digest(identity)+'.nc');path.write_bytes(b'validated-weather-bytes')
            write_json(path.with_suffix('.json'),{'identity':identity,'url':url,'checkedDay':'2026-10-05','rawHash':file_hash(path)})
            self.assertEqual(fetch_weather(cache,url,identity,'2026-10-05',deadline=0)[0],path)
            network.assert_not_called()

    def test_actual_immutable_release_uses_only_owned_local_remote(self):
        fixture_repo=test_release_pipeline.GitReleaseTests()
        fixture_repo.setUp()
        try:
            fixture_repo.generate()
            source=test_release_pipeline.git(fixture_repo.repo,'rev-parse','HEAD').decode().strip()
            remote=test_release_pipeline.git(fixture_repo.repo,'remote','get-url','origin')
            with patch('validate_spatial_operation.ROOT',fixture_repo.repo):
                result=exercise_local_release(fixture_repo.repo/test_release_pipeline.ALERT,fixture_repo.repo/'dist')
            self.assertTrue(result['verified']);self.assertFalse(result['smtpContacted'])
            self.assertEqual(result['sourceRevision'],source)
            self.assertEqual(test_release_pipeline.git(fixture_repo.repo,'rev-parse','HEAD').decode().strip(),source)
            self.assertEqual(test_release_pipeline.git(fixture_repo.repo,'remote','get-url','origin'),remote)
        finally:fixture_repo.doCleanups()

    def test_cross_platform_mean_bound_does_not_allow_material_weather_difference(self):
        original=json.loads(BASELINE.read_bytes())
        candidate=copy.deepcopy(original)
        geometry={s['state']:{'totalVariation':1e-11} for s in original['states']}
        geometry['ten-state']={'totalVariation':1e-11}
        candidate['states'][0]['weatherSummary']['precipitation14DayMm']['mean']+=2e-10
        self.assertTrue(compare(original,candidate,geometry)['sameScientificInputs'])
        candidate['states'][0]['weatherSummary']['precipitation14DayMm']['mean']+=.01
        with self.assertRaises(AssertionError):compare(original,candidate,geometry)

    def test_mean_perturbation_bound_never_relaxes_quantiles_or_missing_weather(self):
        original=json.loads(BASELINE.read_bytes())
        geometry={s['state']:{'totalVariation':1e-11} for s in original['states']}
        geometry['ten-state']={'totalVariation':1e-11}
        candidate=copy.deepcopy(original)
        candidate['states'][0]['weatherSummary']['precipitation14DayMm']['p90']+=2e-10
        with self.assertRaises(AssertionError):compare(original,candidate,geometry)
        candidate=copy.deepcopy(original)
        candidate['states'][0]['coverageDiagnostics']['missingWeatherCellsWithCorn']=1
        with self.assertRaises(AssertionError):compare(original,candidate,geometry)

if __name__=='__main__':unittest.main()
