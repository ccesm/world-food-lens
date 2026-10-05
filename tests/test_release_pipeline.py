"""Offline Git integration tests: only temporary local bare remotes and fake SMTP."""
import copy
import json
from pathlib import Path
import smtplib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from datetime import timedelta

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from refresh_data import ROOT, write_cache
from release_pipeline import (ALERT, CACHES, GENERATED, LEDGER, MANIFEST, STATIC,
    ancestor, commit_bytes, compact, compare_release, digest, git, latest_ledger,
    persist_ledger, save_data, validate_pointer, verify_release)
from send_alert_email import (SMTPAcceptanceUncertain, configuration, deliver, main,
    prepare_notification, prepare_release, send_prepared_release, smtp_send)
from test_alert_email import ENV, NOW, STAMP, fixture


class GitReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="wfl-release-test-")
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.remote, self.repo = root / "origin.git", root / "checkout"
        self.build_count = 0
        self.remote.mkdir(); self.repo.mkdir()
        git(self.remote, "init", "--bare", "--initial-branch=main")
        git(self.repo, "init", "--initial-branch=main")
        git(self.repo, "config", "user.name", "Offline test")
        git(self.repo, "config", "user.email", "test@example.com")
        git(self.repo, "remote", "add", "origin", str(self.remote))
        (self.repo / ".gitignore").write_text("dist/\n.wfl-notification-plan.json\n")
        for path in STATIC:
            target = self.repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / path).read_bytes())
        for name in CACHES:
            self.write(f"public/data/{name}", {})
        self.write(ALERT, fixture())
        self.write(LEDGER, {"schemaVersion": 1, "sentEventIds": []})
        self.commit("Initial source")
        git(self.repo, "push", "-u", "origin", "main")

    def write(self, path, value):
        write_cache(self.repo / path, value)

    def commit(self, message):
        git(self.repo, "add", "--all")
        git(self.repo, "commit", "-m", message)
        return git(self.repo, "rev-parse", "HEAD").decode().strip()

    def generate(self, feed=None, day=0):
        source = git(self.repo, "rev-parse", "HEAD").decode().strip()
        inputs = [[name, digest((self.repo / f"public/data/{name}").read_bytes())] for name in CACHES]
        inputs += [[label, digest(commit_bytes(self.repo, source, path))]
                   for label, path in [("previous-alerts", ALERT), ("previous-delivery", LEDGER)]]
        inputs += [[path, digest((self.repo / path).read_bytes())] for path in STATIC]
        inputs_hash = digest(compact(inputs))
        feed = copy.deepcopy(feed or fixture())
        feed["generatedAt"] = (NOW + timedelta(days=day)).isoformat().replace("+00:00", "Z")
        release_id = "release-" + digest(compact([1, source, feed["generatedAt"], "1", inputs_hash]))
        feed["release"] = {"id": release_id, "sourceRevision": source, "inputsHash": inputs_hash}
        self.write(ALERT, feed)
        self.write(MANIFEST, {"schemaVersion": 1, "releaseId": release_id, "sourceRevision": source,
            "evaluatedAt": feed["generatedAt"], "rulesVersion": "1", "inputsHash": inputs_hash,
            "snapshotSha256": digest((self.repo / ALERT).read_bytes())})
        for path in GENERATED:
            target = self.repo / "dist" / path.removeprefix("public/")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((self.repo / path).read_bytes())

    def publish(self, feed=None, day=0):
        # The helper pushes exclusively to this test's local bare remote.
        # Each build job has its own clean checkout; notification scratch files
        # and its detached/older HEAD are not reused as a new build workspace.
        self.build_count += 1
        fresh = self.repo.parent / f"build-{self.build_count}"
        git(self.repo.parent, "clone", str(self.remote), str(fresh))
        self.repo = fresh
        git(self.repo, "config", "user.name", "Offline test")
        git(self.repo, "config", "user.email", "test@example.com")
        self.generate(feed, day)
        return save_data(self.repo, self.repo / "dist")

    def checkpoint(self, ledger, plan):
        self.write(LEDGER, ledger)
        plan["expectedLedgerHash"] = persist_ledger(self.repo, plan["release"], plan["expectedLedgerHash"], ledger)
        plan["intentDurable"] = bool(ledger.get("pendingAttempt"))
        return plan

    def handle(self, revision, now=NOW, sender=lambda *_: None):
        ledger, plan, code = prepare_release(self.repo, revision, True, now)
        if plan["action"] != "skipped":
            self.checkpoint(ledger, plan)
        if plan["action"] == "send" and not code:
            ledger, code = send_prepared_release(self.repo, plan, ENV, now, sender)
            self.checkpoint(ledger, plan)
        return ledger, plan, code

    def test_progression_same_release_duplicate_and_escalation(self):
        first = self.publish()
        messages = []
        ledger, plan, code = self.handle(first, sender=lambda _, m: messages.append(m))
        self.assertEqual(code, 0)
        self.assertEqual(plan["action"], "send")
        self.assertEqual(ledger["lastProcessedRelease"]["dataRevision"], first)
        self.assertEqual(str(messages[0]["Message-ID"]), plan["messageId"])
        same, plan, code = self.handle(first, sender=lambda *_: self.fail("Duplicate"))
        self.assertEqual(plan["reason"], "already-processed")
        self.assertEqual(same, ledger)
        feed = fixture()
        feed["active"][0]["severity"] = "red"
        feed["events"].append({**feed["events"][0], "id": "event-red", "type": "escalated",
                               "alert": copy.deepcopy(feed["active"][0])})
        second = self.publish(feed, day=1)
        ledger, plan, code = self.handle(second, NOW + timedelta(days=1), lambda _, m: messages.append(m))
        self.assertEqual(code, 0); self.assertEqual(len(messages), 2)
        self.assertIn("红色关注 · 升级", messages[-1].get_content())
        self.assertTrue(ancestor(self.repo, first, second))
        before, ledger_hash = latest_ledger(self.repo, plan["release"])
        old, skipped, code = self.handle(first, NOW + timedelta(days=8), lambda *_: self.fail("Rollback"))
        self.assertEqual(code, 0); self.assertEqual(skipped["action"], "skipped")
        self.assertEqual(old, before)
        self.assertEqual(latest_ledger(self.repo, plan["release"])[1], ledger_hash)

    def test_definite_failure_retry_exact_snapshot_no_rebuild(self):
        revision = self.publish()
        snapshot = commit_bytes(self.repo, revision, ALERT)
        def reject(*_):
            raise smtplib.SMTPAuthenticationError(535, b"secret recipient@example.com")
        failed, plan, code = self.handle(revision, sender=reject)
        self.assertEqual(code, 1); self.assertEqual(failed["status"], "failed")
        self.assertNotIn("pendingAttempt", failed)
        self.assertNotIn("lastProcessedRelease", failed)
        sent, retry, code = self.handle(revision)
        self.assertEqual(code, 0); self.assertEqual(sent["status"], "sent")
        self.assertEqual(plan["messageId"], retry["messageId"])
        self.assertEqual(snapshot, commit_bytes(self.repo, revision, ALERT))
        self.assertEqual(retry["release"]["dataRevision"], revision)
        self.assertNotIn("recipient@example.com", json.dumps(sent))

    def test_failed_n_then_newer_resolved_release_never_resurrects(self):
        first = self.publish()
        def reject(*_):
            raise smtplib.SMTPRecipientsRefused({"private": (550, b"no")})
        ledger, _, code = self.handle(first, sender=reject)
        self.assertEqual(code, 1)
        feed = fixture(); feed["active"] = []
        second = self.publish(feed, day=1)
        # Supersession already protects N before N+1's notification checkpoint.
        _, old_plan, code = self.handle(first, sender=lambda *_: self.fail("Resolved resurrected"))
        self.assertEqual(old_plan["reason"], "superseded-data-release")
        ledger, plan, code = self.handle(second, NOW + timedelta(days=1))
        self.assertEqual(code, 0); self.assertEqual(ledger["sentEventIds"], [])
        old, skipped, code = self.handle(first, sender=lambda *_: self.fail("Old N sent"))
        self.assertEqual(skipped["action"], "skipped"); self.assertEqual(old, ledger)

    def test_newer_unverified_state_never_sends_old_active_event(self):
        first = self.publish()
        self.handle(first)
        feed = fixture(); feed["active"][0]["state"] = "unverified"
        second = self.publish(feed, day=1)
        ledger, plan, code = self.handle(second, NOW + timedelta(days=1), lambda *_: self.fail("Unverified sent"))
        self.assertEqual(code, 0); self.assertEqual(plan["reason"], "no-notifiable-change")
        self.assertEqual(ledger["lastProcessedRelease"]["dataRevision"], second)
        self.handle(first, sender=lambda *_: self.fail("Old evidence resurrected"))

    def test_accepted_but_receipt_not_persisted_blocks_same_and_newer_attempts(self):
        first = self.publish()
        intent, plan, _ = prepare_release(self.repo, first, True, NOW)
        self.checkpoint(intent, plan)
        accepted, code = send_prepared_release(self.repo, plan, ENV, NOW, lambda *_: None)
        self.assertEqual(accepted["status"], "sent")
        # Crash between SMTP acceptance and any local receipt write.
        uncertain, retry, code = self.handle(first, sender=lambda *_: self.fail("Unknown receipt resent"))
        self.assertEqual(code, 1); self.assertEqual(uncertain["status"], "uncertain")
        self.assertEqual(retry["action"], "blocked")
        second = self.publish(day=1)
        uncertain, plan, code = self.handle(second, NOW + timedelta(days=1), lambda *_: self.fail("New release resent"))
        self.assertEqual(code, 1)
        self.assertEqual(uncertain["latestRelease"]["dataRevision"], second)
        self.assertEqual(uncertain["pendingAttempt"]["release"]["dataRevision"], first)

    def test_receipt_local_write_failure_leaves_durable_uncertain_intent(self):
        first = self.publish()
        intent, plan, _ = prepare_release(self.repo, first, True, NOW)
        self.checkpoint(intent, plan)
        accepted, _ = send_prepared_release(self.repo, plan, ENV, NOW, lambda *_: None)
        plan_path = self.repo / ".wfl-notification-plan.json"; write_cache(plan_path, plan)
        with patch("sys.argv", ["send_alert_email.py", "send", "--release-revision", first,
                    "--repo", str(self.repo), "--plan", str(plan_path)]), \
                patch("send_alert_email.send_prepared_release", return_value=(accepted, 0)), \
                patch("send_alert_email.write_cache", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                main()
        durable, _ = latest_ledger(self.repo, plan["release"])
        self.assertIn("pendingAttempt", durable); self.assertEqual(durable["status"], "uncertain")

    def test_failed_receipt_push_preserves_pending_intent(self):
        first = self.publish()
        intent, plan, _ = prepare_release(self.repo, first, True, NOW)
        self.checkpoint(intent, plan)
        accepted, _ = send_prepared_release(self.repo, plan, ENV, NOW, lambda *_: None)
        actual_git = git
        def fail_push(repo, *args, **kwargs):
            if args[0] == "push":
                raise RuntimeError("Simulated rejected push")
            return actual_git(repo, *args, **kwargs)
        with patch("release_pipeline.git", side_effect=fail_push):
            with self.assertRaises(RuntimeError):
                self.checkpoint(accepted, plan)
        # Local receipt contains acceptance; durable main still contains intent.
        self.assertEqual(json.loads((self.repo / LEDGER).read_bytes())["status"], "sent")
        durable, _ = latest_ledger(self.repo, plan["release"])
        self.assertIn("pendingAttempt", durable)
        retry, _, code = self.handle(first, sender=lambda *_: self.fail("Push failure resent"))
        self.assertEqual(code, 1); self.assertEqual(retry["status"], "uncertain")

    def test_send_requires_durable_intent_and_no_newer_data_commit(self):
        first = self.publish()
        intent, plan, _ = prepare_release(self.repo, first, True, NOW)
        with self.assertRaises(ValueError):
            send_prepared_release(self.repo, plan, ENV, NOW, lambda *_: self.fail("No checkpoint"))
        self.checkpoint(intent, plan)
        self.publish(day=1)
        with self.assertRaises(ValueError):
            send_prepared_release(self.repo, plan, ENV, NOW, lambda *_: self.fail("Superseded intent"))

    def test_concurrent_ledger_edit_rejected_but_manual_code_commit_preserved(self):
        revision = self.publish()
        intent, plan, _ = prepare_release(self.repo, revision, True, NOW)
        (self.repo / "README.md").write_text("Manual main advancement\n")
        self.commit("Manual edit"); git(self.repo, "push", "origin", "main")
        self.checkpoint(intent, plan)
        git(self.repo, "fetch", "origin", "main")
        head = git(self.repo, "rev-parse", "origin/main").decode().strip()
        self.assertEqual(commit_bytes(self.repo, head, "README.md"), b"Manual main advancement\n")
        # A second writer sees the initial ledger hash and must not overwrite intent.
        with self.assertRaises(ValueError):
            persist_ledger(self.repo, plan["release"], "0" * 64, {"schemaVersion": 1})
        self.assertEqual(latest_ledger(self.repo, plan["release"])[1], plan["expectedLedgerHash"])

    def test_build_artifact_mismatch_and_non_data_dirty_tree_fail_before_commit(self):
        self.generate()
        source = git(self.repo, "rev-parse", "HEAD")
        (self.repo / "dist/data/monitor-alerts.json").write_text("wrong")
        with self.assertRaises(ValueError):
            save_data(self.repo, self.repo / "dist")
        self.assertEqual(source, git(self.repo, "rev-parse", "HEAD"))
        self.generate()
        (self.repo / "unexpected.js").write_text("unreviewed code")
        with self.assertRaises(ValueError):
            save_data(self.repo, self.repo / "dist")
        self.assertEqual(source, git(self.repo, "rev-parse", "HEAD"))

    def test_stale_checkout_fails_without_rebase_or_overwriting_main(self):
        self.generate()
        source = git(self.repo, "rev-parse", "HEAD").decode().strip()
        other = self.repo.parent / "other"
        git(self.repo.parent, "clone", str(self.remote), str(other))
        git(other, "config", "user.name", "Other"); git(other, "config", "user.email", "other@example.com")
        (other / "README.md").write_text("New main\n")
        git(other, "add", "README.md"); git(other, "commit", "-m", "Main advanced")
        git(other, "push", "origin", "main")
        with self.assertRaises(ValueError):
            save_data(self.repo, self.repo / "dist")
        self.assertEqual(source, git(self.repo, "rev-parse", "HEAD").decode().strip())

    def test_missing_identity_tamper_and_source_changes_rejected(self):
        source = git(self.repo, "rev-parse", "HEAD").decode().strip()
        with self.assertRaises(ValueError):
            verify_release(self.repo, source)
        revision = self.publish()
        # Mutating the checked-out snapshot cannot change immutable email input.
        (self.repo / ALERT).write_text("tampered local file")
        self.assertEqual(verify_release(self.repo, revision)[0]["active"][0]["severity"], "yellow")
        self.commit("Tampered snapshot")
        with self.assertRaises(ValueError):
            verify_release(self.repo, git(self.repo, "rev-parse", "HEAD").decode().strip())

    def test_real_javascript_generator_manifest_matches_python_git_verifier(self):
        seed = fixture()
        for alert in [*seed["active"], *(event["alert"] for event in seed["events"])]:
            alert.update(category="crop", lastEvaluatedAt=STAMP)
        seed.update(coverage={"automatic": {"zh": "测试", "en": "Test"},
                              "manual": {"zh": "测试", "en": "Test"}}, email={"status": "not-configured"})
        self.write(ALERT, seed)
        source = self.commit("Seed valid existing analytical snapshot")
        git(self.repo, "push", "origin", "main")
        result = subprocess.run(["node", str(ROOT / "scripts/evaluate_alerts.mjs"), "--data-dir",
                        str(self.repo / "public/data"), "--source-revision", source,
                        "--now", "2026-10-04T12:00:00Z"], cwd=ROOT,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        for path in GENERATED:
            target = self.repo / "dist" / path.removeprefix("public/")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((self.repo / path).read_bytes())
        revision = save_data(self.repo, self.repo / "dist")
        feed, release = verify_release(self.repo, revision)
        self.assertEqual(feed["release"]["id"], release["releaseId"])
        self.assertEqual(feed["analysis"]["releaseId"], release["releaseId"])
        self.assertEqual(feed["analysis"]["changeSet"]["releaseId"], release["releaseId"])

    def test_input_hash_and_code_in_data_commit_fail_validation(self):
        self.generate()
        self.write("public/data/official-data.json", {"unexpected": 1})
        revision = self.commit("Changed input after evaluation")
        with self.assertRaises(ValueError):
            verify_release(self.repo, revision)
        git(self.repo, "push", "origin", "main")
        self.generate(day=1)
        (self.repo / "new-code.js").write_text("code changed after evaluation")
        revision = self.commit("Source mixed into generated data")
        with self.assertRaises(ValueError):
            verify_release(self.repo, revision)

    def test_divergent_release_comparison_uses_actual_git_ancestry(self):
        first = self.publish()
        git(self.repo, "checkout", "-b", "side", f"{first}^")
        self.generate(day=1)
        side = self.commit("Side data release")
        _, left = verify_release(self.repo, first); _, right = verify_release(self.repo, side)
        with self.assertRaises(ValueError):
            compare_release(left, right, lambda a, b: ancestor(self.repo, a, b))


class ReleaseStateTests(unittest.TestCase):
    def pointer(self, char):
        return {"releaseId": "release-" + char * 64, "dataRevision": char * 40, "snapshotSha256": char * 64}

    def test_malformed_pointer_and_inconsistent_watermarks_fail_closed(self):
        pointer = self.pointer("a")
        for malformed in [None, {}, {**pointer, "dataRevision": "short"}, {**pointer, "releaseId": "date-only"}]:
            with self.assertRaises(ValueError):
                validate_pointer(malformed)
        with self.assertRaises(ValueError):
            prepare_notification(fixture(), pointer, {"lastProcessedRelease": pointer}, True, NOW, lambda *_: True)
        with self.assertRaises(ValueError):
            compare_release(pointer, {**pointer, "snapshotSha256": "b" * 64}, lambda *_: True)
        for ledger in [{"latestRelease": None}, {"lastProcessedRelease": {}}, {"pendingAttempt": {}},
                       {"pendingAttempt": None}, {"status": "uncertain"}]:
            with self.assertRaises(ValueError):
                prepare_notification(fixture(), pointer, ledger, True, NOW, lambda *_: True)

    def test_clock_order_does_not_define_release_order(self):
        old, new = self.pointer("a"), self.pointer("b")
        ledger = {"latestRelease": new, "lastProcessedRelease": new, "lastCheckedAt": STAMP}
        feed = fixture(); feed["generatedAt"] = "2099-01-01T00:00:00Z"
        result, plan, code = prepare_notification(feed, old, ledger, True, NOW, lambda a, b: a == old["dataRevision"])
        self.assertEqual(result, ledger); self.assertEqual(plan["reason"], "older-release"); self.assertEqual(code, 0)

    def test_smtp_submission_disconnect_uncertain_but_login_failure_definite(self):
        server = MagicMock(); server.send_message.side_effect = smtplib.SMTPServerDisconnected("private detail")
        with patch("send_alert_email.smtplib.SMTP_SSL", return_value=server):
            with self.assertRaises(SMTPAcceptanceUncertain):
                smtp_send(configuration(ENV), MagicMock())
        server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"private detail")
        with patch("send_alert_email.smtplib.SMTP_SSL", return_value=server):
            with self.assertRaises(smtplib.SMTPAuthenticationError):
                smtp_send(configuration(ENV), MagicMock())

    def test_post_acceptance_receipt_error_is_not_definitely_unsent(self):
        actual = __import__("send_alert_email").episode_key
        calls = []
        def key(alert):
            if calls:
                raise ValueError("Simulated receipt calculation failure")
            return actual(alert)
        with patch("send_alert_email.episode_key", side_effect=key):
            ledger, code = deliver(fixture(), {}, ENV, NOW, lambda *_: calls.append(1))
        self.assertEqual(code, 1); self.assertEqual(ledger["status"], "uncertain")
        self.assertEqual(ledger["errorCode"], "ReceiptPreparationFailed")

    def test_close_failure_after_acceptance_does_not_mask_acceptance(self):
        server = MagicMock(); server.send_message.return_value = {}
        server.quit.side_effect = smtplib.SMTPServerDisconnected("closed")
        server.close.side_effect = OSError("already closed")
        with patch("send_alert_email.smtplib.SMTP_SSL", return_value=server):
            smtp_send(configuration(ENV), MagicMock())

    def test_workflow_requires_checkpoint_and_keeps_secrets_off_build(self):
        workflow = (ROOT / ".github/workflows/deploy-pages.yml").read_text()
        build, notify = workflow.split("  notify:", 1)
        self.assertNotIn("secrets.", build)
        self.assertIn("steps.checkpoint.outcome == 'success'", notify)
        self.assertLess(notify.index("persist-ledger"), notify.index("send_alert_email.py send"))
        self.assertNotIn("--rebase", workflow); self.assertNotIn("--force", workflow)
        self.assertNotIn("pull_request", workflow)


if __name__ == "__main__":
    unittest.main()
