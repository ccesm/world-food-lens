#!/usr/bin/env python3
"""CI assertions, never chooses new tolerances or hazard parameters."""
import argparse
import json
from pathlib import Path

from corn_spatial import STATES


def validate(cold,warm,failure):
    expected=[s["id"] for s in STATES]
    assert [s["state"] for s in cold["states"]]==expected
    assert cold["combined"]["includedStates"]==expected, "Cold refresh has unavailable states; inspect diagnostic artifacts"
    assert cold["analysisHash"]==warm["analysisHash"], "Warm run changed deterministic analytical output"
    assert failure["combined"]["unavailableStates"]==["NE"]
    assert failure["combined"]["mappedCornAreaM2"]==cold["combined"]["mappedCornAreaM2"]
    assert failure["combined"]["coverage"]<cold["combined"]["coverage"]
    for s in failure["states"]:
        if s["state"]!="NE":
            original=next(r for r in cold["states"] if r["state"]==s["state"])
            assert s["weatherSummary"]==original["weatherSummary"], "A failing state changed another state's values"


if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("cold","warm","failure"):p.add_argument("--"+name,required=True)
    args=p.parse_args()
    validate(*[json.loads(Path(getattr(args,k)).read_text()) for k in ("cold","warm","failure")])
    print("Ten-state cold/warm determinism and state isolation verified")
