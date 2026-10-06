"""Send one daily change digest using server-side SMTP secrets.

No email address, password or provider error body is written to public JSON/logs.
SMTP acceptance is recorded; this does not establish inbox delivery.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path

from refresh_data import ROOT, write_cache
from release_pipeline import (LEDGER, ancestor, compare_release, digest, latest_data_release, latest_ledger,
                              validate_pointer, verify_release)

SITE = "https://ccesm.github.io/world-food-lens/"
MAX_AGE_SECONDS = 72 * 3600
SEVERITY = {"yellow": 1, "red": 2}


class SMTPAcceptanceUncertain(Exception):
    """Connection lost during message submission; DATA acceptance is unknown."""


def health_state(row):
    """Legacy unavailable never proves an outage. Keep normal lag silent."""
    if "retrieval" not in row:
        return "current" if row["status"] == "ok" else "unknown"
    if row["retrieval"] == "failed":
        return "retrieval-failed"
    if row.get("validation") == "failed":
        return "validation-failed"
    if row["retrieval"] != "ok":
        return "unknown"
    if row.get("validation") == "unverified":
        return "unverified"
    if row.get("freshness") in ("stale", "overdue", "awaiting"):
        return row["freshness"]
    if row.get("eligibility") == "insufficient":
        return "insufficient"
    return "current" if row.get("freshness") == "current" else "unknown"


HEALTH_LABELS = {"retrieval-failed": "本次获取失败", "validation-failed": "新资料未通过核验",
                 "stale": "缓存待重新检查", "overdue": "观测更新滞后", "unknown": "资料状态待核实"}


def timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("Invalid UTC timestamp")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def configuration(env):
    keys = ("WFL_SMTP_USER", "WFL_SMTP_PASSWORD", "WFL_ALERT_TO")
    if not all(env.get(key, "").strip() for key in keys):
        return None
    user, recipient = env[keys[0]].strip(), env[keys[2]].strip()
    for address in (user, recipient):
        if not re.fullmatch(r"[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+", address):
            raise ValueError("Invalid email address configuration")
    host = env.get("WFL_SMTP_HOST", "smtp.gmail.com").strip()
    port = int(env.get("WFL_SMTP_PORT", "465"))
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", host) or port not in (465, 587):
        raise ValueError("SMTP requires port 465 TLS or port 587 STARTTLS")
    password = env[keys[1]].strip()
    if host == "smtp.gmail.com":
        password = password.replace(" ", "")
    return dict(user=user, recipient=recipient, password=password, host=host, port=port)


def episode_key(alert):
    identity = json.dumps([alert["id"], alert["firstSeenAt"]], separators=(",", ":"))
    return "episode-" + hashlib.sha256(identity.encode()).hexdigest()[:32]


def delivered_episodes(feed, ledger):
    episodes = copy.deepcopy(ledger.get("deliveredEpisodes", {}))
    if not isinstance(episodes, dict) or any(not isinstance(key, str) or level not in SEVERITY
                                             for key, level in episodes.items()):
        raise ValueError("Invalid delivered episode ledger")
    # Migrate confirmed receipts from the event-ID-only ledger while their
    # event snapshots remain available. Never infer delivery from active state.
    sent = set(ledger.get("sentEventIds", []))
    for event in feed["events"]:
        if event["id"] not in sent or event["type"] not in ("new", "escalated"):
            continue
        alert = event["alert"]
        key, level = episode_key(alert), alert["severity"]
        if SEVERITY[level] > SEVERITY.get(episodes.get(key), 0):
            episodes[key] = level
    return episodes


def select_changes(feed, ledger, now):
    if feed.get("schemaVersion") != 1 or feed.get("rulesVersion") != "1":
        raise ValueError("Invalid alert feed")
    age = (now - timestamp(feed.get("generatedAt"))).total_seconds()
    if age < -300 or age > MAX_AGE_SECONDS:
        raise ValueError("Refusing to send stale or future alert feed")
    if ledger.get("schemaVersion", 1) != 1 or not isinstance(ledger.get("sentEventIds", []), list):
        raise ValueError("Invalid delivery ledger")
    active = {item["id"]: item for item in feed["active"] if item.get("state") == "active"}
    episodes = delivered_episodes(feed, ledger)
    # Persist legacy receipt migration even when there is no new email to send.
    ledger["deliveredEpisodes"] = episodes
    matching = {}
    for event in feed["events"]:
        if event["type"] in ("new", "escalated"):
            alert = event["alert"]
            key = (episode_key(alert), alert["severity"])
            existing = matching.get(key)
            if existing is None or timestamp(event["at"]) >= timestamp(existing["at"]):
                matching[key] = event
    changes = []
    for alert_id, alert in active.items():
        key, level = episode_key(alert), alert["severity"]
        delivered = episodes.get(key)
        if SEVERITY[level] <= SEVERITY.get(delivered, 0):
            continue
        event = matching.get((key, level))
        # Active episodes are the durable pending queue. A failed red notice
        # can be delivered at its current yellow level; cropped history cannot
        # erase pending notifications. The fallback ID survives daily checks.
        event_id = event["id"] if event else "delivery-" + hashlib.sha256(f"{key}|{level}".encode()).hexdigest()[:32]
        changes.append({"id": event_id, "alertId": alert_id, "type": "escalated" if delivered else "new",
                        "at": event["at"] if event else feed["generatedAt"], "alert": alert})
    changes.sort(key=lambda item: (item["alert"]["severity"] != "red", item["alertId"]))
    old_health = ledger.get("healthStates", {})
    gaps = [row for row in feed["health"] if health_state(row) in HEALTH_LABELS and
            row["id"] in old_health and
            health_state(row) != {"ok": "current", "unavailable": "unknown"}.get(old_health[row["id"]], old_health[row["id"]])]
    return changes, gaps


def build_message(feed, changes, gaps, config, now, welcome=False):
    message = EmailMessage()
    message["From"] = config["user"]
    message["To"] = config["recipient"]
    message["Date"] = format_datetime(now)
    message["Subject"] = "World Food Lens｜自动预警邮件已启用" if welcome else \
        f"World Food Lens｜{len(changes)} 条预警变化 · {len(gaps)} 项资料状态变化"
    identity = "|".join([feed["generatedAt"], *(item["id"] for item in changes), *(row["id"] for row in gaps), str(welcome)])
    message["Message-ID"] = f"<wfl-{hashlib.sha256(identity.encode()).hexdigest()[:32]}@world-food-lens.local>"
    lines = ["World Food Lens / 全球粮食观察", ""]
    if welcome:
        lines += ["邮件通道测试：这是启用后的第一封确认邮件。", "之后在新增、升级的预警或资料获取、核验、时效状态恶化时发送摘要；正常等待发布不发送。", ""]
    lines += [f"资料评估时间：{feed['generatedAt']}（UTC）", f"网站预警中心：{SITE}#automatic-alerts", ""]
    if not changes and not gaps:
        lines += ["本次没有新的可通知预警。请同时查看网站中的数据覆盖与缺口。", ""]
    for item in changes:
        alert = item["alert"]
        level = "红色关注" if alert["severity"] == "red" else "黄色关注"
        change = "升级" if item["type"] == "escalated" else "新增"
        lines += [f"[{level} · {change}] {alert['title']['zh']}", alert["summary"]["zh"],
                  f"资料期：{alert['sourcePeriod']}", f"触发规则：{alert['rule']['zh']}"]
        for source in alert["sources"]:
            lines.append(f"来源：{source['label']} · {source['period']} · {source['url']}")
        lines += [f"查看：{SITE}{alert['target']}", ""]
    for gap in gaps:
        lines += [f"[{HEALTH_LABELS[health_state(gap)]}] {gap['label']['zh']}", gap["reason"]["zh"],
                  f"缓存资料期：{gap.get('period', '待核实')}；上次成功检查：{gap.get('fetchedAt', '尚无记录')}",
                  "保留原有有效缓存；资料不足不等于风险解除。", ""]
    lines += ["颜色表示本站透明筛查规则的关注程度，不是官方气象预警或已确认减产。",
              "典型 ENSO 影响不等于当前地区预测。政策、战争和产量影响仍需人工核实。",
              "按每日计划检查；上游发布和任务排队会造成延迟。",
              "管理通知：在仓库 Actions Secrets 中移除 WFL_ALERT_TO 可停止邮件。"]
    message.set_content("\n".join(lines))
    return message


def smtp_send(config, message):
    context = ssl.create_default_context()
    if config["port"] == 465:
        server = smtplib.SMTP_SSL(config["host"], config["port"], context=context, timeout=40)
    else:
        server = smtplib.SMTP(config["host"], config["port"], timeout=40)
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
    try:
        server.login(config["user"], config["password"])
        try:
            refused = server.send_message(message, from_addr=config["user"], to_addrs=[config["recipient"]])
        except (OSError, smtplib.SMTPServerDisconnected) as error:
            # smtplib cannot prove whether DATA was accepted before disconnect.
            raise SMTPAcceptanceUncertain() from error
        if refused:
            raise smtplib.SMTPRecipientsRefused(refused)
    finally:
        # A QUIT failure after DATA acceptance does not mean the message failed.
        try:
            server.quit()
        except (OSError, smtplib.SMTPException):
            try:
                server.close()
            except (OSError, smtplib.SMTPException):
                pass


def deliver(feed, previous, env, now=None, sender=smtp_send, test=False):
    now = now or datetime.now(timezone.utc)
    stamp = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    ledger = copy.deepcopy(previous)
    accepted = False
    try:
        if ledger.get("schemaVersion", 1) != 1:
            raise ValueError("Invalid delivery ledger schema")
        ledger.update(schemaVersion=1, lastCheckedAt=stamp)
        config = configuration(env)
        if config is None:
            ledger["status"] = "not-configured"
            return ledger, 0
        changes, gaps = select_changes(feed, ledger, now)
        welcome = test or not ledger.get("welcomeSentAt")
        if not changes and not gaps and not welcome:
            ledger["healthStates"] = {row["id"]: health_state(row) for row in feed["health"]}
            ledger["status"] = "sent" if ledger.get("lastSentAt") else "configured"
            ledger.pop("errorCode", None)
            return ledger, 0
        message = build_message(feed, changes, gaps, config, now, welcome)
        ledger["lastAttemptAt"] = stamp
        sender(config, message)
        accepted = True
        ledger.update(status="sent", lastSentAt=stamp, acceptance="smtp-accepted")
        if welcome:
            ledger["welcomeSentAt"] = stamp
        for item in changes:
            alert = item["alert"]
            ledger["deliveredEpisodes"][episode_key(alert)] = alert["severity"]
        ledger["sentEventIds"] = list(dict.fromkeys([*ledger.get("sentEventIds", []), *(item["id"] for item in changes)]))[-1000:]
        ledger["healthStates"] = {row["id"]: health_state(row) for row in feed["health"]}
        ledger.pop("errorCode", None)
        return ledger, 0
    except SMTPAcceptanceUncertain:
        ledger.update(status="uncertain", lastAttemptAt=stamp, errorCode="SMTPAcceptanceUncertain")
        return ledger, 1
    except Exception as error:
        ledger.update(status="uncertain" if accepted else "failed", lastAttemptAt=stamp,
                      errorCode="ReceiptPreparationFailed" if accepted else type(error).__name__)
        return ledger, 1


def prepare_notification(feed, release, previous, configured, now, is_ancestor):
    """Plan against immutable release + latest durable ledger, never the clock order."""
    validate_pointer(release)
    ledger = copy.deepcopy(previous)
    if ledger.get("schemaVersion", 1) != 1:
        raise ValueError("Invalid delivery ledger schema")
    latest, processed = ledger.get("latestRelease"), ledger.get("lastProcessedRelease")
    if "latestRelease" in ledger:
        validate_pointer(latest)
    if "lastProcessedRelease" in ledger:
        validate_pointer(processed)
        if latest is None or compare_release(processed, latest, is_ancestor) == "newer":
            raise ValueError("Processed release exceeds the latest release watermark")
    pending = ledger.get("pendingAttempt")
    if "pendingAttempt" in ledger:
        if (not isinstance(pending, dict) or set(pending) != {"release", "messageId", "preparedAt"} or
                not re.fullmatch(r"<wfl-[a-f0-9]{32}@world-food-lens.local>", pending.get("messageId", ""))):
            raise ValueError("Malformed pending SMTP intent")
        timestamp(pending.get("preparedAt"))
        if latest is None or compare_release(pending["release"], latest, is_ancestor) == "newer":
            raise ValueError("Pending intent exceeds the release watermark")
        if processed and compare_release(pending["release"], processed, is_ancestor) != "newer":
            raise ValueError("Pending intent is already processed")
    elif ledger.get("status") == "uncertain":
        raise ValueError("Uncertain delivery without an auditable pending intent")
    order = compare_release(release, latest, is_ancestor)
    if order == "older":
        return ledger, {"action": "skipped", "reason": "older-release", "release": release}, 0
    if processed and compare_release(release, processed, is_ancestor) == "same":
        return ledger, {"action": "skipped", "reason": "already-processed", "release": release}, 0
    ledger["latestRelease"] = release
    if pending:
        ledger.update(status="uncertain", errorCode="UnreconciledSMTPIntent")
        return ledger, {"action": "blocked", "reason": "uncertain-prior-attempt", "release": release}, 1
    stamp = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    ledger.update(schemaVersion=1, lastCheckedAt=stamp)
    # Check freshness/shape even on silent cycles, but not on safely skipped rollbacks.
    changes, gaps = select_changes(feed, ledger, now)
    plan = {"action": "record", "reason": "not-configured", "release": release}
    if not configured:
        ledger["status"] = "not-configured"
        return ledger, plan, 0
    welcome = not ledger.get("welcomeSentAt")
    if not changes and not gaps and not welcome:
        ledger.update(lastProcessedRelease=release,
                      healthStates={row["id"]: health_state(row) for row in feed["health"]},
                      status="sent" if ledger.get("lastSentAt") else "configured")
        ledger.pop("errorCode", None)
        plan["reason"] = "no-notifiable-change"
        return ledger, plan, 0
    # Stable per release/content, not per workflow attempt or recipient.
    identity = [release["releaseId"], [item["id"] for item in changes],
                [row["id"] for row in gaps], welcome]
    message_id = f"<wfl-{digest(json.dumps(identity, separators=(',', ':')).encode())[:32]}@world-food-lens.local>"
    ledger["pendingAttempt"] = {"release": release, "messageId": message_id, "preparedAt": stamp}
    ledger.update(status="uncertain", errorCode="SMTPIntentPending")
    plan.update(action="send", reason="pending-changes", messageId=message_id,
                changeIds=[item["id"] for item in changes], gapIds=[row["id"] for row in gaps], welcome=welcome)
    return ledger, plan, 0


def prepare_release(repo, revision, configured, now=None):
    feed, release = verify_release(repo, revision)
    previous, ledger_hash = latest_ledger(repo, release)
    if compare_release(release, latest_data_release(repo), lambda a, b: ancestor(repo, a, b)) == "older":
        result, plan, code = previous, {"action": "skipped", "reason": "superseded-data-release", "release": release}, 0
    else:
        result, plan, code = prepare_notification(feed, release, previous, configured,
            now or datetime.now(timezone.utc), lambda older, newer: ancestor(repo, older, newer))
    plan.update(expectedLedgerHash=ledger_hash, intentDurable=False)
    return result, plan, code


def send_prepared_release(repo, plan, env, now=None, sender=smtp_send):
    if plan.get("action") != "send":
        return None, 0
    feed, release = verify_release(repo, plan["release"]["dataRevision"])
    previous, ledger_hash = latest_ledger(repo, release)
    pending = previous.get("pendingAttempt", {})
    if (compare_release(release, latest_data_release(repo), lambda a, b: ancestor(repo, a, b)) != "same" or
            release != plan["release"] or not plan.get("intentDurable") or
            ledger_hash != plan["expectedLedgerHash"] or pending.get("release") != release or
            pending.get("messageId") != plan["messageId"] or previous.get("latestRelease") != release):
        raise ValueError("SMTP intent is not the latest durable prepared state")
    now = now or datetime.now(timezone.utc)
    # Recompute only from the same immutable snapshot and the prepared ledger.
    def checked_sender(config, message):
        changes, gaps = select_changes(feed, copy.deepcopy(previous), now)
        if ([item["id"] for item in changes] != plan["changeIds"] or
                [row["id"] for row in gaps] != plan["gapIds"] or
                (not previous.get("welcomeSentAt")) != plan["welcome"]):
            raise ValueError("Prepared notification content changed")
        message.replace_header("Message-ID", plan["messageId"])
        sender(config, message)
    result, code = deliver(feed, previous, env, now, checked_sender)
    result["lastAttemptRelease"] = release
    if result["status"] != "uncertain":
        result.pop("pendingAttempt", None)
    if not code and result["status"] != "not-configured":
        result["lastProcessedRelease"] = release
    return result, code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "send"])
    parser.add_argument("--release-revision", required=True, help="Exact published generated-data commit")
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--plan", type=Path, default=ROOT / ".wfl-notification-plan.json")
    args = parser.parse_args()
    if args.command == "prepare":
        result, plan, code = prepare_release(args.repo, args.release_revision,
                                            os.environ.get("WFL_EMAIL_CONFIGURED") == "true")
        # Persist plan before ledger so a partial local write still cannot send.
        write_cache(args.plan, plan)
        if plan["action"] != "skipped":
            write_cache(args.repo / LEDGER, result)
        print(f"Notification plan: {plan['action']}; reason: {plan['reason']}")
    else:
        plan = json.loads(args.plan.read_bytes())
        if plan["release"]["dataRevision"] != args.release_revision:
            raise ValueError("Retry revision differs from its plan")
        result, code = send_prepared_release(args.repo, plan, os.environ)
        if result is not None:
            # If this write fails after acceptance, the durable pending intent
            # remains. Never turn an unknown receipt into a definite send failure.
            write_cache(args.repo / LEDGER, result)
            plan["outcome"] = result["status"]
            write_cache(args.plan, plan)
            print(f"Email status: {result['status']}; error category: {result.get('errorCode', 'none')}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
