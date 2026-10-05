import copy
import unittest
from contract_fixtures import records, fixture, STAMP
from data_contract import attach_metadata, valid_metadata, fingerprint, timestamp
from refresh_data import refresh_bundle


class ContractTests(unittest.TestCase):
    def test_new_and_unchanged_identity_excludes_attempt_clocks(self):
        rows = records()
        for row in rows.values():
            self.assertTrue(valid_metadata(row["metadata"]))
        self.assertEqual(rows["new"]["metadata"]["cache"], "new")
        self.assertEqual(rows["unchanged"]["metadata"]["cache"], "unchanged")
        self.assertEqual(rows["new"]["metadata"]["version"], rows["unchanged"]["metadata"]["version"])
        self.assertNotEqual(rows["new"]["fetchedAt"], rows["unchanged"]["fetchedAt"])
        self.assertIsNone(rows["new"]["metadata"]["observation"]["publishedAt"])

    def test_failure_keeps_values_time_identity_and_accepted_validation(self):
        rows = records()
        for name in ("offline", "semantic", "structural", "regression"):
            row = rows[name]
            self.assertEqual(row["data"], rows["new"]["data"])
            self.assertEqual(row["metadata"]["accepted"], rows["new"]["metadata"]["accepted"])
            self.assertEqual(row["metadata"]["version"], rows["new"]["metadata"]["version"])
            self.assertEqual(row["source"], rows["new"]["source"])
            self.assertEqual(row["metadata"]["attempt"]["checkedAt"], STAMP)
        self.assertEqual(rows["offline"]["metadata"]["attempt"]["retrieval"], "failed")
        self.assertEqual(rows["semantic"]["metadata"]["attempt"]["format"], "passed")
        self.assertEqual(rows["semantic"]["metadata"]["attempt"]["semantic"], "failed")
        self.assertEqual(rows["structural"]["metadata"]["attempt"]["reason"], "invalid_format")
        self.assertEqual(rows["regression"]["metadata"]["attempt"]["reason"], "publication_regression")

    def test_contract_required_fields_enums_and_combinations(self):
        good = records()["new"]["metadata"]
        for key in good:
            bad = copy.deepcopy(good)
            del bad[key]
            self.assertFalse(valid_metadata(bad), key)
        for field, value in (("contractVersion", True), ("cache", "realtime"), ("sourceUrl", "http://bad")):
            bad = copy.deepcopy(good)
            bad[field] = value
            self.assertFalse(valid_metadata(bad))
        bad = copy.deepcopy(good)
        bad["attempt"]["retrieval"] = "failed"
        self.assertFalse(valid_metadata(bad))
        self.assertIsNone(timestamp("2026-02-30T00:00:00Z"))

    def test_noaa_window_and_gdo_unverified_period_are_distinct(self):
        noaa = {"status": "ok", "fetchedAt": STAMP, "lastAttemptAt": STAMP,
                "source": {"period": "2026 JAS"}, "data": {"latest": {"period": "2026 JAS", "startMonth": "2026-07", "endMonth": "2026-09"}}}
        attach_metadata(noaa, "noaa")
        self.assertEqual(noaa["metadata"]["observation"]["period"], "2026-09")
        self.assertEqual(noaa["metadata"]["extensions"]["observationWindow"]["startMonth"], "2026-07")
        drought = {"status": "ok", "fetchedAt": STAMP, "maps": {"shortTerm": {"period": "2026-09-21"}}}
        attach_metadata(drought, "drought")
        self.assertEqual(drought["metadata"]["accepted"]["format"], "passed")
        self.assertEqual(drought["metadata"]["accepted"]["period"], "unverified")
        previous = copy.deepcopy(drought)
        attach_metadata(drought, "drought", previous)
        self.assertEqual(previous["metadata"]["cache"], "new")

    def test_enso_available_report_does_not_invent_strength(self):
        record = {"status": "ok", "fetchedAt": STAMP, "data": {"issuedAt": "2026-09-10",
                  "strengthEvidence": {"status": "not-reliably-extracted", "sourceText": "A very strong event is unlikely."}}}
        attach_metadata(record, "enso")
        self.assertEqual(record["metadata"]["attempt"]["semantic"], "passed")
        self.assertEqual(record["metadata"]["extensions"]["strengthExtraction"], "not-reliably-extracted")

    def test_assessment_changes_are_not_new_source_content(self):
        record = {"data": {"history": [1, 2], "coverageAssessment": {"state": "baseline-established"}}}
        other = copy.deepcopy(record)
        other["data"]["coverageAssessment"] = {"state": "compared"}
        self.assertEqual(fingerprint(record), fingerprint(other))
