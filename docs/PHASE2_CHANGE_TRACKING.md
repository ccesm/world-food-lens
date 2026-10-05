# Phase 2 — Revision Tracking, Deterministic Change Sets, Minimal Signal Registry

Local implementation on `main`, following the uncommitted Phase 0 batches and Phase 1. Starting HEAD: `6625cdb8108fbcc7ffb6a003baae7c392ee90d51`. Earlier work is preserved. No provider fetch, real email, deployment, commit, push, or `public/data` rewrite was performed. This is implemented code, not a claim that production already has revision history.

## A. Previous architecture and inspection

Reviewed project context, migration notes, README, structure/status/history, Phase 0/1 reports, metadata/health/release/provenance code, source adapters, derived calculations, caches and tests.

Previously, Python retained the last accepted source data, USDA separated marketing year from publication month and fingerprinted corrections, and contributor checks quarantined incomplete aggregates. Metadata hashed accepted content rather than fetch clocks. Alert reconciliation recognized new/escalated/resolved/verification-lost episodes. Releases bound current input bytes, previous alert state, source code and evaluation time. There was no persistent field-level comparison layer or revision journal. SourceDesk and existing calculations remain unchanged in this phase.

| Dataset | Reliable comparison available | Phase 2 scope / limitation |
| --- | --- | --- |
| USDA PSD | Marketing year, monthly publication vintage, quantities, contributor identities after canonical ingestion | All collected global and ex-China marketing-year history; individual contributors for latest two marketing years. Same-month content corrections identifiable, but their official within-month ordering is not proven. |
| FAO FFPI | Monthly index observations and accepted content hashes | Latest 24 observations; no fabricated publication timestamp/vintage. Old observations can be revised in the same download as a new month. |
| World Bank | Monthly named commodity series with adapter-validated units | Latest 24 observations of already collected commodities; no new sources. |
| ENSO | Advisory issue date, exact forecast season start, numeric probability table, original strength extraction evidence | Advisory issue date is the vintage; same forecast season is compared across issues. Prose is archived as evidence, not reinterpreted into a probability. |
| Weather/soil/GDO | Daily sampled values and source-specific health | Health changes only here. Rolling weather windows are not promoted to regional exposure/revision signals; GDO verification restrictions remain. |
| EIA/RONI/editorial | Existing accepted cache / contextual records | Health diagnostics retained. No redundant EIA price registry or invented editorial publication versions. |

Existing stock/use and monthly-price arithmetic was inspected. Stock/use changes are tracked as derived facts (`stock-to-use/v1`); existing food-stress aggregation and forecast model are not expanded or re-versioned by this task.

## B. Revision model

Identity is separate from a source version. A logical observation is `(commodity, geography, period)` with a named field. USDA periods are marketing years; monthly benchmarks are calendar months; ENSO forecast periods are three-month windows identified by start month. Geography uses provider contributor IDs rather than changing display names.

| Type/status | Meaning |
| --- | --- |
| `baseline` | First accepted checkpoint. This is not a new historical observation or inferred revision. |
| `no-change` | No changes within the declared tracked projection and no known full-content hash change. A new successful fetch timestamp alone does not count. Legacy full hashes remain unknown. |
| `new-observation` | A new period beyond that same commodity/geography series' previous horizon. A new country/metric is not mistaken for a new month. |
| `new-publication-vintage` | USDA publication month or ENSO advisory issue date changes, even if comparable values do not. Emitted separately from individual numerical revisions. |
| `revision` | An existing logical observation/field changes with comparable structure. May accompany a new publication vintage or occur in the same vintage. |
| `structural-change` | Units, aggregation basis, contributor composition, geography/field membership, or in-scope observations change. No comparable delta, percentage, or analytical eligibility is asserted for the affected structural items. |
| `health-only` | Retrieval/validation/freshness/cache-retention/analysis usability changes independently of data facts. Routine attempt clock changes and `new` → `unchanged` cache labels alone do not generate events. |
| `outside-tracked-scope` | The full canonical source content hash changed but the retained analytical projection did not. The system does not claim the entire source was identical or invent which untracked field changed. |
| `retained` | Incoming data are absent, invalid, regressed or quarantined. Keep the preceding checkpoint and report unavailable evidence. |

Negative/positive deltas are arithmetic directions, not bearish/bullish labels. Percentage change is `(new − old) / abs(old) × 100`; zero denominators produce `null`. Stock/use has an absolute percentage-point delta and a separate relative percentage delta. JavaScript floating-point results are retained for replay, rounded only for display.

Known rolling-scope expiration is not structural loss: monthly observations older than 24 calendar months, USDA contributor detail older than the two-year window, and ENSO expired forecast seasons/advisories leave their declared scope. Missing in-scope observations remain structural changes. Global USDA history is not silently discarded.

Older publication vintages or analytical periods cannot replace a checkpoint; future publication dates and open/future monthly benchmark periods are refused. Canonical USDA coverage failure also prevents checkpoint advancement. The existing Python collector remains responsible for source-level coverage validation and retention; Phase 2 does not introduce an override or a competing coverage policy.

## C. Historical storage

All new output is additive under `monitor-alerts.json.analysis`. This choice reuses the existing exact snapshot checksum, prior-alert input hash, atomic monitor write, generated-file allowlist and immutable release verification. No second independently published history file can drift from the alert release.

Retained material:

- One latest accepted compact projection per supported dataset, independent of the latest failed attempt.
- Original canonical content/revision hashes when supplied; a deterministic SHA-256 projection hash for the selected fields even for legacy data. A projection hash is not mislabelled an original provider hash.
- Field-level before/after deltas and version references for changed releases; original ENSO strength evidence when it changes.
- Current signal evaluations, plus changed signal results in a bounded journal. Unchanged active screens are not journaled again merely because the evaluation time changed.
- Central health comparisons and unavailable-evidence snapshots.

The journal retains at most 90 days, 128 releases and approximately 2,000,000 compact UTF-8 JSON bytes. Oldest complete entries are removed first. The latest entry is always complete even if one exceptional correction exceeds the byte budget. `prunedThrough` is explicit. The weekly view is marked incomplete if startup or pruning removes any part of its seven-day history. These are published-journal limits, not deletion of historical Git commits.

Latest projections serve as rolling checkpoints. An earlier retained changed observation is auditable from its old/new delta and version references; complete historical source reconstruction uses the immutable Git data commit. Do not promise reconstruction from a pruned current feed alone. No raw response archive or unverifiable pre-migration history is synthesized.

Offline measurement against the checked-in caches at an explicit October 4 evaluation clock: approximately **112 KB compact / 185 KB formatted** for the initial analysis section, with 162 USDA rows, 216 World Bank rows and 10 ENSO rows; FAO's unsuccessful record was retained/unavailable, not silently promoted. This is a measurement of legacy-cache initialization, not a new provider download or a production size guarantee. Canonical contributor detail will increase size. With hundreds of contributors, allow roughly 0.5–1.5 MB for checkpoints plus the 2 MB compact journal budget and formatted-JSON overhead; measure actual canonical output before changing these limits.

Growth is bounded for the current published file, not for Git history. At 1–5 MB of formatted analysis per daily release, naive uncompressed yearly snapshots total roughly 0.37–1.83 GB; Git delta compression may reduce that substantially but is not assumed in a capacity promise. Existing weather files already dominate much of repository churn. Operational review points: measure packed Git growth/clone time, Actions time and browser feed transfer; reassess if routinely above a few MB per feed, hundreds of MB of packed history per year, much higher cadence, or multiple concurrent writers. These are planning triggers, not GitHub service limits. No database or object storage is presently required by measured evidence.

## D. Deterministic change set

```text
monitor-alerts.analysis
  schemaVersion / releaseId / evaluatedAt / integrity
  checkpoints[datasetId]   accepted projection + version
  health[datasetId]        comparison of central health dimensions
  changeSet
    datasets[]            baseline / changed / no-change / retained / outside-tracked-scope
    changes[]             facts, structural items, health-only items
    unavailable[]         dataset + reason codes
  signals[]               all current registered evaluations
  journal[]               release-scoped changes + changed signals + unavailable evidence
  weekly                  seven-day grouped references into journal
```

Example (illustrative values; hashes abbreviated here only):

```json
{
  "id": "change-<sha256>",
  "datasetId": "usda",
  "type": "revision",
  "observation": {
    "id": "wheat|world|2026/2027", "commodity": "wheat",
    "geography": "world", "period": "2026/2027"
  },
  "field": "endingStocks",
  "previous": 30000, "current": 29700,
  "absoluteDelta": -300, "percentDelta": -1, "direction": "down",
  "method": "source-value/v1", "unit": "1000 metric tons; ratio: %",
  "previousVersion": {"datasetId":"usda", "period":"2026/2027", "vintage":"2026-08",
    "projectionHash":"<sha256>", "contentHash":"<sha256>", "revisionId":"<sha256>"},
  "currentVersion": {"datasetId":"usda", "period":"2026/2027", "vintage":"2026-09",
    "projectionHash":"<sha256>", "contentHash":"<sha256>", "revisionId":"<sha256>"},
  "eligible": true, "reasons": [], "releaseId": "release-<sha256>"
}
```

A separate vintage item records August → September. A same-vintage correction keeps September in both version references but changes hashes and values. A failed refresh records health/unavailable evidence and leaves the accepted checkpoint untouched. Stock/use changes carry `stock-to-use/v1` and `%` rather than masquerading as an independent provider observation.

Health entries carry previous/current health dimensions rather than invented market observations. Their dataset IDs and enclosing release link to the full central health metadata snapshot. Baseline, structural and health changes do not trigger revision signals.

## E. Minimal signal registry

`scripts/signal_registry.mjs` contains two factual USDA rule definitions and six existing market-screen definitions. Each names an ID, version, required dataset, eligibility policy, method, bilingual name, threshold classification and notification policy. Two explicit calculation paths implement those definitions; there is no DSL, plugin interface, database or generic risk engine.

Existing market thresholds moved verbatim into `src/services/marketRules.js`; both consumers use the same definitions. `priceEvidence` is exported without changing its validation/calculation. Signal output projects the existing alert evaluator's lifecycle; it does not call another reconciliation state machine.

Raw changes remain independently useful even when no signal is eligible. The notification consumer continues to read existing alert transitions, not `analysis.signals`.

## F. Implemented signals and rationale

| Signal | Rationale / eligibility | Threshold status / false positives |
| --- | --- | --- |
| Global production estimate revision | Direct change in an already published commodity estimate for the latest marketing year. Requires current validated source, comparable world observation, stable coverage/unit and previous/current verified contributor assessments. | Every nonzero comparable revision is a **factual observation**, no severity and no email. Small numerical corrections can be economically immaterial; no materiality claim. |
| Global ending-stock estimate revision | Documents revisions to the accounting buffer, not export availability or a price forecast. Same evidence/coverage requirements. | Factual, no warning threshold, no severity, no email. Consumption revisions, accounting changes and reporting corrections can alter meaning. |
| FAO monthly increase | Reuses source/units/headline/adjacent complete-month checks and existing 5% yellow / 10% red screening. | Explicit **WFL heuristic**, not statistically validated. Monthly volatility/base effects are not proof of a supply crisis. Existing alerts only. |
| Brent, urea, DAP, TSP, potash monthly increases | Existing cost-pressure screen: validated named benchmark and complete-month comparison. | Existing 10% yellow / 20% red **heuristic**. Currency, benchmark/geography differences and pass-through can weaken agricultural relevance. Existing alerts only. |

USDA new factual signals are stricter than legacy display compatibility: unknown contributor coverage cannot establish them. Tiny revisions remain raw facts with no invented severity. New observations or structural changes are not relabelled revisions. Historical-year revisions remain explicitly dated raw changes; only the latest marketing year produces these two factual signal types, avoiding a flood of signals for old accounting corrections.

No new stock/use threshold crossing, repeated-direction warning, FAO acceleration, ENSO danger classification or weather impact signal is introduced: there is not yet a validated threshold/history policy for those claims. Imports, exports, harvested area and yield are not currently collected by this adapter, so they are not fabricated or newly fetched.

## G. Provenance and replay

Every eligible signal records rule ID/version, method/threshold, release ID, evaluation time, calculation inputs/results, eligibility/reasons and dataset versions. USDA signals reference both previous/current accepted versions and the exact change ID/observation. Market screens preserve adjacent monthly values and source period. Ineligible market evaluations can have no version if no checkpoint exists; they cannot masquerade as emitted eligible signals.

Projection hashes use recursively key-sorted compact JavaScript JSON, SHA-256. They deliberately have a different field name from Python's accepted-source hash. `analysis.integrity` checks the whole deterministic analysis body before it is reused. It detects corruption, not authenticity; release/Git checks remain the authority. Malformed optional analysis fails feed validation, rather than silently resetting the history. Legacy feeds with no analysis remain supported.

Replay the source revision named in the release, the four current caches, preceding monitor/ledger from that release's parent, static source inputs, and the recorded `evaluatedAt`. Run the existing evaluation generator in a temporary data directory with explicit `--now` and `--source-revision`. Do not use today's live API responses or overwrite production caches to replay. Same release inputs, previous state and rule implementation produce identical output. Existing `inputsHash` already includes the previous monitor containing the history, and the manifest's `snapshotSha256` includes the new analysis. Release-ID construction and notification monotonicity are unchanged.

Full original caches and rule code are needed for full eligibility replay; the small signal calculation record alone is not advertised as a complete raw-source archive. A repeated same-vintage correction's content identity is reproducible; official chronological ordering within a publication month remains a source limitation.

## H. Lifecycle

Existing alert reconciliation remains the only persistent warning lifecycle:

- Below threshold → `inactive`.
- New alert → `active`.
- Yellow → red event → `escalated` for that release, then continuing `active`.
- Red → yellow retains the working alert and records `de-escalated` as a signal transition, without a new email policy.
- Fresh, eligible below-threshold evidence → `resolved`.
- Evidence loss → `unverified`; no fresh calculation/severity, no false all-clear.
- Restored eligible evidence uses the existing reconfirmation event.

Events are identified by newly added event IDs, not only timestamps, so multiple evaluations at the same explicit test clock do not reuse an older escalation event. Continuing identical signals are not weekly “new” signals merely because input fetch clocks changed.

USDA revision facts are release-scoped `observed` or `unverified`, not persistent hazards. An observed correction remains in the journal; its absence tomorrow is **not** called a resolved crop risk. No duplicate lifecycle engine was added.

## I. Weekly deterministic summary and UI

`changeSet` is this release's structured summary. `weekly` groups the interval `(evaluatedAt − 7 days, evaluatedAt]`:

```json
{
  "start":"2026-09-27T12:00:00.000Z", "end":"2026-10-04T12:00:00.000Z",
  "complete":false,
  "releases":["release-<sha256>"],
  "newObservations":["change-<sha256>"],
  "officialRevisions":["change-<sha256>"],
  "publications":[], "structuralChanges":[],
  "signals":[{"releaseId":"release-<sha256>","id":"usda-endingStocks-revision/wheat|world|2026/2027","state":"observed"}],
  "healthChanges":[],
  "unavailableEvidence":[{"releaseId":"release-<sha256>","datasetId":"drought","reasons":["period_unverified"]}]
}
```

References resolve to the retained journal, not external APIs. Counts are changed **fields**, not countries, publications, or unique hazard episodes. The deterministic artifact can later feed research, but contains no LLM narrative.

The existing alert center gets one collapsed bilingual “Latest data changes” section: six facts, six current factual/active screen results, compact seven-day counts and a separate source-health/evidence section. It states coverage, startup/pruning, historical-feed status, factual versus heuristic status, and release identity. Full machine-readable details remain in the feed. No navigation/home redesign, theme changes, new notification channel or new scoring UI.

## J. Exact Phase 2 files

Paths are relative to `/Users/chrischeng/Documents/Codex/2026-09-11/world-food-crisis/`. Earlier Phase 0/1 changes outside this list were preserved, not rewritten by this task.

New:

- `scripts/revision_tracking.mjs`
- `scripts/signal_registry.mjs`
- `src/services/marketRules.js`
- `src/services/changeSet.js`
- `src/components/LatestChanges.jsx`
- `tests/revisionTracking.test.js`
- `tests/latestChanges.test.js`
- `tests/revision_fixtures.py`
- `docs/PHASE2_CHANGE_TRACKING.md`

Updated:

- `scripts/evaluate_alerts.mjs` — build analysis after existing release binding, before snapshot validation/write.
- `src/services/automaticAlerts.js` — optional analysis validation, shared unchanged market definitions, exported existing evidence helper.
- `src/services/alertFeed.js` — optional analysis wire validation, legacy compatibility.
- `src/components/AlertCenter.jsx` — mount the modest read-only section.
- `tests/releaseIdentity.test.js` — assert analysis and change-set release binding.
- `tests/test_release_pipeline.py` — assert real JS output survives existing Python immutable-release verification with analysis binding.
- `tests/test_alert_email.py` — facts are not notification candidates.

No package/dependency, source-provider, Python production adapter, workflow, release-pipeline production code, sender production code or public-cache changes in Phase 2.

## K. Tests and verification

New coverage: 25 revision/registry/storage/cross-language tests, one bilingual actual-JSX rendering test and one Python notification-separation test. Existing release tests gain identity assertions.

Tests cover: initialization; unchanged fetches; monthly observations; new vintages without value changes; same-vintage values and derived ratios; regression/coverage quarantine; actual Python canonical accepted hashes and failure reasons; units/composition/new-geography structure; zero-base and tiny revisions; multiple sources; failed/invalid/stale caches; independent health changes; factual/heuristic distinction; eligible/ineligible signals; crossing/no crossing and lifecycle; same-time event reuse; deterministic replay/no mutation; corrupt checkpoints/wire records; ENSO auditable unparsed evidence; 24-month scope; 90-day/128-release/byte pruning; partial weekly history; full-hash changes outside tracked scope; English/Chinese legacy/archive/health display.

Final verification: **137 JavaScript + 108 Python = 245 tests**, production build and whitespace check. All prior Phase 0/1 alert, SourceDesk, coverage, release and mocked SMTP tests are included. Existing large bundle warning remains; unrelated bundle splitting is not part of this task. JSX rendering is tested in memory; no browser visual QA or live cloud end-to-end test is claimed.

## L. Infrastructure assessment

Git + JSON + Actions remains adequate for this single-writer daily scope, with measured size review and explicit retention limits. The new data shares the established release boundary and does not create a separate operational service. Current checkout projections and journal entries do not replace long-term immutable Git input history. Production history starts after an authorized release actually runs this code; there is no invented pre-launch revision archive.

Review larger storage only when measured repository growth, transfer times, frequency, historical query requirements or multi-writer needs justify it. Do not treat retention here as permission to rewrite Git history. No PostgreSQL/Supabase, vector store, queue, object store or AI service was added.

## M. Phase 3 readiness (assessment only)

| Capability | Readiness / missing evidence |
| --- | --- |
| Production revision analysis | Ready for factual per-commodity/year comparison after canonical coverage baselines exist; economic significance/calibration and official same-month sequence still unresolved. |
| Crop × region exposure | Contributor IDs and crop calendars are useful inputs, but administrative geography mappings, crop-area weights and growth-stage observations still need reviewed evidence. National revisions are not local crop exposure. |
| Trade dependency | Not ready: this adapter does not collect imports/exports, bilateral flows or consistent trade-year identities. |
| Policy lifecycle | Existing editorial records remain; no automatic authoritative event identity, amendment/expiry verification or transition evidence yet. |
| Weather-region weighting | Not ready: sampled points do not establish affected hectares or production-weighted exposure; verified gridded coverage/crop weights are still missing. |

Phase 2 separates facts, rule results and optional existing alerts. It does not infer bullish/bearish prices, global crisis probability, regional yield loss, investment recommendations or a market regime. No Phase 3 work was implemented.
