#!/usr/bin/env python3
"""G1.0 read-only release-to-release revision audit over the repository's own history.

Scans every committed public/data/official-data.json, groups USDA PSD values by
source release (releasePeriod), and compares consecutive releases for the same
commodity x geography x marketing year x metric. Only the metrics the current
parser keeps (production, domestic consumption, ending stocks, stocks-to-use)
can exist in this history. Reports counts and |revisionPct| quantiles; when no
release pair exists it says so instead of inventing a distribution.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = "public/data/official-data.json"
METRICS = {"production": "production", "consumption": "domesticUse", "endingStocks": "endingStocks"}


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def quantiles(values):
    if not values:
        return None
    ordered = sorted(values)
    pick = lambda q: ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1) + .5))]
    return {"count": len(ordered), "medianAbs": pick(.5), "p50": pick(.5), "p75": pick(.75), "p90": pick(.9), "max": ordered[-1]}


def snapshot(raw):
    """{release: {(commodity, geography, year, metric): value}} from one committed file."""
    usda = (json.loads(raw).get("sources") or {}).get("usda") or {}
    data = usda.get("data") or {}
    out = {}
    for commodity, grain in (data.get("grains") or {}).items():
        release = grain.get("releasePeriod")
        if not release:
            continue
        values = out.setdefault(release, {})
        for row in grain.get("history") or []:
            for source, metric in METRICS.items():
                values[(commodity, "world-derived", row["year"], metric)] = row.get(source)
            if row.get("consumption"):
                values[(commodity, "world-derived", row["year"], "stocksToUse")] = row["endingStocks"] / row["consumption"] * 100
        for year, entry in (grain.get("coverage") or {}).items():
            for contributor in entry.get("contributors") or []:
                for source, metric in METRICS.items():
                    values[(commodity, contributor["id"], year, metric)] = contributor.get(source)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    commits = git("log", "--format=%H", "origin/main", "--", PATH).split() or git("log", "--format=%H", "--", PATH).split()
    releases = {}
    for commit in reversed(commits):
        try:
            for release, values in snapshot(git("show", f"{commit}:{PATH}")).items():
                releases.setdefault(release, values)  # First commit carrying a release is that release's values.
        except (subprocess.CalledProcessError, ValueError):
            continue
    ordered = sorted(releases)
    changes, anomalies = {}, []
    for previous, current in zip(ordered, ordered[1:]):
        for key, value in releases[current].items():
            prior = releases[previous].get(key)
            if value is None or prior is None:
                continue
            if prior == 0:
                anomalies.append({"key": list(key), "reason": "zero previous estimate; revisionPct undefined"})
                continue
            commodity, geography, _, metric = key
            changes.setdefault(f"{metric}|{commodity}", []).append(abs(value / prior - 1) * 100)
    result = {"purpose": "G1.0 read-only release-to-release revision audit of repository history",
              "commitsScanned": len(commits), "releasesFound": ordered, "releasePairs": len(ordered) - 1 if ordered else 0,
              "absoluteRevisionPctByMetric": {k: quantiles(v) for k, v in sorted(changes.items())},
              "anomalies": anomalies[:50],
              "limitation": "Only production, domestic consumption, ending stocks and stocks-to-use are retained in history; "
                            "harvested area and yield revisions cannot exist until G1.1 retains them."}
    Path(args.output).write_text(json.dumps(result, indent=1) + "\n")
    print(json.dumps({k: result[k] for k in ("commitsScanned", "releasesFound", "releasePairs")}))


if __name__ == "__main__":
    main()
