import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_enso import parse, refresh

SEASONS = "ASO SON OND NDJ DJF JFM FMA MAM AMJ".split()
ADVISORY = """10 September 2026 ENSO Alert System Status: <span>El Ni&ntilde;o Advisory</span>
El Ni&ntilde;o is strengthening, with a greater than 90% chance of a very strong event.
values increased, reaching +1.8&deg;C in Ni&ntilde;o-3.4."""


def table(columns):
    rows = []
    for index, code in enumerate(SEASONS):
        values = [0, 0, 100] if columns == 3 else [0.1, 0.2, 0.3, 0.4 + index / 10, 1.5 + index / 10, 2.5 + index / 10, 3.5 + index / 10]
        rows.append(f'<tr><th scope="row"><abbr>{code} <span>Aug Sep Oct</span></abbr></th>' + ''.join(f'<td>{v}</td>' for v in values) + '</tr>')
    return "<h2>Issued September 2026</h2><table>" + "".join(rows) + "</table>"


class TestENSOCache(unittest.TestCase):
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
