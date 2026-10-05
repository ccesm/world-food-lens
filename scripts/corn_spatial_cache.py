#!/usr/bin/env python3
"""Small deterministic annual archive; safe extraction, pinned content identity.

Only derived grids enter this archive. Raw rasters/NetCDF are never included.
The pinned archive can live as a GitHub Release asset (not a new storage service).
"""
import argparse
import gzip
import io
import json
import tarfile
from pathlib import Path

from corn_spatial import STATES, digest, external_cache, file_hash, validate_manifest

FILES = ("manifest.json", "cells.json", "coordinates.json", "overlap.npz")


def verify(root):
    index = json.loads((Path(root) / "index.json").read_text())
    if set(index["states"]) != {s["id"] for s in STATES} or index.get("failures"):
        raise ValueError("Annual archive must contain all ten validated states")
    partition=index.get("partitionAudit",{})
    if partition.get("sumSafe") is not True or partition.get("duplicateCornAreaM2") != 0:
        raise ValueError("Annual mask partition audit unavailable/failed")
    for state in STATES:
        m, _, _ = validate_manifest(Path(root) / state["id"])
        if m["key"] != index["states"][state["id"]] or m["identity"]["cropYear"] != index["cropYear"]:
            raise ValueError("Annual index/manifest identity mismatch")
        if partition["inputHashes"][state["id"]] != m["identity"]["cdlHash"] or abs(
                partition["nativeAreaM2"][state["id"]]-m["mappedCornAreaM2"]) > .01:
            raise ValueError("Native area/partition source does not match the crop grid")
    return index


def pack(root, output):
    verify(root)
    names = ["index.json"] + [f"{s['id']}/{f}" for s in STATES for f in FILES]
    partial = Path(str(output) + ".part")
    with partial.open("wb") as destination, gzip.GzipFile(fileobj=destination, mode="wb", mtime=0, filename="") as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for name in sorted(names):
                raw = (Path(root) / name).read_bytes()
                entry = tarfile.TarInfo(name)
                entry.size, entry.mtime, entry.mode = len(raw), 0, 0o644
                archive.addfile(entry, io.BytesIO(raw))
    partial.replace(output)
    return file_hash(output)


def unpack(archive_path, output, expected_hash):
    if file_hash(archive_path) != expected_hash:
        raise ValueError("Annual release asset checksum mismatch")
    output = external_cache(output)
    allowed = {"index.json"} | {f"{s['id']}/{f}" for s in STATES for f in FILES}
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        if len(members) != len(allowed) or {m.name for m in members} != allowed or any(
                not m.isfile() or m.size > 10_000_000 for m in members) or sum(m.size for m in members) > 30_000_000:
            raise ValueError("Unexpected annual archive content; links/traversal/oversized entries rejected")
        for member in members:
            path = output / member.name
            path.parent.mkdir(parents=True, exist_ok=True)
            partial = path.with_suffix(path.suffix + ".part")
            with archive.extractfile(member) as source, partial.open("wb") as destination:
                destination.write(source.read())
            partial.replace(path)
    return verify(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["pack", "unpack", "verify"])
    parser.add_argument("--cache", required=True)
    parser.add_argument("--archive")
    parser.add_argument("--sha256")
    args = parser.parse_args()
    if args.mode == "pack":
        print(pack(external_cache(args.cache), Path(args.archive)))
    elif args.mode == "unpack":
        print(json.dumps(unpack(args.archive, args.cache, args.sha256), sort_keys=True))
    else:
        print(digest(verify(args.cache)))
