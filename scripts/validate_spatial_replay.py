#!/usr/bin/env python3
"""Compare identical consumed inputs on Mac/Linux; no outcome/parameter tuning."""
import argparse
import json
import math
import re
import tarfile
from pathlib import Path
from unittest.mock import patch
from corn_spatial import file_hash, external_cache, write_json
from corn_spatial_cache import unpack
from refresh_corn_spatial import refresh

ANNUAL_HASH="c4b589b61a1723fa12d768e94ff3b819947f077e7956bdc36c2c93fa017ea404"
WEATHER_HASH="c9e304510a92e519f8421a41d02e74e4abeb0fa93cec9e673189575140d133bc"


def compare_annual(original_root, rebuilt_root):
    """Use the EXISTING area-conservation tolerance, not a fitted threshold.

    The total-variation bound on a weighted mean is TV * (max - min).
    Quantiles/extrema do not gain a tolerance from this mean-only bound.
    Only applies to this fixed complete-weather replay (verified below).
    """
    from corn_spatial_geo import load_annual
    from corn_spatial import STATES, validate_manifest
    import numpy as np
    result={};original_weights=[];rebuilt_weights=[]
    for s in STATES:
        a,c,w=load_annual(Path(original_root)/s['id'])
        b,d,v=load_annual(Path(rebuilt_root)/s['id'])
        assert a['identity']==b['identity'] and c==d
        assert validate_manifest(Path(original_root)/s['id'])[1]==validate_manifest(Path(rebuilt_root)/s['id'])[1]
        assert a['mappedCornAreaM2']==b['mappedCornAreaM2']
        absolute=float(np.abs(w-v).sum())
        tolerance=max(.01,a['mappedCornAreaM2']*1e-9) # Frozen 1.8/1.9 geometric guard.
        assert absolute<=tolerance,'Annual overlap weights differ beyond existing geometry precision'
        result[s['id']]={'weightL1DifferenceM2':absolute,'existingAreaToleranceM2':tolerance,
                        'totalVariation':float(.5*np.abs(w/w.sum()-v/v.sum()).sum())}
        original_weights.append(w);rebuilt_weights.append(v)
    w=np.concatenate(original_weights);v=np.concatenate(rebuilt_weights)
    result['ten-state']={'totalVariation':float(.5*np.abs(w/w.sum()-v/v.sum()).sum())}
    return result


def compare(original,replay,geometry=None):
    assert original['period']==replay['period']
    assert original['methodVersion']==replay['methodVersion']
    maximum_delta=0.;maximum_area_delta=0.;maximum_coverage_delta=0.
    for first,second in zip(original['states'],replay['states'],strict=True):
        for key in ('state','annualKey','cropGeographyYear','weatherVersions','status'):
            assert first[key]==second[key],f'Scientific input identity changed: {key}'
        for key in ('mappedCornAreaM2','validWeatherAreaM2','coverage'):
            tolerance=(max(.01,first['mappedCornAreaM2']*1e-9)/first['mappedCornAreaM2'] if key=='coverage'
                       else max(.01,first['mappedCornAreaM2']*1e-9)) if geometry else max(1e-3,abs(first[key])*1e-12)
            delta=abs(first[key]-second[key])
            assert delta<=tolerance,key
            if key=='coverage':maximum_coverage_delta=max(maximum_coverage_delta,delta)
            else:maximum_area_delta=max(maximum_area_delta,delta)
        if geometry:
            # A crop-weight perturbation bound is not a missing-weather bound.
            for state in (first,second):
                assert not any(state['coverageDiagnostics']['missingValueDates'].values())
                assert state['coverageDiagnostics']['missingWeatherCellsWithCorn']==0
        for key,stat in first['weatherSummary'].items():
            for name,value in stat.items():
                delta=abs(value-second['weatherSummary'][key][name]);maximum_delta=max(maximum_delta,delta)
                bound=1e-10
                if geometry and name=='mean':
                    other=second['weatherSummary'][key]
                    bound+=geometry[first['state']]['totalVariation']*(max(stat['max'],other['max'])-min(stat['min'],other['min']))
                assert delta<=bound,f'Numerical mismatch: {first["state"]} {key} {name}'
    for key,stat in original['combined']['weatherSummary'].items():
        for name,value in stat.items():
            delta=abs(value-replay['combined']['weatherSummary'][key][name]);maximum_delta=max(maximum_delta,delta)
            maximum_delta=max(maximum_delta,delta)
            bound=1e-10
            if geometry and name=='mean':
                other=replay['combined']['weatherSummary'][key]
                bound+=geometry['ten-state']['totalVariation']*(max(stat['max'],other['max'])-min(stat['min'],other['min']))
            assert delta<=bound,f'Combined numerical mismatch: {key} {name}'
    return {'sameScientificInputs':True,'maximumWeatherDelta':maximum_delta,
            'maximumAreaDeltaM2':maximum_area_delta,'maximumCoverageDelta':maximum_coverage_delta,
            'localAnalysisHash':original['analysisHash'],'runnerAnalysisHash':replay['analysisHash'],
            'analyticalHashesIdentical':original['analysisHash']==replay['analysisHash'],
            'geometryDiagnostics':geometry,
            'interpretation':'Fixed cache: strict numerical replay. Rebuilt cache: existing geometry tolerance and mathematical mean perturbation bound; not a hazard or skill threshold'}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',required=True);p.add_argument('--output',required=True)
    p.add_argument('--rebuilt-annual-cache')
    args=p.parse_args();root=external_cache(args.directory)
    annual=root/'annual';weather=external_cache(root/'weather')
    unpack(root/'corn-spatial-annual.tar.gz',annual,ANNUAL_HASH)
    source=root/'wfl-production-weather-inputs.tar.gz'
    assert file_hash(source)==WEATHER_HASH,'Fixed weather input checksum mismatch'
    with tarfile.open(source,'r:gz') as archive:
        members=archive.getmembers()
        assert len(members)==60 and all(m.isfile() and re.fullmatch(r'[a-f0-9]{64}\.(nc|json)',m.name) and m.size<=20_000_000 for m in members)
        assert sum(m.size for m in members)<30_000_000
        for m in members:
            with archive.extractfile(m) as raw:(weather/m.name).write_bytes(raw.read())
    original=json.loads((root/'corn-spatial-local-reference.json').read_bytes())
    # Failure cannot fetch a newer preliminary vintage during fixed-input replay.
    with patch('refresh_corn_spatial.urlopen',side_effect=AssertionError('Network forbidden in fixed-input replay')):
        replay,_=refresh(annual,weather,original['period']['start'],original['period']['end'],original['generatedAt'])
    write_json(root/'replayed-fixed-summary.json',replay)
    result=compare(original,replay)
    if args.rebuilt_annual_cache:
        with patch('refresh_corn_spatial.urlopen',side_effect=AssertionError('Network forbidden in fixed-input replay')):
            rebuilt,_=refresh(Path(args.rebuilt_annual_cache),weather,original['period']['start'],original['period']['end'],original['generatedAt'])
        write_json(root/'replayed-rebuilt-summary.json',rebuilt)
        result['runnerRebuiltAnnualGrid']=compare(original,rebuilt,compare_annual(annual,Path(args.rebuilt_annual_cache)))
    write_json(args.output,result)
