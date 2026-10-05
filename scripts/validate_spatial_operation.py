#!/usr/bin/env python3
"""Read-only release/provenance/alert isolation check. NEVER contacts SMTP/GitHub.

Uses the real evaluator against the same accepted inputs and previous ledger,
with/without Level C. Release IDs must differ, alert decisions/body must not.
"""
import argparse
import json
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

from corn_spatial import write_json
from release_pipeline import validate_manifest, commit_bytes, CACHES, ALERT, LEDGER
from send_alert_email import select_changes, build_message

ROOT = Path(__file__).resolve().parents[1]


def decision(value):
    if isinstance(value, dict):
        return {k: decision(v) for k, v in value.items() if k != "releaseId" and not
                (k == "release" and isinstance(v,str) and re.fullmatch(r"release-[a-f0-9]{64}",v))}
    if isinstance(value, list):
        return [decision(v) for v in value]
    return value


def inspect_public(spatial):
    raw = json.dumps(spatial)
    assert not re.search(r"/Users/|/private/tmp/|/home/runner/|file://|[A-Z]:\\", raw), "Internal path in public artifact"
    def visit(value):
        if isinstance(value, dict):
            assert not {"cells", "pixels", "rawGrid", "raster", "matrix"}.intersection(value), "Raw grid in public artifact"
            for item in value.values(): visit(item)
        elif isinstance(value, list):
            for item in value: visit(item)
    visit(spatial)
    for s in spatial["states"]:
        assert s["period"] == spatial["period"]
        if s["status"] == "ok":
            year = s["cropGeographyYear"]
            assert s["geographyUse"] == ("year-specific" if year == int(s["period"]["end"][:4]) else "validated-older-geography-proxy")
            assert s.get("geographyReason")
        assert s["localStageEligibility"] == "insufficient"


def validate(snapshot):
    snapshot = Path(snapshot)
    directory = snapshot.parent
    feed = json.loads(snapshot.read_bytes())
    source = feed["release"]["sourceRevision"]
    previous = lambda path, optional: commit_bytes(ROOT, source, path, optional)
    def incoming(path, optional):
        p = directory / Path(path).name if path.startswith("public/data/") else ROOT / path
        return p.read_bytes() if p.exists() else None
    validate_manifest(json.loads((directory/"release-manifest.json").read_bytes()), snapshot.read_bytes(), incoming, previous)
    inspect_public(feed["analysis"]["cornSpatial"])
    with tempfile.TemporaryDirectory(prefix="wfl-no-email-validation-") as temp:
        target = Path(temp)
        for name in CACHES:
            path = directory/name
            if path.exists(): (target/name).write_bytes(path.read_bytes())
        for path in (ALERT, LEDGER):
            raw = previous(path, True)
            if raw is not None: (target/Path(path).name).write_bytes(raw)
        subprocess.run(["node", str(ROOT/"scripts/evaluate_alerts.mjs"), "--data-dir", str(target),
                        "--now", feed["generatedAt"], "--source-revision", source], check=True, capture_output=True)
        baseline = json.loads((target/"monitor-alerts.json").read_bytes())
    for key in ("active", "events", "health", "email"):
        assert decision(feed.get(key)) == decision(baseline.get(key)), f"Level C changed legacy {key}"
    ledger = json.loads(previous(LEDGER, True) or "{}")
    now = datetime.fromisoformat(feed["generatedAt"].replace("Z", "+00:00"))
    old_changes, old_gaps = select_changes(baseline, ledger, now)
    changes, gaps = select_changes(feed, ledger, now)
    assert decision([changes, gaps]) == decision([old_changes, old_gaps]), "Notification eligibility changed"
    dummy = {"user":"test@example.com", "recipient":"test@example.com"}
    body = build_message(feed, changes, gaps, dummy, now).get_content()
    assert body == build_message(baseline, old_changes, old_gaps, dummy, now).get_content(), "Notification body changed"
    subprocess.run(["node", str(ROOT/"scripts/validate_spatial_display.mjs"), str(snapshot)], check=True)
    return {"releaseManifest":True, "alertDecisions":True, "notificationEligibility":True,
            "notificationBody":True, "smtpContacted":False, "compactArtifact":True,
            "releaseId":feed["release"]["id"], "spatialAnalysisHash":feed["analysis"]["cornSpatial"]["analysisHash"]}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--snapshot", required=True)
    p.add_argument("--output")
    args = p.parse_args()
    result = validate(args.snapshot)
    if args.output: write_json(args.output, result)
    print(json.dumps(result, sort_keys=True))
