import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_enso import parse, refresh

SEASONS = "ASO SON OND NDJ DJF JFM FMA MAM AMJ".split()
ADVISORY = """10 September 2026 ENSO Alert System Status: <span>El Ni&ntilde;o Advisory</span>
El Ni&ntilde;o is strengthening, with a greater than 90% chance of a very strong event during the Northern Hemisphere fall and winter 2026-27.
values increased, reaching +1.8&deg;C in Ni&ntilde;o-3.4."""


def table(columns):
    rows = []
    for index, code in enumerate(SEASONS):
        values = [0, 0, 100] if columns == 3 else [0.1, 0.2, 0.3, 0.4 + index / 10, 1.5 + index / 10, 2.5 + index / 10, 3.5 + index / 10]
        rows.append(f'<tr><th scope="row"><abbr>{code} <span>Aug Sep Oct</span></abbr></th>' + ''.join(f'<td>{v}</td>' for v in values) + '</tr>')
    return "<h2>Issued September 2026</h2><table>" + "".join(rows) + "</table>"


class TestENSOCache(unittest.TestCase):
    def strength_statement(self, statement):
        advisory = ADVISORY.replace(ADVISORY.splitlines()[1], statement)
        return parse(advisory, table(3), table(7))

    def test_negation_never_becomes_a_positive_strength_claim(self):
        data = self.strength_statement("El Niño: a very strong event is unlikely during fall and winter 2026-27.")
        self.assertNotEqual(data["strengthOutlook"], "very-strong-likely")
        self.assertEqual(data["strengthEvidence"]["status"], "not-reliably-extracted")
        self.assertIsNone(data["strengthEvidence"]["probability"])
        self.assertIn("unlikely", data["strengthEvidence"]["sourceText"])

    def test_positive_strength_probability_keeps_its_event_period_and_quote(self):
        data = parse(ADVISORY, table(3), table(7))
        evidence = data["strengthEvidence"]
        self.assertEqual(evidence["status"], "extracted")
        self.assertEqual(evidence["event"], {"phase": "el-nino", "strength": "very-strong"})
        self.assertEqual(evidence["probability"], {"operator": "gt", "percent": 90})
        self.assertEqual(evidence["period"]["startMonth"], "2026-09")
        self.assertEqual(evidence["period"]["endMonth"], "2027-02")
        self.assertIn("greater than 90%", evidence["sourceText"])

    def test_uncertain_unrelated_or_missing_strength_text_is_explicitly_unextracted(self):
        for statement in (
            "El Niño may have a greater than 90% chance of a very strong event during fall and winter 2026-27.",
            "A very strong event occurred in 1997; El Niño is discussed here for historical context.",
            "El Niño is very strong during fall and winter 2026-27.",
            "El Niño has a 90% chance of continuing; a very strong event is possible during fall and winter 2026-27.",
            "El Niño has a greater than 90% chance of NOT having a very strong event during fall and winter 2026-27.",
            "El Niño has a greater than 190% chance of a very strong event during fall and winter 2026-27.",
            "El Niño has a greater than 100% chance of a very strong event during fall and winter 2026-27.",
            "El Niño has a less than 0% chance of a very strong event during fall and winter 2026-27.",
            "El Niño has a greater than 90% chance of a very strong event.",
            "No strength outlook provided.",
            "",
        ):
            with self.subTest(statement=statement):
                data = self.strength_statement(statement)
                self.assertEqual(data["strengthEvidence"]["status"], "not-reliably-extracted")
                self.assertIsNone(data["strengthEvidence"]["probability"])
                self.assertNotEqual(data["strengthOutlook"], "very-strong-likely")

    def test_probability_is_bound_to_its_actual_period_and_strength(self):
        data = self.strength_statement("El Niño has a 75% chance of a strong event during October-December 2026.")
        evidence = data["strengthEvidence"]
        self.assertEqual(evidence["status"], "extracted")
        self.assertEqual(evidence["event"]["strength"], "strong")
        self.assertEqual(evidence["probability"], {"operator": "eq", "percent": 75})
        self.assertEqual(evidence["period"]["startMonth"], "2026-10")
        self.assertEqual(evidence["period"]["endMonth"], "2026-12")
        self.assertNotEqual(data["strengthOutlook"], "very-strong-likely")
        different_period = self.strength_statement("El Niño has a greater than 90% chance of a very strong event during October-December 2026.")
        self.assertEqual(different_period["strengthEvidence"]["period"]["startMonth"], "2026-10")
        self.assertEqual(different_period["strengthEvidence"]["period"]["endMonth"], "2026-12")
        for period in ("October-December 2025", "October-December 2028"):
            data = self.strength_statement(f"El Niño has a greater than 90% chance of a very strong event during {period}.")
            self.assertEqual(data["strengthEvidence"]["status"], "not-reliably-extracted")

    def test_low_probability_and_conflicting_claims_do_not_assert_high_probability(self):
        low = self.strength_statement("El Niño has a less than 10% chance of a very strong event during October-December 2026.")
        self.assertEqual(low["strengthEvidence"]["probability"], {"operator": "lt", "percent": 10})
        self.assertNotEqual(low["strengthOutlook"], "very-strong-likely")
        conflicting = self.strength_statement(
            "El Niño has a greater than 90% chance of a very strong event during October-December 2026. "
            "El Niño has a 20% chance of a very strong event during October-December 2026.")
        self.assertEqual(conflicting["strengthEvidence"]["status"], "not-reliably-extracted")

    def test_unrelated_probability_or_mismatched_event_is_not_a_strength_forecast(self):
        for statement in (
            "Atlantic storms have a greater than 90% chance of a very strong event during October-December 2026.",
            "El Niño has a greater than 90% chance of a very strong La Niña event during October-December 2026.",
            'An example reads: "El Niño has a greater than 90% chance of a very strong event during October-December 2026."',
        ):
            data = self.strength_statement(statement)
            self.assertEqual(data["strengthEvidence"]["status"], "not-reliably-extracted")

    def test_malformed_advisory_retains_the_previous_valid_cache(self):
        old = {"schemaVersion": 1, "status": "ok", "fetchedAt": "2026-09-11T00:00:00Z",
               "data": parse(ADVISORY, table(3), table(7))}
        for malformed in ("", "very strong event", None):
            result = refresh(old, fetcher=lambda url: malformed, stamp="2026-10-04T00:00:00Z")
            self.assertEqual(result["status"], "error")
            self.assertEqual(result["data"], old["data"])
            self.assertEqual(result["fetchedAt"], old["fetchedAt"])

    def test_parse_official_seasons_and_vintages(self):
        data = parse(ADVISORY, table(3), table(7))
        self.assertEqual(data["issuedAt"], "2026-09-10")
        self.assertEqual(data["phase"], "el-nino")
        self.assertEqual(data["trend"], "strengthening")
        self.assertEqual(data["nino34"], 1.8)
        self.assertEqual(data["forecasts"][0]["startMonth"], "2026-08")
        self.assertEqual(data["forecasts"][-1]["startMonth"], "2027-04")
        self.assertEqual(data["forecasts"][3]["roniPercentiles"][3], 0.7)

    def test_mixed_vintages_and_bad_probabilities_fail_closed(self):
        with self.assertRaises(ValueError):
            parse(ADVISORY, table(3).replace("September", "August"), table(7))
        with self.assertRaises(ValueError):
            parse(ADVISORY, table(3).replace("<td>100</td>", "<td>70</td>", 1), table(7))

    def test_negative_nino_anomaly_is_preserved(self):
        advisory = ADVISORY.replace("+1.8&deg;C", "-1.2&deg;C")
        self.assertEqual(parse(advisory, table(3), table(7))["nino34"], -1.2)

    def test_failure_keeps_prior_issue_and_success_time(self):
        old = {"schemaVersion": 1, "status": "ok", "fetchedAt": "2026-09-11T00:00:00Z", "data": {"issuedAt": "2026-09-10"}}
        result = refresh(old, fetcher=lambda url: (_ for _ in ()).throw(OSError("offline")), stamp="2026-09-13T00:00:00Z")
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["fetchedAt"], old["fetchedAt"])
        self.assertEqual(result["data"], old["data"])
        self.assertEqual(result["lastAttemptAt"], "2026-09-13T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
