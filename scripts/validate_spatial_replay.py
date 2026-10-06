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


def compare(original,replay):
    assert original['period']==replay['period']
    assert original['methodVersion']==replay['methodVersion']
    maximum_delta=0.
    for first,second in zip(original['states'],replay['states'],strict=True):
        for key in ('state','annualKey','cropGeographyYear','weatherVersions','status'):
            assert first[key]==second[key],f'Scientific input identity changed: {key}'
        for key in ('mappedCornAreaM2','validWeatherAreaM2','coverage'):
            assert math.isclose(first[key],second[key],rel_tol=1e-12,abs_tol=1e-3),key
        for key,stat in first['weatherSummary'].items():
            for name,value in stat.items():
                delta=abs(value-second['weatherSummary'][key][name]);maximum_delta=max(maximum_delta,delta)
                assert delta<=1e-10,f'Numerical mismatch: {first["state"]} {key} {name}'
    for key,stat in original['combined']['weatherSummary'].items():
        for name,value in stat.items():
            delta=abs(value-replay['combined']['weatherSummary'][key][name]);maximum_delta=max(maximum_delta,delta)
            assert delta<=1e-10,f'Combined numerical mismatch: {key} {name}'
    return {'sameScientificInputs':True,'maximumWeatherDelta':maximum_delta,
            'localAnalysisHash':original['analysisHash'],'runnerAnalysisHash':replay['analysisHash'],
            'analyticalHashesIdentical':original['analysisHash']==replay['analysisHash'],
            'interpretation':'Numerical roundoff tolerance only, not a hazard or skill threshold'}


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
        result['runnerRebuiltAnnualGrid']=compare(original,rebuilt)
    write_json(args.output,result)
