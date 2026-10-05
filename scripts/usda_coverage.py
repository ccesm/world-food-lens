"""Conservative structural-loss quarantine, not a claim of worldwide completeness.

Provider Country_Code is an opaque identifier (not ISO). Prior accepted weights
prevent a missing country from disappearing from both numerator and denominator.
Thresholds are WFL operational controls, not USDA rules or crop-loss forecasts.
"""
import math
from data_contract import DataIssue


class CoverageIssue(DataIssue):
    def __init__(self, message):
        super().__init__(message, "coverage_incomplete")

FIELDS = ("production", "consumption", "endingStocks")


def checked_coverage(grain):
    coverage = grain.get("coverage")
    if coverage is None:
        return None
    if not isinstance(coverage, dict):
        raise CoverageIssue("USDA coverage invalid")
    if set(coverage) != {row["year"] for row in grain["history"]}:
        raise CoverageIssue("USDA coverage must represent every retained market year exactly")
    for row in grain["history"]:
        entry = coverage.get(row["year"], {})
        members = entry.get("contributors")
        if not isinstance(members, list) or not members or entry.get("count") != len(members):
            raise CoverageIssue("USDA coverage missing contributor records")
        if any(not isinstance(member, dict) for member in members):
            raise CoverageIssue("USDA coverage invalid contributor")
        ids = [member.get("id") for member in members]
        if any(not isinstance(i, str) or not i.startswith("usda-psd:") or len(i) <= 9 for i in ids) or len(set(ids)) != len(ids):
            raise CoverageIssue("USDA coverage duplicate or missing entity identity")
        for field in FIELDS:
            values = [member.get(field) for member in members]
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in values):
                raise CoverageIssue("USDA coverage invalid contributor quantity")
            if abs(sum(values) - row[field]) > max(.01, abs(row[field]) * 1e-8):
                raise CoverageIssue("USDA coverage does not reconcile to aggregate")
        if entry.get("basis") not in ("official-world", "contributors"):
            raise CoverageIssue("USDA coverage unknown aggregation basis")
        if entry["basis"] == "official-world":
            totals = entry.get("officialTotals")
            if len(members) != 1 or not isinstance(totals, dict) or any(totals.get(f) != row[f] for f in FIELDS):
                raise CoverageIssue("USDA coverage official total mismatch")
    return coverage


def assess_coverage(grain, previous):
    incoming = checked_coverage(grain)
    old = checked_coverage(previous) if previous.get("coverage") is not None else None
    if incoming is None:
        if old:
            raise CoverageIssue("USDA coverage metadata disappeared; retained cache")
        return {"state": "unknown", "comparisons": []}  # explicit legacy bridge
    comparisons = []
    old_rows = {row["year"]: row for row in previous.get("history", [])}
    if old and set(old) - set(incoming):
        raise CoverageIssue("USDA coverage lost historical market years; retained cache")
    for year, entry in incoming.items():
        prior_year = year if year in old_rows else previous.get("latestPeriod") if year == grain["latestPeriod"] else None
        before = old.get(prior_year) if old else None
        prior_row = old_rows.get(prior_year)
        if not before:
            # Legacy bootstrap cannot recover identities, but can detect a
            # disappearing contributor count before establishing the baseline.
            if prior_row and entry["basis"] == "contributors" and entry["count"] < prior_row.get("countryAreaCount", 0):
                raise CoverageIssue(f"USDA coverage count regressed during bootstrap ({year}); retained cache")
            comparisons.append({"marketYear": year, "referenceYear": prior_year, "state": "baseline-established",
                                "count": entry["count"], "retainedShares": None, "missingIds": [], "addedIds": []})
            continue
        before_ids = {m["id"]: m for m in before["contributors"]}
        after_ids = {m["id"] for m in entry["contributors"]}
        missing = sorted(set(before_ids) - after_ids)
        shares = {field: (sum(m[field] for id_, m in before_ids.items() if id_ in after_ids) /
                          sum(m[field] for m in before_ids.values()) if sum(m[field] for m in before_ids.values()) else None)
                  for field in FIELDS}
        authoritative = entry["basis"] == "official-world"
        if before.get("chinaId") and not entry.get("chinaId"):
            raise CoverageIssue("USDA coverage lost China needed for ex-China totals; retained cache")
        if not authoritative and missing and (before["basis"] == "official-world" or
                any(share is not None and share < .99 - 1e-10 for share in shares.values()) or
                len(missing) / len(before_ids) > .10):
            raise CoverageIssue(f"USDA coverage suspicious contributor loss ({year}): {', '.join(missing)}; retained cache")
        comparisons.append({"marketYear": year, "referenceYear": prior_year, "state": "official-total" if authoritative else "compared",
                            "count": entry["count"], "expectedCount": len(before_ids), "missingIds": missing,
                            "addedIds": sorted(after_ids - set(before_ids)), "retainedShares": shares})
    return {"state": "compared" if old else "baseline-established", "policy": "usda-coverage-v1",
            "referenceVintage": previous.get("releasePeriod"), "comparisons": comparisons}
