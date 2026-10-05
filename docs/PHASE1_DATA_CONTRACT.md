# Phase 1 — Canonical Data Contract + Central Data Health

Local implementation on `main`, based on `6625cdb8108fbcc7ffb6a003baae7c392ee90d51` with Phase 0 batches 1–3 already present as uncommitted changes. No commit, push, deployment, provider refresh, real email, or change to `public/data` was performed. This report describes the local code, not an already-published migration.

## A. Before Phase 1

The pre-design inventory is [PHASE1_INVENTORY.md](PHASE1_INVENTORY.md). Python collectors stored source-specific payloads, `status`, last successful fetch and last attempt. Phase 0 correctly retained last-good data, checked USDA publication monotonicity, kept GDO period verification fail-closed, audited ENSO strength extraction, and bound alerts/email to immutable releases.

Health interpretation remained distributed. UI helpers, alert evidence gates, weather/soil modules, and food-stress scoring repeated fetch-age and observation-age decisions. ENSO UI allowed seven days while the alert engine allowed three. SourceDesk covered only macro sources. USDA aggregates retained contributor counts, but no stable identities or prior-contributor-weight comparisons.

## B. Canonical contract

### Layers and schema strategy

1. `record.metadata`: small persisted accepted-dataset/attempt contract, version 1. Existing payload fields remain unchanged.
2. Source extensions: existing original evidence stays in the source payload; metadata adds only relevant audit summaries/references.
3. Runtime health/evidence projection: evaluated at a supplied clock, not frozen into ingestion as permanently “fresh.”
4. Derived provenance: method version, exact accepted input identities, calculation time, eligibility and nullable existing release reference.

The shared JSON Schema subset and policy/reason registry live in `src/data/dataContract.json`. Python and JavaScript implement the same small subset: `type`, `enum`, `required`, `properties`, `additionalProperties`, `minLength`, `pattern`, and UTC `date-time`. Neither language requires a new validation dependency. Tests execute Python-produced records in JavaScript and compare malformed-case acceptance across both validators. Extending the subset requires changes and parity tests in both languages; it is not a general-purpose JSON Schema engine.

All fields below are required unless stated otherwise. `null` means unknown/not applicable, never an inferred publication date.

| Field | Meaning and allowed values | Nullable |
| --- | --- | --- |
| `contractVersion` | Literal `1` | No |
| `datasetId` | Stable local dataset identifier: `fao`, `worldBank`, `usda`, `eia`, `noaa`, `enso`, `drought`, or `weather/<pointId>` | No |
| `provider` | Provider label from the shared registry | No |
| `sourceUrl` | Official landing/evidence URL; HTTPS | Yes |
| `downloadUrl` | Actual download URL when exposed by the adapter, including FAO discovered fallback URL; HTTPS | Yes |
| `observation.period` | Exact represented period: monthly observation, marketing year, ENSO issue date, weather final day, or GDO candidate date | Yes |
| `observation.marketYear` | USDA `YYYY/YYYY`; separate from publication vintage | Yes |
| `observation.vintage` | USDA publication `YYYY-MM` | Yes |
| `observation.publishedAt` | Exact official UTC timestamp, only if the source supplies one with that precision | Yes |
| `attempt.checkedAt` | Latest collection attempt clock, not official publication time | Yes |
| `attempt.retrieval` | `ok`, `failed`, `unknown` | No |
| `attempt.format` | `passed`, `failed`, `unknown` | No |
| `attempt.semantic` | `passed`, `failed`, `unknown` | No |
| `attempt.reason` | One ingestion reason from C, or null on success | Yes |
| `accepted.fetchedAt` | Successful download time of the retained accepted record | Yes |
| `accepted.format` | Accepted cache: `passed`, `failed`, `unknown` | No |
| `accepted.semantic` | Accepted cache: `passed`, `failed`, `unknown` | No |
| `accepted.period` | `verified`, `unverified`, `unknown` | No |
| `cache` | `new`, `unchanged`, `retained-retrieval`, `retained-validation`, `legacy`, `unavailable` | No |
| `version.contentHash` | Lowercase SHA-256 of normalized accepted values, not attempt clocks | Yes for legacy/no data |
| `version.observationId` | Existing USDA commodity + market-year identity | Yes |
| `version.revisionId` | Existing USDA history-content fingerprint; not an official chronological revision number | Yes |
| `extensions` | Object containing only applicable source extensions | No; can be empty |

`new` means accepted content differs, not necessarily a new observation/publication. `unchanged` can accompany a new successful download timestamp. Current collectors download on each successful attempt; this does not claim HTTP 304/HEAD support. Failed attempts never advance the accepted fetch time, change the accepted values, or turn an older vintage into a new publication.

Source frequencies/types live once in the shared `datasets` registry: monthly index/benchmark, monthly marketing-year vintage, overlapping three-month RONI, monthly ENSO outlook, daily point observations, product-specific GDO maps. Commodity identity remains in USDA `grains` and observation IDs. Point geography remains in `weatherPoints.json`, referenced by the point ID. A separate `soil/<pointId>` health row is a view of the same `weather/<pointId>` collected dataset and hash; it is not a second invented download.

### Extensions

| Extension | Meaning |
| --- | --- |
| USDA `refreshKind` | Existing Phase 0 new market year / new publication / same-vintage revision / unchanged distinction |
| USDA `coverage` | Assessment state, policy version, previous publication, and per-market-year comparisons; full contributors remain in `data.coverage` (and each grain’s coverage) |
| NOAA RONI `observationWindow` | `startMonth`, `endMonth`, original seasonal `period`, `provisional`; null where unavailable |
| ENSO `strengthExtraction` | Original extraction status; the full supporting text, probability/event/forecast-period evidence remain in `data.strengthEvidence` |
| GDO `periodVerification` | Existing availability/product-period audit, including original check and reason; null if unavailable |
| Macro `derived` | Stock-to-use or monthly-change calculation provenance; not an assertion that every downstream rule has sufficient history |

Hash encoding is Python sorted-key compact JSON with ASCII escaping and no NaN/Infinity. It is not advertised as an RFC canonical JSON standard. USDA coverage-assessment comparisons are excluded from the value hash so establishing/comparing a baseline does not itself become a new source revision. GDO operational verification flags/checks are excluded; represented map periods, layer URLs and sampled values remain included. Existing release input-byte hashes continue to bind the complete serialized payload, including diagnostics. Browser code treats ingestion hashes as version identifiers, not independent source authentication.

### Valid combinations

Retrieval failure cannot assert passed format/semantic checks for that attempt. Semantic success requires format success and successful retrieval. Accepted semantic success requires accepted format success. A failed attempt can coexist with passed accepted-cache validation. Invalid explicit metadata never silently falls back to the legacy adapter. The JS adapter also checks dataset identity, observation/vintage/market-year, attempt/fetch timestamps and record success/error consistency against the legacy fields during migration.

On parser exceptions before a stage can be established, `format` remains `unknown`; it is not fabricated as passed. When an adapter returns a parsed result and subsequent checks fail, format success and semantic failure can be represented separately. Typed validation failures supply stable reason codes for regression and coverage; free-text exception messages remain diagnostic only.

## C. Reason-code model

The shared registry carries Chinese and English explanations. Dataset reasons and rule reasons are separate arrays, not an outage inferred from an empty analytical result.

| Code | User-facing meaning |
| --- | --- |
| `retrieval_failed` | 本次获取失败 / latest retrieval failed |
| `invalid_format` | 文件或契约格式不符 / invalid format or contract |
| `semantic_validation_failed` | 新资料未通过内容核验 / incoming values failed validation |
| `period_unverified` | 对应日期尚未核实 / observation date unverified |
| `awaiting_publication` | 正常等待官方发布 / expected publication wait |
| `stale` | 检查或观测更新滞后 / check or observation overdue |
| `cached_after_failure` | 保留上次有效缓存 / last valid cache retained |
| `insufficient_evidence` | 本项分析资料不足 / insufficient evidence for this rule |
| `publication_regression` | 拒绝较旧出版版本 / older publication rejected |
| `coverage_incomplete` | 地区贡献覆盖不足或未核实 / contributor coverage incomplete or unverified |
| `unknown` | 缺少可靠元数据或未知发布节奏 / metadata or cadence unknown |

Ingestion `attempt.reason` is limited to retrieval/format/semantic/regression/coverage/unknown (or null). Freshness/cache/evidence reasons are computed by Central Data Health.

## D. Central Data Health

```text
Python adapters → last-good refresh orchestration → legacy payload + metadata
                                                      ↓
                                      normalizeMetadata (legacy bridge only)
                                                      ↓
                         datasetHealth + source-specific publicationState
                             ↙                        ↓                 ↘
                    UI source labels         rule-owned windows     SourceDesk
                                                      ↓
                                     evidence eligibility + provenance
                                                      ↓
                           monitor-alerts.dataHealth + Phase 0 release identity
```

`dataHealth.js` is the interpreter. `freshness.js` owns cadence logic and reads the shared policy limits. `centralDataHealth.js` collects five macro datasets, ENSO, GDO and weather/soil views for every configured point. The existing monitor feed contains this snapshot; no new independent health file or release identity is introduced.

Runtime rows include `metadata` (nullable when invalid), `retrieval`, `validation`, `freshness`, `displayUsable`, `analysisUsable`, `reasons`, `eligibility`, `evidence:{ruleId,eligible,reasons}`, and nullable `release`. The collector adds unique `id`; its wrapper contains `schemaVersion:1`, `assessedAt`, `release`, `datasets`. ENSO adds `strengthEvidence:{ruleId,extracted,eligible,reason}` so reliable extraction is separate from a currently usable report. Snapshot validation checks dimensions, reason vocabulary, eligibility consistency, assessment time and release linkage.

`freshness` is `current`, `awaiting`, `overdue`, `stale`, or `unknown`. Unusability is not overloaded into a freshness state: it is expressed by `displayUsable`/`analysisUsable`, validation and reasons. No market interpretation or score occurs in this layer.

`sourceHealth.js` is now a four-field compatibility projection, not a competing freshness engine. Legacy alert health rows are projected from the central snapshot. Rule-specific continuity, source location, unit, comparison-window and crop-stage checks remain in their rules. A healthy FAO dataset with too few comparison observations stays healthy while that rule is ineligible. Partial point failures remain visible without discarding successful points.

SourceDesk shows accepted observations, marketing year/vintage, attempted versus accepted fetch times, cache reuse, availability and bilingual reasons. A separate expanded section shows the complete **assessment-time** snapshot and release, rather than mixing it into a claimed live status. Old published feeds explicitly say that this diagnostic snapshot has not yet been generated. Main dashboard layout is unchanged. Climate and price-model availability use the same health helpers; forecast mathematics is unchanged.

### Freshness policies

- Successful check age: three days across connected collectors. Failed attempts do not renew it.
- Weather: latest observed day at most ten days old; collector end-date is conservatively UTC today minus four days.
- Soil: same daily policy, but month-start prior-month observations are normal `awaiting` while that four-day collection lag crosses the boundary. Prior-month values never replace current-month rule evidence.
- FAO/USDA: confirmed schedule dates already in the repository, with the Phase 0 operational allowance preserved. USDA uses publication vintage, not marketing year.
- ENSO outlook: confirmed advisory schedule when known, conservative 45-day age guard otherwise. UI and alerts now share three-day fetch freshness; future fetches cannot be current.
- World Bank/EIA: prior-month observations; no invented exact publication dates. Unknown schedule remains unknown when the newest expected observation is absent; conservative 100-day ceiling is an overdue guard, not a publishing promise.
- RONI: represented three-month window with latest end month; never reuse the ENSO-advisory date as the RONI file’s publication time.
- GDO: short-term health age guard, product-specific layer limits remain in `droughtMonitor`; no analytical use without product-period verification, regardless of a successful image download.

## E. Source migration

| Source | Before → after |
| --- | --- |
| FAO | Implicit retained cache → explicit accepted versus attempted validation, unchanged/content hash, fallback download URL, rule eligibility |
| USDA | Marketing year and vintage monotonicity only → same protections plus contributor identity/coverage quarantine and derivation provenance |
| NASA weather/soil | Per-point cache with duplicated age gates → additive per-point metadata, shared freshness and separate soil rule view |
| GDO | Phase 0 strict verification fields → those fields retained, image parse/semantic status distinct from unverified candidate period; automatic gate remains closed |
| ENSO | Audited strength evidence but separate UI freshness → preserved original evidence, explicit extraction summary and shared report freshness |
| World Bank / EIA | Source-specific status interpretation → shared macro contract, actual monthly observation and derivation input hash |
| Observed RONI | Seasonal text and local error notice → explicit observed window/end month and central label; no fabricated advisory publication identity |
| Editorial templates, policies, seasonal outlook registry, release schedules | Remain curated records with their own dated review rules; no fake daily network status. Crop-template compatibility row no longer fabricates a fetch timestamp. Source revision/release binds static inputs. |
| TradingView / recovered snapshot | Unchanged external embed and historical last-resort fallback; not promoted to official collected current datasets |

All connected automatic collectors now write metadata on their next **authorized** normal run. Checked-in caches were not rewritten, refreshed or published in this task. All are readable through the adapter now. This is implementation-complete migration support, not a claim that production caches already contain new fields.

## F. USDA coverage integrity

The parser retains an opaque `usda-psd:<Country_Code>` identity, display name and production/consumption/stocks quantities for each actual aggregate contributor in each market year. Country names are not the identity. EU member exclusion and the existing EU aggregate convention are preserved. Conflicting name/code mappings and duplicate attributes fail validation.

`coverage[marketYear]` contains `basis` (`contributors` or `official-world`), `count`, `contributors`, `officialTotals` (nullable), and `chinaId` (nullable). Every retained year must have exactly one coverage entry. Contributor sums must reconcile to accepted aggregate quantities. When an official World row exists, the existing parser uses that authoritative total rather than pretending a partial set of individual countries is a complete world aggregate; the corresponding coverage basis explicitly identifies this.

Before accepting a refresh, `assess_coverage` compares the same market year with the previous accepted dataset. A newly introduced latest marketing year uses the previous latest year as a structural reference, explicitly recorded as `referenceYear`; it does not pretend they are the same observation. It records missing/added IDs, expected and actual counts, and retained shares weighted by **prior accepted** production, consumption and stocks. These shares describe continuity of the previous aggregate, not verified shares of all worldwide production.

WFL v1 quarantine rules:

- Reject loss of more than 1% of prior production, consumption **or** stocks contribution, or more than 10% of prior contributor count.
- Reject disappearance of China previously needed for ex-China quantities, coverage metadata after it has been established, or historical market-year coverage.
- Reject malformed identities or sums that do not reconcile.
- Reject a change from an official World aggregate to contributor totals without a comparable contributor baseline.
- With a legacy cache lacking identities, reject a reduced country count before establishing the first baseline. No retained-share figure is invented for this bootstrap.

Additions, stable-ID name corrections, unchanged coverage, same-vintage numerical revisions with reconciled contributor values, and small composition losses below the thresholds remain possible. A switch to a validated official World total is possible. The thresholds are operational anomaly controls, not USDA policy or estimates of crop damage.

There is deliberately **no blind override flag**. A genuine major boundary/entity recoding without official World totals will be conservatively quarantined until a reviewed identifier/baseline correction is made. The first baseline cannot prove absolute completeness, nor can legacy counts detect equal-count substitutions before identity capture. These limitations are visible and should be considered before future coverage expansion.

A reproduced missing-UK fixture retains exactly the same apparently plausible stock/use ratio, but is rejected by prior contributor weights. The refresh keeps the earlier dataset and original successful fetch time and exposes `coverage_incomplete`. Older publication rejection and same-vintage revision handling from Phase 0 remain in force before publication.

## G. Derived-data provenance

`derivedProvenance` supplies `methodVersion`, `calculatedAt`, nullable `release`, `inputs`, `eligibility` (`eligible`/`insufficient`) and `reasons`. Each input has `datasetId`, nullable `vintage`, `observationId`, `contentHash`, and `revisionId`. Legacy hashes stay null. Null release on an in-browser calculation is honest: a separately fetched browser bundle is not falsely assigned to an unrelated monitor release.

Examples:

```json
{
  "methodVersion": "monthly-change/v1",
  "calculatedAt": "2026-10-04T12:00:00Z",
  "inputs": [{"datasetId": "fao", "vintage": null, "observationId": null,
              "contentHash": "<accepted values SHA-256>", "revisionId": null}],
  "eligibility": "eligible"
}
```

The ingestion-level derived extension has no separate release field: the enclosing published input is bound by the existing release manifest. Stock/use uses `stock-to-use/v1`, its USDA market year/vintage and existing revision identity. Food stress has `food-stress/v1` plus per-factor `stock-percentile/v1`, `cost-percentile/v1`, `price-percentile/v1`; incomplete total coverage remains unscored. The unchanged price model has a `price-momentum/v1` health/provenance wrapper and does not present a current forecast after failed or stale refreshes.

Active alerts and new events identify their actual input dataset/point and rule-method version. Crop alerts also reference the editorial crop-calendar input; its source code is bound by the release’s source revision. Verification-loss retains the alert’s original evidence provenance and records an ineligible evaluation provenance. Resolved events record the new evaluation separately from the original alert evidence. The generator links newly calculated provenance and health snapshots to the same existing `release-…` identity before computing the final snapshot checksum. It does not change release-ID construction, ledger monotonicity, retry or SMTP uncertainty behavior.

## H. Exact files changed in this Phase 1 task

Paths below are repository-relative. Existing Phase 0 dirty files not listed here were not changed by this phase.

New:

- `docs/PHASE1_INVENTORY.md`
- `docs/PHASE1_DATA_CONTRACT.md`
- `scripts/data_contract.py`
- `scripts/usda_coverage.py`
- `src/data/dataContract.json`
- `src/services/dataContract.js`
- `src/services/dataHealth.js`
- `src/services/freshness.js`
- `src/services/centralDataHealth.js`
- `tests/contract_fixtures.py`
- `tests/dataContract.test.js`
- `tests/sourceDesk.test.js`
- `tests/test_data_contract.py`
- `tests/test_usda_coverage.py`

Updated:

- `scripts/macro_sources.py`
- `scripts/refresh_data.py`
- `scripts/refresh_weather.py`
- `scripts/refresh_drought.py`
- `scripts/refresh_enso.py`
- `scripts/evaluate_alerts.mjs`
- `src/services/sourceHealth.js` (already untracked Phase 0 file)
- `src/services/officialSources.js`
- `src/services/localWeather.js`
- `src/services/droughtMonitor.js`
- `src/services/ensoOutlook.js`
- `src/services/automaticAlerts.js`
- `src/services/alertFeed.js`
- `src/services/foodStress.js`
- `src/services/priceForecast.js`
- `src/components/SourceDesk.jsx`
- `src/components/ClimateMonitor.jsx`
- `src/components/GlobalFoodStress.jsx`
- `src/components/PriceOutlook.jsx`
- `tests/ensoOutlook.test.js`
- `tests/releaseIdentity.test.js` (already untracked Phase 0 file)

No package/dependency, workflow, email sender, release pipeline, public cache, navigation, theme or data-provider changes in Phase 1.

## I. Tests and verification

- New Python tests: six contract cases and six USDA coverage cases.
- New JavaScript tests: fourteen contract/health/provenance cases and two actual JSX bilingual rendering cases.
- Existing ENSO fixture now pins its successful fetch to its historical test clock; a future fetch cannot be classified current. Existing release tests bind their new diagnostic snapshot to the same release and also assert generator binding.
- Tests cover new/unchanged content, retrieval failure, structural/semantic rejection, valid cache retention, explicit regression reason, current/awaiting/stale/unknown freshness, healthy but rule-ineligible data, malformed metadata, cross-language source migration/parity, missing-country plausible totals, legitimate coverage changes, official-total transition, GDO unverified periods, alert evidence lineage, release mismatch, legacy compatibility and current-model health gating.
- Final suites: **111 JavaScript + 107 Python = 218 tests passed**. The complete suites include all Phase 0 safety regressions and mocked notification/release tests.
- Production build passes. The existing large JavaScript chunk warning remains (approximately 1.04 MB uncompressed); bundle splitting is outside this task.
- SourceDesk Chinese/English rendering and assessment/cache wording pass in-memory JSX rendering tests. A browser visual check was **not** completed: the sandbox refused local preview/WebSocket listeners. No claim of visual QA is made.
- `git diff --check` passes; main HEAD remains unchanged and `public/data` has no changes. No real notification or deployment occurred.

## J. Backward compatibility and removal path

Legacy JSON is normalized only when `metadata` is absent. Unknown version IDs and timestamps remain null. Persisted explicit-but-invalid metadata fails closed rather than being replaced with optimistic legacy status. Raw cached observations remain readable for historical display even when current analysis is unavailable. Existing alert feed/notification four-dimensional fields are retained as projections, so Phase 0 readers remain compatible.

Legacy USDA data without contributor identities remain readable and retain the existing pre-migration analytical behavior, with unknown coverage disclosed; the adapter does not claim verified completeness. Once a new ingestion record contains canonical metadata, missing/unknown coverage blocks its current analysis, and established contributor metadata cannot silently disappear on a later refresh.

Removal sequence: authorize a normal run/deployment; confirm every connected source has canonical metadata and USDA has a reviewed contributor baseline; retain old-feed readability for the supported archive window; then remove absent-metadata inference and old label fallbacks. Keep wire projections until the email/archive consumers explicitly adopt a newer feed schema. There is one current freshness interpreter throughout this transition, not two competing freshness engines.

## K. Remaining technical debt / limits

- No live provider run or production migration was authorized; first canonical ingestion/baseline still needs normal operational validation.
- First USDA contributor baseline cannot establish absolute world completeness; equal-count substitutions in an old count-only cache are not recoverable. Major legitimate entity reorganization requires human-reviewed baseline/identity correction, not automatic acceptance.
- Same-vintage corrections are content-identifiable, but USDA monthly bulk metadata still cannot prove official ordering of two corrections within that month.
- GDO returned-image period remains unverified; automatic drought evidence remains disabled where that proof is absent.
- A parser failure may leave format stage unknown rather than pretending to know whether transport/structure or meaning failed; exact stage instrumentation can be added only where adapters expose reliable evidence.
- Archived legacy records have no recoverable content hashes/exact publication timestamps. Browser calculations have null release until exact input/release matching is available; null is not replaced with the latest unrelated release.
- Editorial review freshness and historical selected-month completeness remain domain-specific checks, not fake automatic source freshness. The external TradingView widget has no local data-health guarantee.
- Legacy wire projections and absent-metadata normalization have the explicit removal path above. The prior Phase 0 reports and earlier feature reports describe their historical implementation, not the updated Phase 1 policy.
- Browser visual QA remains outstanding; rendering tests and the production build are complete.

## L. Phase 2 readiness

This is sufficient groundwork to begin designing revision tracking and deterministic change sets: accepted content identities, observation/vintage distinction, prior-coverage references, rule reasons and release-bound evaluation provenance are now available. A small future signal registry can consume named datasets plus explicit eligibility without inventing source status.

It is **not** a historical version store or signal engine. Latest-cache retention, unknown legacy identities, no raw-file archive and ambiguous within-month official revision chronology still constrain full historical reconstruction. Phase 2 should establish retention/version persistence and reviewed USDA baseline transitions before promising audit-complete backtests. No Phase 2 infrastructure, scoring system, new indicator, provider, queue, database or service was implemented.
