#!/usr/bin/env python3
"""Controlled warm/outage runs on copied data. No production writes or SMTP."""
import argparse
import json
import subprocess
import shutil
import sys
import time
from pathlib import Path
from corn_spatial import external_cache, write_json
from release_pipeline import CACHES, ALERT, LEDGER, commit_bytes
from validate_corn_spatial_run import validate as validate_runs
from validate_spatial_operation import validate as validate_release
from ensure_corn_spatial import ensure

ROOT=Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    for name in ("annual-cache","weather-cache","cold-data","output"):p.add_argument("--"+name,required=True)
    args=p.parse_args()
    cold_dir=Path(args.cold_data)
    cold=json.loads((cold_dir/"corn-spatial.json").read_bytes())
    feed=json.loads((cold_dir/"monitor-alerts.json").read_bytes())
    source=feed["release"]["sourceRevision"]
    output=external_cache(args.output)
    results={}
    for scenario in ("warm","one-state","unavailable","corrupt-cache"):
        started=time.perf_counter()
        directory=output/scenario;directory.mkdir(exist_ok=True)
        for name in CACHES:
            path=cold_dir/name
            if path.exists():(directory/name).write_bytes(path.read_bytes())
        for name in (ALERT,LEDGER):
            raw=commit_bytes(ROOT,source,name,True)
            if raw is not None:(directory/Path(name).name).write_bytes(raw)
        annual=args.annual_cache if scenario!="unavailable" else str(output/"deliberately-absent-annual-cache")
        if scenario=="corrupt-cache":
            annual=output/"corrupt-copy"/"annual"
            if not annual.exists():shutil.copytree(args.annual_cache,annual)
            (annual/"IA/cells.json").write_text("[]") # Owned derived fixture only; never source/accepted cache.
            settings=json.loads((ROOT/"src/data/cornSpatial.json").read_bytes())
            def unavailable_restore():raise ValueError("Controlled fixture: no restore or source mutation")
            check=ensure(annual,output,settings,rebuild=False,restore=unavailable_restore)
            assert not check['available']
            write_json(output/'corrupt-cache-detection.json',check)
            annual=str(annual)
        command=[sys.executable,str(ROOT/"scripts/refresh_corn_spatial.py"),"--annual-cache",annual,
            "--weather-cache",args.weather_cache,"--output",str(directory/"corn-spatial.json"),
            "--now",feed["generatedAt"],"--start",cold["period"]["start"],"--end",cold["period"]["end"],
            "--performance",str(output/f"{scenario}-performance.json")]
        if scenario=="one-state":command.extend(["--fail-state","NE"])
        subprocess.run(command,check=True)
        subprocess.run(["node",str(ROOT/"scripts/evaluate_alerts.mjs"),"--data-dir",str(directory),
                        "--now",feed["generatedAt"],"--source-revision",source],check=True)
        results[scenario]=validate_release(directory/"monitor-alerts.json")
        results[scenario]["scenarioSeconds"]=time.perf_counter()-started
    warm=json.loads((output/"warm/corn-spatial.json").read_bytes())
    failure=json.loads((output/"one-state/corn-spatial.json").read_bytes())
    validate_runs(cold,warm,failure)
    missing=json.loads((output/"unavailable/corn-spatial.json").read_bytes())
    assert len(missing["combined"]["unavailableStates"])==10
    assert missing["combined"]["coverage"] is None
    assert missing["combined"]["mappedCornAreaM2"] is None
    corrupt=json.loads((output/'corrupt-cache/corn-spatial.json').read_bytes())
    assert corrupt['combined']['unavailableStates']==['IA']
    assert corrupt['combined']['coverage'] is None
    assert len(corrupt['combined']['includedStates'])==9
    write_json(output/"scenario-validation.json",results)
