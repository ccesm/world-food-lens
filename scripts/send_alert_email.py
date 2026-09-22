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

SITE = "https://ccesm.github.io/world-food-lens/"
MAX_AGE_SECONDS = 72 * 3600
SEVERITY = {"yellow": 1, "red": 2}


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
    gaps = [row for row in feed["health"] if row["status"] == "unavailable" and old_health.get(row["id"]) == "ok"]
    return changes, gaps


def build_message(feed, changes, gaps, config, now, welcome=False):
    message = EmailMessage()
    message["From"] = config["user"]
    message["To"] = config["recipient"]
    message["Date"] = format_datetime(now)
    message["Subject"] = "World Food Lens｜自动预警邮件已启用" if welcome else \
        f"World Food Lens｜{len(changes)} 条预警变化 · {len(gaps)} 项数据中断"
    identity = "|".join([feed["generatedAt"], *(item["id"] for item in changes), *(row["id"] for row in gaps), str(welcome)])
    message["Message-ID"] = f"<wfl-{hashlib.sha256(identity.encode()).hexdigest()[:32]}@world-food-lens.local>"
    lines = ["World Food Lens / 全球粮食观察", ""]
    if welcome:
        lines += ["邮件通道测试：这是启用后的第一封确认邮件。", "之后只在新增、升级的预警或已接通资料发生中断时发送变化摘要。", ""]
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
        lines += [f"[数据中断] {gap['label']['zh']}", gap["reason"]["zh"], "缺失资料不等于风险解除。", ""]
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
        refused = server.send_message(message, from_addr=config["user"], to_addrs=[config["recipient"]])
        if refused:
            raise smtplib.SMTPRecipientsRefused(refused)
    finally:
        # A QUIT failure after DATA acceptance does not mean the message failed.
        try:
            server.quit()
        except (OSError, smtplib.SMTPException):
            server.close()


def deliver(feed, previous, env, now=None, sender=smtp_send, test=False):
    now = now or datetime.now(timezone.utc)
    stamp = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    ledger = copy.deepcopy(previous)
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
            ledger["healthStates"] = {row["id"]: row["status"] for row in feed["health"]}
            ledger["status"] = "sent" if ledger.get("lastSentAt") else "configured"
            ledger.pop("errorCode", None)
            return ledger, 0
        message = build_message(feed, changes, gaps, config, now, welcome)
        ledger["lastAttemptAt"] = stamp
        sender(config, message)
        ledger.update(status="sent", lastSentAt=stamp, acceptance="smtp-accepted")
        if welcome:
            ledger["welcomeSentAt"] = stamp
        for item in changes:
            alert = item["alert"]
            ledger["deliveredEpisodes"][episode_key(alert)] = alert["severity"]
        ledger["sentEventIds"] = list(dict.fromkeys([*ledger.get("sentEventIds", []), *(item["id"] for item in changes)]))[-1000:]
        ledger["healthStates"] = {row["id"]: row["status"] for row in feed["health"]}
        ledger.pop("errorCode", None)
        return ledger, 0
    except Exception as error:
        ledger.update(status="failed", lastAttemptAt=stamp, errorCode=type(error).__name__)
        return ledger, 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "public/data")
    parser.add_argument("--test", action="store_true", help="Explicit extra connection test")
    args = parser.parse_args()
    path = args.data_dir / "alert-delivery.json"
    previous = json.loads(path.read_text()) if path.exists() else {"schemaVersion": 1, "sentEventIds": []}
    feed = json.loads((args.data_dir / "monitor-alerts.json").read_text())
    result, code = deliver(feed, previous, os.environ, test=args.test)
    write_cache(path, result)
    print(f"Email status: {result['status']}; error category: {result.get('errorCode', 'none')}")
    raise SystemExit(code)
