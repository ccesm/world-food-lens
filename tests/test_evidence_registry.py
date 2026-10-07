"""The Python Level C pipeline may only publish metrics with a reviewed rule."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from corn_spatial import METRICS  # noqa: E402

REGISTRY = json.loads((ROOT / "src/data/evidenceRegistry.json").read_text())


def outputs(statuses):
    return {key for rule in REGISTRY["rules"].values() if rule["reviewStatus"] in statuses for key in rule["outputs"]}


class EvidenceRegistryTests(unittest.TestCase):
    def test_pipeline_metrics_have_reviewed_rules(self):
        self.assertTrue(set(METRICS) <= outputs({"reviewed", "frozen"}), set(METRICS) - outputs({"reviewed", "frozen"}))

    def test_pipeline_does_not_publish_draft_outputs(self):
        self.assertFalse(set(METRICS) & outputs({"draft", "superseded"}))


if __name__ == "__main__":
    unittest.main()
