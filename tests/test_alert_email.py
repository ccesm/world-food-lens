import copy
import json
import smtplib
import sys
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from send_alert_email import deliver, configuration, smtp_send, episode_key, select_changes
from unittest.mock import patch, MagicMock

NOW = datetime(2026, 9, 22, 12, tzinfo=timezone.utc)
STAMP = "2026-09-22T12:00:00Z"
ENV = {"WFL_SMTP_USER": "sender@example.com", "WFL_SMTP_PASSWORD": "private-password", "WFL_ALERT_TO": "recipient@example.com"}


def fixture():
    label = {"zh": "测试信号", "en": "Test signal"}
    alert = {"id": "crop/heat/example", "severity": "yellow", "state": "active", "firstSeenAt": STAMP,
             "title": label, "summary": label, "rule": label, "target": "#crop-windows", "sourcePeriod": "2026-09-18",
             "sources": [{"label": "NASA POWER", "url": "https://power.larc.nasa.gov/", "period": "2026-09-18"}]}
    event = {"id": "event-1", "alertId": alert["id"], "type": "new", "at": STAMP, "alert": copy.deepcopy(alert)}
    return {"schemaVersion": 1, "rulesVersion": "1", "generatedAt": STAMP, "active": [alert], "events": [event],
            "health": [{"id": "weather", "status": "ok", "label": label, "reason": label}]}


class AlertEmailTests(unittest.TestCase):
    def test_welcome_includes_pending_changes_and_daily_repeat_is_silent(self):
        sent = []
        feed = fixture()
        ledger, code = deliver(feed, {}, ENV, NOW, lambda config, message: sent.append(message))
        self.assertEqual(code, 0)
        self.assertEqual(ledger["status"], "sent")
        self.assertEqual(ledger["sentEventIds"], ["event-1"])
        self.assertIn("邮件通道测试", sent[0].get_content())
        self.assertIn("NASA POWER", sent[0].get_content())
        feed["generatedAt"] = "2026-09-23T12:00:00Z"
        ledger2, code = deliver(feed, ledger, ENV, NOW + timedelta(days=1), lambda *args: self.fail("Duplicate email"))
        self.assertEqual(code, 0)
        self.assertEqual(ledger2["lastSentAt"], STAMP)
        self.assertEqual(ledger2["lastAttemptAt"], STAMP)
        self.assertEqual(ledger2["lastCheckedAt"], "2026-09-23T12:00:00Z")
        self.assertNotIn("sender@example.com", json.dumps(ledger2))
        self.assertNotIn("private-password", json.dumps(ledger2))

    def test_escalation_sends_once_and_stale_or_resolved_event_does_not_send(self):
        feed = fixture()
        ledger, _ = deliver(feed, {}, ENV, NOW, lambda *args: None)
        feed["active"][0]["severity"] = "red"
        feed["events"].append({**feed["events"][0], "id": "event-2", "type": "escalated", "alert": copy.deepcopy(feed["active"][0])})
        calls = []
        ledger, code = deliver(feed, ledger, ENV, NOW, lambda *args: calls.append(args))
        self.assertEqual(len(calls), 1)
        self.assertEqual(ledger["sentEventIds"], ["event-1", "event-2"])
        legacy = {key: value for key, value in ledger.items() if key != "deliveredEpisodes"}
        migrated, code = deliver(feed, legacy, ENV, NOW, lambda *args: self.fail("Legacy receipt duplicated"))
        self.assertEqual(code, 0)
        self.assertEqual(migrated["deliveredEpisodes"][episode_key(feed["active"][0])], "red")
        feed["active"] = []
        deliver(feed, ledger, ENV, NOW, lambda *args: self.fail("Resolved event sent"))
        failed, code = deliver(feed, ledger, ENV, NOW + timedelta(days=4), lambda *args: self.fail("Stale feed sent"))
        self.assertEqual(code, 1)
        self.assertEqual(failed["status"], "failed")

    def test_failed_send_retries_without_losing_pending_event_or_leaking_error(self):
        def fail(*args):
            raise smtplib.SMTPAuthenticationError(535, b"private-password recipient@example.com")
        ledger, code = deliver(fixture(), {}, ENV, NOW, fail)
        self.assertEqual(code, 1)
        self.assertEqual(ledger["errorCode"], "SMTPAuthenticationError")
        self.assertNotIn("sentEventIds", ledger)
        self.assertNotIn("private-password", json.dumps(ledger))
        retried, code = deliver(fixture(), ledger, ENV, NOW, lambda *args: None)
        self.assertEqual(code, 0)
        self.assertEqual(retried["sentEventIds"], ["event-1"])

    def test_data_gap_notifies_only_on_health_transition(self):
        feed = fixture()
        ledger, _ = deliver(feed, {}, ENV, NOW, lambda *args: None)
        feed["health"][0]["status"] = "unavailable"
        calls = []
        ledger, _ = deliver(feed, ledger, ENV, NOW, lambda *args: calls.append(args))
        self.assertEqual(len(calls), 1)
        deliver(feed, ledger, ENV, NOW, lambda *args: self.fail("Unchanged gap sent"))

    def test_missing_credentials_do_not_claim_email_sent(self):
        ledger, code = deliver(fixture(), {}, {}, NOW, lambda *args: self.fail("Missing credentials"))
        self.assertEqual(ledger["status"], "not-configured")
        self.assertNotIn("lastSentAt", ledger)
        self.assertNotIn("lastAttemptAt", ledger)
        self.assertEqual(code, 0)
        with self.assertRaises(ValueError):
            configuration({**ENV, "WFL_ALERT_TO": "receiver@example.com\nBcc: another@example.com"})

    def test_unverified_alert_never_sent_as_current(self):
        feed = fixture()
        ledger, _ = deliver(feed, {}, ENV, NOW, lambda *args: None)
        ledger["sentEventIds"] = []
        feed["active"][0]["state"] = "unverified"
        deliver(feed, ledger, ENV, NOW, lambda *args: self.fail("Unverified alert sent"))

    def test_quit_failure_after_acceptance_is_not_a_failed_delivery(self):
        server = MagicMock()
        server.send_message.return_value = {}
        server.quit.side_effect = smtplib.SMTPServerDisconnected("closed")
        with patch("send_alert_email.smtplib.SMTP_SSL", return_value=server):
            smtp_send(configuration(ENV), MagicMock())
        server.close.assert_called_once()

    def test_failed_first_red_notice_retries_at_current_yellow_level(self):
        feed = fixture()
        feed["active"][0]["severity"] = "red"
        feed["events"][0]["alert"]["severity"] = "red"
        def fail(*_):
            raise smtplib.SMTPServerDisconnected("offline")
        ledger, code = deliver(feed, {"welcomeSentAt": STAMP}, ENV, NOW, fail)
        self.assertEqual(code, 1)
        self.assertEqual(ledger["deliveredEpisodes"], {})
        feed["active"][0]["severity"] = "yellow"
        messages = []
        ledger, code = deliver(feed, ledger, ENV, NOW, lambda _, message: messages.append(message))
        self.assertEqual(code, 0)
        self.assertEqual(len(messages), 1)
        self.assertIn("黄色关注 · 新增", messages[0].get_content())
        self.assertEqual(ledger["deliveredEpisodes"][episode_key(feed["active"][0])], "yellow")
        deliver(feed, ledger, ENV, NOW, lambda *_: self.fail("Downgraded retry duplicated"))

    def test_failed_upgrade_then_downgrade_does_not_repeat_delivered_yellow(self):
        feed = fixture()
        ledger, _ = deliver(feed, {}, ENV, NOW, lambda *_: None)
        feed["active"][0]["severity"] = "red"
        feed["events"].append({**feed["events"][0], "id": "event-red", "type": "escalated", "alert": copy.deepcopy(feed["active"][0])})
        def fail(*_):
            raise smtplib.SMTPServerDisconnected("offline")
        ledger, code = deliver(feed, ledger, ENV, NOW, fail)
        self.assertEqual(code, 1)
        self.assertEqual(ledger["deliveredEpisodes"][episode_key(feed["active"][0])], "yellow")
        feed["active"][0]["severity"] = "yellow"
        ledger, code = deliver(feed, ledger, ENV, NOW, lambda *_: self.fail("Already-delivered yellow repeated"))
        self.assertEqual(code, 0)
        feed["events"] = []  # The durable receipt also survives history cropping.
        feed["active"][0]["severity"] = "red"
        messages = []
        ledger, _ = deliver(feed, ledger, ENV, NOW, lambda _, message: messages.append(message))
        self.assertIn("红色关注 · 升级", messages[0].get_content())
        feed["active"][0]["severity"] = "yellow"
        deliver(feed, ledger, ENV, NOW, lambda *_: self.fail("Lower severity repeated"))
        feed["active"][0]["severity"] = "red"
        deliver(feed, ledger, ENV, NOW, lambda *_: self.fail("Same-episode red repeated"))

    def test_cropped_events_do_not_erase_pending_episode_and_fallback_ids_are_stable(self):
        feed = fixture()
        feed["events"] = []
        prior = {"welcomeSentAt": STAMP}
        first, _ = select_changes(feed, copy.deepcopy(prior), NOW)
        feed["generatedAt"] = "2026-09-23T12:00:00Z"
        second, _ = select_changes(feed, copy.deepcopy(prior), NOW + timedelta(days=1))
        self.assertEqual(first[0]["id"], second[0]["id"])
        calls = []
        ledger, code = deliver(feed, prior, ENV, NOW + timedelta(days=1), lambda *_: calls.append(1))
        self.assertEqual(code, 0)
        self.assertEqual(calls, [1])
        deliver(feed, ledger, ENV, NOW + timedelta(days=1), lambda *_: self.fail("Cropped episode repeated"))
        # A later genuine recurrence has a different episode even at the same level.
        feed["active"][0]["firstSeenAt"] = feed["generatedAt"]
        recurrent, _ = select_changes(feed, copy.deepcopy(ledger), NOW + timedelta(days=1))
        self.assertEqual(len(recurrent), 1)
        self.assertNotEqual(recurrent[0]["id"], first[0]["id"])


if __name__ == "__main__":
    unittest.main()
