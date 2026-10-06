"""Small Git-backed release checks and optimistic ledger persistence.

Notification content is always read from a full immutable data commit. Current
main supplies the ledger and supersession checks, never newer message content.
No rebase, reset or force push.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from refresh_data import ROOT, write_cache

CACHES = ["official-data.json", "local-weather.json", "drought-monitor.json", "enso-outlook.json"]
STATIC = ["src/data/weatherPoints.json", "src/data/cropCalendars.js", "src/data/releaseSchedule.js", "src/data/cornAlignment.json"]
ALERT = "public/data/monitor-alerts.json"
MANIFEST = "public/data/release-manifest.json"
LEDGER = "public/data/alert-delivery.json"
GENERATED = [f"public/data/{name}" for name in CACHES] + [ALERT, MANIFEST]
ALL_GENERATED = GENERATED + ["public/data/corn-spatial.json"]  # Additive, optional in legacy releases.
SHA = re.compile(r"[a-f0-9]{40}")
HASH = re.compile(r"[a-f0-9]{64}")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def git(repo, *args, input=None, env=None):
    return subprocess.run(["git", *args], cwd=repo, input=input, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True, env=env).stdout


def commit_bytes(repo, revision, path, optional=False):
    if not SHA.fullmatch(revision or ""):
        raise ValueError("A full Git commit SHA is required")
    # Distinguish an absent input from a broken Git/history lookup.
    exists = git(repo, "ls-tree", revision, "--", path)
    if not exists:
        if optional:
            return None
        raise ValueError(f"Missing release file: {path}")
    return git(repo, "show", f"{revision}:{path}")


def ancestor(repo, older, newer):
    if not all(SHA.fullmatch(value or "") for value in (older, newer)):
        raise ValueError("Invalid Git revision")
    git(repo, "cat-file", "-e", f"{older}^{{commit}}")
    git(repo, "cat-file", "-e", f"{newer}^{{commit}}")
    result = subprocess.run(["git", "merge-base", "--is-ancestor", older, newer], cwd=repo,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode not in (0, 1):
        raise ValueError("Cannot establish Git ancestry")
    return result.returncode == 0


def validate_pointer(pointer):
    if (not isinstance(pointer, dict) or set(pointer) != {"releaseId", "dataRevision", "snapshotSha256"} or
            not re.fullmatch(r"release-[a-f0-9]{64}", pointer.get("releaseId", "")) or
            not SHA.fullmatch(pointer.get("dataRevision", "")) or
            not HASH.fullmatch(pointer.get("snapshotSha256", ""))):
        raise ValueError("Malformed release pointer")
    return pointer


def compare_release(incoming, previous, is_ancestor):
    validate_pointer(incoming)
    if previous is None:
        return "newer"
    validate_pointer(previous)
    if incoming["dataRevision"] == previous["dataRevision"]:
        if incoming != previous:
            raise ValueError("Same commit with conflicting release identity")
        return "same"
    if incoming["releaseId"] == previous["releaseId"]:
        raise ValueError("One release identity attached to different commits")
    if is_ancestor(previous["dataRevision"], incoming["dataRevision"]):
        return "newer"
    if is_ancestor(incoming["dataRevision"], previous["dataRevision"]):
        return "older"
    raise ValueError("Divergent release history; refusing notification")


def validate_manifest(manifest, snapshot, read_input, read_previous):
    required = {"schemaVersion", "releaseId", "sourceRevision", "evaluatedAt", "rulesVersion", "inputsHash", "snapshotSha256"}
    if (not isinstance(manifest, dict) or set(manifest) != required or manifest["schemaVersion"] != 1 or
            not SHA.fullmatch(manifest.get("sourceRevision", "")) or
            not all(HASH.fullmatch(manifest.get(key, "")) for key in ("inputsHash", "snapshotSha256")) or
            manifest["rulesVersion"] != "1"):
        raise ValueError("Malformed release manifest")
    feed = json.loads(snapshot)
    if (feed.get("schemaVersion") != 1 or feed.get("rulesVersion") != manifest["rulesVersion"] or
            feed.get("generatedAt") != manifest["evaluatedAt"] or digest(snapshot) != manifest["snapshotSha256"] or
            feed.get("release") != {"id": manifest["releaseId"], "sourceRevision": manifest["sourceRevision"], "inputsHash": manifest["inputsHash"]}):
        raise ValueError("Alert snapshot does not match its release manifest")
    inputs = []
    for name in CACHES:
        raw = read_input(f"public/data/{name}", True)
        inputs.append([name, digest(raw) if raw is not None else None])
    if (feed.get("analysis") or {}).get("cornSpatial") is not None:
        raw = read_input("public/data/corn-spatial.json", False)
        if raw is None:
            raise ValueError("Level C artifact lacks release-bound input")
        inputs.append(["corn-spatial.json", digest(raw)])
    for label, path in [("previous-alerts", ALERT), ("previous-delivery", LEDGER)]:
        raw = read_previous(path, True)
        inputs.append([label, digest(raw) if raw is not None else None])
    for path in STATIC:
        # Old releases predate the additive spatial method. A new alignment
        # artifact MUST bind its configuration, never fall back to legacy hashes.
        spatial = path == "src/data/cornAlignment.json"
        raw = read_input(path, spatial)
        if spatial and raw is None:
            if (feed.get("analysis") or {}).get("cornAlignment") is not None:
                raise ValueError("Spatial-stage artifact lacks its release-bound configuration")
            continue
        inputs.append([path, digest(raw)])
    if (feed.get("analysis") or {}).get("cornSpatial") is not None:
        inputs.append(["src/data/cornSpatial.json", digest(read_input("src/data/cornSpatial.json", False))])
    if digest(compact(inputs)) != manifest["inputsHash"]:
        raise ValueError("Release input bytes do not match the evaluated data revision")
    identity = [1, manifest["sourceRevision"], manifest["evaluatedAt"], manifest["rulesVersion"], manifest["inputsHash"]]
    if manifest["releaseId"] != "release-" + digest(compact(identity)):
        raise ValueError("Invalid deterministic release identity")
    return feed


def verify_release(repo, revision):
    manifest = json.loads(commit_bytes(repo, revision, MANIFEST))
    source = manifest.get("sourceRevision")
    if not SHA.fullmatch(source or "") or git(repo, "rev-parse", f"{revision}^").decode().strip() != source:
        raise ValueError("Release must be a generated-data commit directly following its source revision")
    changed = git(repo, "diff", "--name-only", source, revision).decode().splitlines()
    if any(path not in ALL_GENERATED for path in changed):
        raise ValueError("Release commit unexpectedly changes source code")
    feed = validate_manifest(manifest, commit_bytes(repo, revision, ALERT),
        lambda path, optional: commit_bytes(repo, revision, path, optional),
        lambda path, optional: commit_bytes(repo, source, path, optional))
    return feed, validate_pointer({"releaseId": manifest["releaseId"], "dataRevision": revision,
                                  "snapshotSha256": manifest["snapshotSha256"]})


def save_data(repo, dist):
    source = git(repo, "rev-parse", "HEAD").decode().strip()
    manifest = json.loads((repo / MANIFEST).read_bytes())
    if manifest["sourceRevision"] != source:
        raise ValueError("Build source revision changed during evaluation")
    def local(path, optional):
        candidate = repo / path
        return candidate.read_bytes() if candidate.exists() else None if optional else candidate.read_bytes()
    validate_manifest(manifest, (repo / ALERT).read_bytes(), local,
                      lambda path, optional: commit_bytes(repo, source, path, optional))
    status = git(repo, "status", "--porcelain", "--untracked-files=all").decode().splitlines()
    if any(line[3:] not in ALL_GENERATED for line in status):
        raise ValueError("Non-data working tree changes; refusing release commit")
    for path in ALL_GENERATED:
        published = dist / path.removeprefix("public/")
        if (repo / path).exists() and ((not published.exists()) or published.read_bytes() != (repo / path).read_bytes()):
            raise ValueError("Pages artifact differs from the evaluated release")
    git(repo, "fetch", "origin", "main")
    if git(repo, "rev-parse", "origin/main").decode().strip() != source:
        raise ValueError("Main advanced during build; rebuild from current main")
    git(repo, "add", "--", *[path for path in ALL_GENERATED if (repo / path).exists() or git(repo, "ls-files", "--", path)])
    git(repo, "-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit", "-m", "Refresh official data release")
    revision = git(repo, "rev-parse", "HEAD").decode().strip()
    verify_release(repo, revision)
    git(repo, "push", "origin", f"{revision}:refs/heads/main")
    return revision


def latest_ledger(repo, release):
    git(repo, "fetch", "origin", "main")
    base = git(repo, "rev-parse", "origin/main").decode().strip()
    if not ancestor(repo, release["dataRevision"], base):
        raise ValueError("Requested release is not in current main history")
    raw = commit_bytes(repo, base, LEDGER, True)
    return (json.loads(raw) if raw is not None else {"schemaVersion": 1, "sentEventIds": []}), digest(raw) if raw is not None else None


def latest_data_release(repo):
    # Called after latest_ledger fetch. A newer generated release supersedes
    # retries even if its deployment/notification later fails: conservative,
    # never resurrect a superseded analytical snapshot as current.
    revision = git(repo, "log", "-1", "--format=%H", "origin/main", "--", MANIFEST).decode().strip()
    if not revision:
        raise ValueError("Current main has no identified data release")
    return verify_release(repo, revision)[1]


def persist_ledger(repo, release, expected_hash, ledger):
    """Overlay only the receipt on latest main, with compare-before-write.

    An unrelated manual commit can advance main safely. A changed ledger or a
    racing push fails without merging notification state or force pushing.
    """
    _, current_hash = latest_ledger(repo, release)
    if current_hash != expected_hash:
        raise ValueError("Delivery ledger changed concurrently; receipt needs reconciliation")
    raw = (json.dumps(ledger, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()
    if digest(raw) == current_hash:
        return current_hash
    base = git(repo, "rev-parse", "origin/main").decode().strip()
    with tempfile.TemporaryDirectory(prefix="wfl-ledger-index-") as directory:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(directory) / "index"))
        git(repo, "read-tree", base, env=env)
        blob = git(repo, "hash-object", "-w", "--stdin", input=raw).decode().strip()
        git(repo, "update-index", "--add", "--cacheinfo", f"100644,{blob},{LEDGER}", env=env)
        tree = git(repo, "write-tree", env=env).decode().strip()
        env.update(GIT_AUTHOR_NAME="github-actions[bot]", GIT_COMMITTER_NAME="github-actions[bot]",
                   GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com",
                   GIT_COMMITTER_EMAIL="41898282+github-actions[bot]@users.noreply.github.com")
        revision = git(repo, "commit-tree", tree, "-p", base, input=b"Record automatic alert delivery status\n", env=env).decode().strip()
    git(repo, "push", "origin", f"{revision}:refs/heads/main")
    return digest(raw)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["save-data", "persist-ledger"])
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    parser.add_argument("--plan", type=Path, default=ROOT / ".wfl-notification-plan.json")
    args = parser.parse_args()
    if args.command == "save-data":
        revision = save_data(args.repo, args.dist)
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"sha={revision}\n")
        print(f"Saved release revision: {revision}")
    else:
        plan = json.loads(args.plan.read_bytes())
        if plan["action"] == "skipped":
            print(f"Notification skipped: {plan['reason']}")
        else:
            ledger = json.loads((args.repo / LEDGER).read_bytes())
            plan["expectedLedgerHash"] = persist_ledger(args.repo, plan["release"], plan["expectedLedgerHash"], ledger)
            plan["intentDurable"] = bool(ledger.get("pendingAttempt"))
            write_cache(args.plan, plan)
            print("Delivery state persisted to main")
