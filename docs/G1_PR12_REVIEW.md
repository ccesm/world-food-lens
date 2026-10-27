# G1.0 PR #12 — review corrections and raw preservation

Status: ready for review, **not merged**. Local review date: 2026-10-07 (America/Los_Angeles).
Reviewed original PR head: `2f9e97b5967ee8d3a98bac73485f05d74da0d5f3`.
Work was performed in an independent managed worktree, not the dirty original checkout.

## 1. September raw preservation — completed first

[Immutable release](https://github.com/ccesm/world-food-lens/releases/tag/usda-psd-2026-09-raw-v1),
release ID `406455865`, tag anchored to main `f1fdf2968a0ab59b419e8d17729f56c42278e8a9`.
Repository release immutability was enabled for this explicit archive request.
Published API result: `draft=false`, `immutable=true`.

| Source asset | Bytes | SHA-256 |
| --- | ---: | --- |
| psd_grains_pulses_csv.zip | 2,871,937 | `70464746e0905060c70c5f27330748769908f5159669b5b7b853e0925bd3d5f4` |
| psd_oilseeds_csv.zip | 3,842,357 | `4f670b5f824e5701d1f068d8da6c6f638a6540d73849f6c34c369e72fa8e94bb` |

Captured at 2026-10-07 22:36 PDT (2026-10-08 05:36 UTC).
The release manifest records actual per-file source URLs, resolved URLs, retrieval start/end,
HTTP metadata, ZIP members, sizes and hashes. Each latest G1 crop market year is 2026 with
September 2026 release metadata. Historical row update months are older and explicitly retained
as separate evidence; they are not complete historical release snapshots.

Both draft and published assets were downloaded again. ZIP hashes/sizes matched the originals;
manifest and checksums matched byte-for-byte. `gh release verify` also verified the signed GitHub
immutable-release attestation and all four asset digests. Compact receipt:
`docs/archives/usda-psd-2026-09-raw-v1.json`. No raw ZIP entered Git, Pages or production parsing.

## 2. Before/after review findings

The original head was exercised independently before corrections:

| Original behavior | Corrected contract/helper behavior |
| --- | --- |
| Lower-tier disagreement was reported as a conflict with Tier 1 | Best eligible tier is compared; lower tiers are retained as context |
| September and August estimates could be labelled a source conflict | Different release/observation/unit/basis/period is unknown, not comparable |
| Whitespace converted to numeric zero by `Number()` | Blank/absent stays missing; booleans/objects/non-finite values are rejected |
| stocksToUse was another core signal beside endingStocks | Core is production + endingStocks only; ratio remains separate |
| No G1 coverage/version acceptance helpers | Pure per-metric identity coverage and snapshot-monotonicity validators; no production parsing |

Official comparable USDA world aggregates are preferred future canonical evidence.
WFL sums are explicitly labelled cross-check/fallback and require coverage validation.
API-key availability is not a G1.1 blocker. No official-world API or report parser was added.

New regression cases cover source tiers, source/release comparability, absent metadata,
unordered same-source revisions, vintage regression despite newer retrieval/cache times,
authenticated same-vintage revision ordering, retained previous versions, missing countries
(including zero-valued countries), duplicate/unexpected IDs, EU E2/E4 and member overlap,
separate UK, audited commodity geography baselines, and source zero versus missing/malformed.
Aggregate core flags and rule membership are checked for consistency. Invalid core directions
remain unknown rather than silently becoming stable. Dead zones remain null, rules remain draft.

## 3. Verification

- Original PR JS suite: 249 passed; original Python suite: 178 passed under supported Python 3.13.
- Corrected JS suite: **258 passed** (nine additional test cases, 25 G1 contract tests).
- Corrected standard Python suite: **178 passed**.
- Frozen spatial runtime suite: **25 passed**.
- Frozen Iowa suite: **17 passed**.
- Frozen ten-state suite: **30 passed**.
- Total Python checks across these suites: **250 passed**.
- `npm test` passed with Node 24.19.0 and an explicitly selected Python 3.13.1 environment.
- Geospatial dependency versions match `scripts/corn_spatial_requirements.txt`.
- `npm run build` passed; existing large-chunk warning remains, no new runtime dataset/bundle integration.
- `git diff --check` passed.

Environment note: the first unqualified npm invocation selected system Python 3.9 and failed
three pre-existing Python tests; rerunning the original head and corrected suites with Python
3.13 passed. Production continues to declare Python 3.12; no workflow/runtime configuration changed.
These are local frozen-test results, not a new production Actions run.

## 4. Remaining boundaries

- G1.1 has not started: these helpers must be called by its future persistence/aggregation path;
  they do not change the current USDA parser or current retained-data behavior.
- Historical geography baselines and EU member IDs require year-specific review; identity count
  coverage is not production-weighted coverage. No totals are calibrated or extrapolated.
- Same-month PSD corrections have no authenticated edition sequence today; changed bytes
  remain quarantined until source ordering is established. A flag alone cannot authenticate a source;
  the future caller must validate the provenance supporting the supplied sequence.
- Cross-source comparison requires explicitly comparable metadata; a same-named marketing year
  does not establish an identical calendar period. No new provider is integrated.
- Interpretation thresholds and aggregate adoption remain draft; no live direction/score enabled.
- Level C, alerts, email, ledger, production data and scheduled production workflow are unchanged.
- No merge, deployment, production refresh or email was performed.

Stop here for PR review. Do not begin G1.1 or merge PR #12 as part of this task.
