"""Additive v1 metadata. Shared schema is also read by the browser/Node validator.

Attempt validation never replaces accepted-cache validation. Unknown publication
times stay null. Hashes cover accepted values, not attempts or retrieval clocks.
"""
import copy
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

SPEC = json.loads((Path(__file__).resolve().parents[1] / "src/data/dataContract.json").read_text())


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z", value):
        return None
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value
    except ValueError:
        return None


def valid_schema(value, schema=None):
    schema = SPEC["schema"] if schema is None else schema
    if "enum" in schema and not any(value == item and isinstance(value, bool) == isinstance(item, bool) for item in schema["enum"]):
        return False
    kind = "null" if value is None else "boolean" if isinstance(value, bool) else "object" if isinstance(value, dict) else "array" if isinstance(value, list) else "string" if isinstance(value, str) else "number"
    types = schema.get("type", [kind])
    if kind not in ([types] if isinstance(types, str) else types):
        return False
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0) or ("pattern" in schema and not re.search(schema["pattern"], value)):
            return False
        if schema.get("format") == "date-time" and timestamp(value) is None:
            return False
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        if any(key not in value for key in schema.get("required", [])):
            return False
        if schema.get("additionalProperties") is False and set(value) - set(properties):
            return False
        return all(valid_schema(value[key], rule) for key, rule in properties.items() if key in value)
    return True


def valid_metadata(value):
    return valid_schema(value) and not (
        value["attempt"]["retrieval"] == "failed" and any(value["attempt"][k] != "unknown" for k in ("format", "semantic"))
    ) and not (value["attempt"]["semantic"] == "passed" and (value["attempt"]["format"] != "passed" or value["attempt"]["retrieval"] != "ok")) and not (
        value["accepted"]["semantic"] == "passed" and value["accepted"]["format"] != "passed")


class DataIssue(ValueError):
    """Structured failure codes where a validation stage is actually known."""
    def __init__(self, message, reason="semantic_validation_failed", format_state="passed"):
        super().__init__(message)
        self.reason = reason
        self.format_state = format_state


def content(record):
    if "data" in record:
        def values(item):
            if isinstance(item, dict):
                return {k: values(v) for k, v in item.items() if k != "coverageAssessment"}
            if isinstance(item, list):
                return [values(v) for v in item]
            return item
        return values(record["data"])
    result = {k: record[k] for k in ("days", "soilClimatology", "points") if k in record}
    if "maps" in record:
        result["maps"] = {key: {field: layer[field] for field in ("period", "url", "layer", "title") if field in layer}
                          for key, layer in record["maps"].items()}
    return result


def fingerprint(record):
    values = content(record)
    # GDO verification check times are operational, not new image observations.
    if not values:
        return None
    return hashlib.sha256(json.dumps(values, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()).hexdigest()


def attach_metadata(record, key, previous=None, *, point_id=None, failure=None, parsed=False):
    old = previous or {}
    data = record.get("data", {})
    source = record.get("source", {})
    success = record.get("status") == "ok"
    has_data = bool(content(record))
    kind = record.get("failureKind", "unknown")
    reason = None if success else failure.reason if isinstance(failure, DataIssue) else "retrieval_failed" if kind == "retrieval" else "semantic_validation_failed" if kind == "validation" else "unknown"
    period = data.get("latest", {}).get("endMonth") or source.get("period") or data.get("issuedAt")
    if key in ("weather", "soil"):
        period = (record.get("days") or [{}])[-1].get("date")
    if key == "drought":
        period = record.get("maps", {}).get("shortTerm", {}).get("period")
    accepted = copy.deepcopy(old.get("metadata", {}).get("accepted")) if not success else None
    digest = fingerprint(record)
    metadata = {
        "contractVersion": 1, "datasetId": key + ("/" + point_id if point_id else ""),
        "provider": SPEC["providers"][key], "sourceUrl": source.get("url") or record.get("url"),
        "downloadUrl": source.get("downloadUrl") or record.get("url"),
        "observation": {"period": period, "marketYear": data.get("latestPeriod") if key == "usda" else None,
                        "vintage": data.get("releasePeriod") if key == "usda" else None, "publishedAt": timestamp(source.get("publishedAt"))},
        "attempt": {"checkedAt": timestamp(record.get("lastAttemptAt")),
                    "retrieval": "ok" if success or kind == "validation" else "failed" if kind == "retrieval" else "unknown",
                    "format": "passed" if success else getattr(failure, "format_state", "passed" if parsed else "unknown"),
                    "semantic": "passed" if success else "unknown" if reason == "invalid_format" else "failed" if kind == "validation" else "unknown", "reason": reason},
        "accepted": accepted or {"fetchedAt": timestamp(record.get("fetchedAt")), "format": "passed" if has_data else "unknown",
                    "semantic": "passed" if has_data else "unknown", "period": "unverified" if key == "drought" and record.get("periodVerified") is not True else "verified" if period else "unknown"},
        "cache": ("unchanged" if digest and digest == fingerprint(old) else "new") if success else
                 "unavailable" if not has_data else "retained-validation" if kind == "validation" else "retained-retrieval",
        "version": {"contentHash": digest, "observationId": data.get("observationId"), "revisionId": data.get("revisionId")},
        "extensions": {}
    }
    if key == "enso":
        metadata["sourceUrl"] = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"
        metadata["extensions"]["strengthExtraction"] = data.get("strengthEvidence", {}).get("status", "not-reliably-extracted")
    if key == "usda":
        metadata["extensions"] = {"refreshKind": record.get("refreshKind"), "coverage": data.get("coverageAssessment", {"state": "unknown"})}
    if key == "noaa":
        metadata["extensions"]["observationWindow"] = {k: data.get("latest", {}).get(k) for k in ("startMonth", "endMonth", "period", "provisional")}
    if key == "drought":
        metadata["accepted"]["period"] = "verified" if record.get("periodVerified") is True else "unverified"
        metadata["extensions"]["periodVerification"] = record.get("periodVerification")
    if key in ("fao", "worldBank", "eia", "usda"):
        metadata["extensions"]["derived"] = {
            "methodVersion": "stock-to-use/v1" if key == "usda" else "monthly-change/v1",
            "calculatedAt": timestamp(record.get("fetchedAt")) if success else old.get("metadata", {}).get("extensions", {}).get("derived", {}).get("calculatedAt"),
            "inputs": [{"datasetId": metadata["datasetId"], "vintage": metadata["observation"]["vintage"],
                        **metadata["version"]}],
            "eligibility": "eligible" if has_data and success and (key == "usda" or data.get("headline", {}).get("momPct") is not None or
                key == "worldBank" and all(isinstance(v, dict) and v.get("momPct") is not None for v in data.get("headline", {}).values())) else "insufficient",
        }
    if not valid_metadata(metadata):
        raise ValueError("Invalid canonical dataset metadata")
    record["metadata"] = metadata
    return record
