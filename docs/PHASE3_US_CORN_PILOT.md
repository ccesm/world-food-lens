# Phase 3 — US Corn × Corn Belt pilot

Completed locally on 2026-10-04 America/Los_Angeles (2026-10-05 UTC).
Base branch: `main`; base commit: `6625cdb8108fbcc7ffb6a003baae7c392ee90d51`.
Phase 0–2 changes already existed in the working tree and were preserved. No commit,
push, deployment, real email, database migration or new notification rule was performed.
This document describes Phase 3 changes, not the entire accumulated working-tree diff.

## A. Pilot architecture

```text
NASS annual state production / US production
                 ↓
Regional estimated calendar + independently reported cumulative NASS progress
                 ↓
NASA POWER point weather + matching-calendar 1991–2020 baseline
                 ↓
State-production shares associated with screened points
                 │  compare independent evidence, NOT a causal arrow
                 ├── NASS weekly crop condition / progress
                 └── Phase 2 USDA supply revisions
```

The existing Python canonical metadata contract, JavaScript Central Data Health,
Phase 2 checkpoints/change sets, release binding and notification safety are reused.
No parallel health, revision or release system was added.

New input records reside under `official-data.json.cornPilot`, outside the legacy
macro `sources`. The deterministic output is `monitor-alerts.json.analysis.cornPilot`.
It contains crop/country, a common seven-day period, ten region records, stage
evidence, national production weights, raw weather, anomalies, screens, coverage,
official condition, supply references/revisions, exact accepted input versions,
eligibility, method version and the parent release ID. Changes and signals remain
inside the existing Phase 2 analysis and journal.

The existing broad crop calendars, a single old Iowa point and short weather
history were insufficient for this pilot's ten-state production context and
30-year anomaly baseline. Their behavior was not replaced. SourceDesk's existing
central-health disclosure can show the new records without a new source dashboard.

## B. Sources actually used

| Layer | Public authoritative source | Locally accepted evidence |
| --- | --- | --- |
| Production, harvested area, yield | [USDA NASS Crop Production Annual Summary, ESMIS archive](https://esmis.nal.usda.gov/publication/crop-production-annual-summary) | 2025 crop, report dated January 12, 2026; national total and ten state rows |
| Progress and condition | [USDA NASS Crop Progress, ESMIS archive](https://esmis.nal.usda.gov/publication/crop-progress) | [Week ending September 27, published September 28, 2026](https://esmis.nal.usda.gov/sites/default/release-files/796082/prog3926.txt), plus [September 20 comparator](https://esmis.nal.usda.gov/sites/default/release-files/796068/prog3826_0.txt) |
| Recent and historical weather | [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Ten fixed points, daily values through October 1, 2026; fixed 1991–2020 matched-calendar normals |
| Supply linkage | Existing [USDA FAS PSD](https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads) adapter and Phase 2 checkpoints | Integration tested, but current local legacy PSD cache lacks verified US contributor coverage; no current US supply claim is exposed |

[NASS progress definitions](https://www.nass.usda.gov/Publications/National_Crop_Progress/terms_definitions.php)
inform the separation of cumulative progress from stage occupancy.
[Iowa State Extension's heat/pollination discussion](https://crops.extension.iastate.edu/encyclopedia/corn-pollination-effect-high-temperature-and-stress)
is supporting agronomic context, not validation of this application's thresholds.

Adapters discover official plain-text report links instead of requiring a Quick
Stats API key. They validate columns, years, units, states, percentages and report
dates. Revised filenames such as `prog3826_0.txt` are supported. Format changes fail
closed and retain the previous accepted data. A report date is preserved as a date;
an unavailable exact publication timestamp is not invented.

## C. Production geography and weights

“Corn Belt” here means this explicitly selected ten-state major-production pilot,
not a formal boundary, arbitrary rectangle, county polygon or whole-US coverage:
Iowa, Illinois, Nebraska, Minnesota, Indiana, South Dakota, Kansas, Ohio, Missouri
and Wisconsin. Adjacent major producers are included. One editorially selected
representative point per state is defined in `src/data/cornPilot.json`; these are
not measured production centroids or acreage-weighted weather samples.

State production shares were chosen over acreage shares because they express
national output importance directly. County data and crop-area-weighted grids
would improve spatial attribution but require an additional maintained spatial
dataset and sampling design. State data are the maintainable first step.

For state s: `weight(s) = NASS state grain production / NASS US grain production`.
The 2025 national denominator is 17,020,549 thousand bushels. The ten states sum to
81.1611893365%; 18.8388106635% remains explicitly outside the pilot. The sum is not
normalized to 100%. All ten production rows must validate to establish these
weights; missing weather reduces assessed coverage, never changes the denominator.
Harvested area and yield are retained independently with their original units.

Weights describe the latest completed crop year, not an estimate of the current
year's production distribution. Annual source revisions are versioned facts.

## D. Crop-stage model

Three explicit approximate calendars (southern, central, northern) map dates to
off season, planting, emergence, vegetative growth, silking/pollination, grain
fill, maturity and harvest. They are WFL editorial templates, not official stage
dates, growing-degree-day models or observations of every field.

NASS reports planted, emerged, silking, dough, dented, mature and harvested as
cumulative percentages when available. Missing metrics remain missing, not zero.
The UI displays official percentages and the furthest milestone reached by at
least half alongside, rather than replacing, the calendar estimate. A percentage
that has reached silking is not a percentage currently pollinating.

Only recent official observations ending no later than the weather window may
qualify stage relevance. Explicit 0% silking constrains days up to that observation;
100% maturity/harvest constrains days from that observation forward. Maturity is
not backcast onto earlier hot days. Mixed silking/maturity bounds provide direct
evidence only on the report day; other days retain the labeled calendar estimate.
Winter waiting never applies last season's progress to a new growing season.

## E. Weather exposure: method and baseline

The release uses one seven-day UTC window ending four days before its evaluation
date. The adapter downloads fourteen recent days, but every state is evaluated
over the same seven days. Stale, missing, discontinuous, wrong-location or invalid
observations cannot supply a valid exposure calculation.

NASA POWER provides gridded estimates, not field station measurements:

- Daily maximum temperature supports mean-maximum anomaly and heat-day counts.
- Daily precipitation supports a seven-day total and departure from normal.
- Root-zone wetness supports a seven-day mean and departure from normal. It is
  a modeled 0–1 index, not measured soil volumetric water content or a crop-specific
  soil-water stress threshold.
- Minimum temperature is preserved for audit/context, not used in a new frost or
  nighttime-damage rule. Surface wetness arrives through the reused adapter but
  does not create another pilot signal.

One-time baseline downloads start December 26, 1990 to supply complete early-1991
windows. For each calendar ending date, the baseline contains thirty equally
weighted seven-day samples from 1991–2020 at the same point. Stored statistics are
mean maximum temperature, mean rainfall total, mean root wetness, and the rainfall
and root-wetness 20th percentiles (linear interpolation). Current-minus-normal
anomalies retain original units; no unsupported crop-loss probabilities are made.
February 29 has no thirty-sample matched baseline and is explicitly unavailable.

Heat screening requires at least three days ≥35°C during calendar/qualified
silking or grain-fill days. The temperature is a screening heuristic: humidity,
water availability, varieties, irrigation and duration affect outcomes. It is
not a validated damage or yield-loss threshold. Moisture screening requires all
seven days to be stage-relevant, with BOTH rainfall and root wetness below their
respective historical 20th percentiles. The conditions are correlated and are
not treated as independent probabilities. No flood, excess-rain, frost, wind or
planting-delay classifier was added.

Baseline metadata participates in Central Data Health but a fixed climatology
does not become stale merely because it was not downloaded yesterday. Ordinary
daily runs reuse it. A missing baseline disables the affected exposure calculation.

## F. What weighted exposure means

For each screen separately, sum national production weights of eligible states
whose representative points meet that screen. A state is counted once per screen.
Heat and moisture shares must not be added together because they can overlap.

This is **national production share associated with screened points**. It is NOT
the fraction of fields exposed, affected acreage, damaged production, expected
yield loss or an estimate of economic impact. One point cannot establish a
state-wide condition. Assessable share, missing pilot share and outside-pilot
share are displayed separately. When no region can be evaluated the result is
`null`/unavailable, not zero. A valid zero means only that these screens did not
trigger, not that there is no agricultural risk.

Local snapshot: September 25–October 1, 2026; 81.16% assessable production context,
18.84% outside the pilot; neither screen triggered. This is a dated local sample,
not a claim about later weather or the public site's deployed state.

## G. Official crop evidence and health

The weekly adapter preserves five condition categories, seven possible progress
metrics, observation week, publication date, original URL, source-text hash,
canonical content identity and up to twelve accepted weekly reports. Good plus
excellent is compared only with the immediately preceding seven-day report;
missing comparators do not become zero. Changes are percentage points, not
percentage changes and not yield loss.

The accepted September 27 versus September 20 condition differences are:
IA −1, IL +3, NE +2, MN 0, IN 0, SD +2, KS −1, OH −3, MO 0, WI −2 percentage
points. They are independent official condition facts, not confirmation that a
particular weather screen caused a change.

Twenty-two new health records share Phase 1: two NASS datasets, ten weather points
and ten fixed baselines. Retrieval failure, validation failure, stale observations,
publication waiting and insufficient calculation evidence remain distinct.
Source failures or regressing publication/observation dates retain the previous
accepted data and original accepted timestamps; a fresh attempt cannot rehabilitate
older evidence. Same-period corrections remain possible and content-versioned.

## H. Phase 2 supply and revision linkage

NASS annual observations use geography × crop/metric × crop year, retaining
publication vintage separately. Weekly observations use geography × progress or
condition metric × week. A new week is a new observation, not a correction of the
previous week's crop. Re-downloads without meaningful changes do not create new
facts. Twelve-week history rolloff is not a structural coverage failure.

US maize production and ending-stock revisions reuse the exact Phase 2 change
IDs, previous/current versions and original PSD units. Both prior and current
PSD checkpoints must have verified coverage. The selected contributor must be
the US; global totals are never mislabeled as US supply. NASS same-year national
production, yield and harvested-area corrections likewise reuse Phase 2 revision
facts. Completed-year NASS references are labeled **not this season's forecast**.

Current local PSD cache has no qualifying US coverage evidence, so the panel is
explicitly unavailable for current US PSD facts. Integration and correction cases
are tested; a real paired PSD vintage is not invented. Reports can sit beside
weather evidence, but the code does not assert causation or attribute a revision
to earlier weather. Routine daily weather is not copied into the global official
observation change set; only selected informational screens summarize exposure.

## I. Minimal informational signals

| Rule ID | Evidence type | Meaning |
| --- | --- | --- |
| `corn/heat-exposure` | `weather_exposure` | Stage-qualified point heat screen and associated state shares |
| `corn/moisture-exposure` | `weather_exposure` | Joint low-rain/low-root-wetness screen and associated state shares |
| `corn/condition-change` | `official_crop_condition` | Adjacent-week official good/excellent change, positive or negative |
| `corn/supply-revision` | `supply_revision` | Comparable US PSD or national NASS revision from Phase 2 |

All four have `notification: false` and `severity: null`. Weather rules are
explicitly uncalibrated heuristics. Official changes are factual, not colored
warnings. Seven nonzero weekly condition changes appear in the local snapshot;
unchanged condition does not generate a change signal. Existing email source-health
projection is restricted to its existing point registry so pilot additions cannot
create new source-health email transitions. The delivery ledger is unchanged.

## J. Frontend journey

Within the existing crop-window section, the user opens “美国玉米 · 玉米带试点” /
“US Corn · Corn Belt pilot”:

1. Read the common weather dates, weight year and assessed/uncovered shares.
2. See the two separate screen shares and the point-versus-state limitation.
3. Expand the ten-state horizontally scrollable evidence table: location and
   weight → estimated calendar and official progress → raw/anomalous weather →
   official good/excellent comparison.
4. Inspect independent supply revisions or the explicit missing-evidence message.
5. Expand sources/method and each state's raw days and exact input versions.

Both languages state the same evidence boundaries. The pilot uses an independent
release window; existing historical-month controls below it do not alter it.
The interface uses existing styling and navigation. The baseline payload is
excluded from the existing macro cache's embedded JavaScript; it remains in the
release-bound JSON. Chinese and English were checked in the local production
preview; bilingual render assertions also pass. No full mobile-device matrix or
formal accessibility audit is claimed.

## K. Exact Phase 3 file paths

Paths below are relative to the repository root
`/Users/chrischeng/Documents/Codex/2026-09-11/world-food-crisis`.

New Phase 3 files:

- `docs/PHASE3_US_CORN_PILOT.md`
- `scripts/refresh_corn.py`
- `scripts/corn_pilot.mjs`
- `src/data/cornPilot.json`
- `src/services/cornData.js`
- `src/services/cornExposure.js`
- `src/components/USCornPilot.jsx`
- `tests/corn_fixtures.py`
- `tests/test_refresh_corn.py`
- `tests/cornPilot.test.js`
- `tests/fixtures/corn-historical-weather.json`

Existing or Phase 1–2 working-tree files extended for Phase 3:

- `.github/workflows/deploy-pages.yml` — narrow refresh and failure-report step;
  existing deployment and notification permissions/order preserved.
- `src/data/dataContract.json` — NASS production/progress and point-baseline specs.
- `src/services/freshness.js` — annual, weekly and fixed-baseline cadence.
- `src/services/dataHealth.js` — official observation-period and baseline handling.
- `src/services/centralDataHealth.js` — pilot datasets and semantic validation.
- `src/services/automaticAlerts.js` — isolate the existing notification health scope.
- `src/services/changeSet.js` — new official checkpoint keys and artifact/signal validation.
- `scripts/revision_tracking.mjs` — new official projections and pilot assembly.
- `scripts/signal_registry.mjs` — separately exported crop informational registry.
- `scripts/evaluate_alerts.mjs` — qualify pilot calculation eligibility in the shared snapshot.
- `src/components/CropCriticalWindow.jsx` — mount focused pilot view.
- `vite.config.js` — exclude pilot baselines from the embedded legacy macro payload.
- `public/data/official-data.json` — add the real pilot cache; existing macro contents unchanged.
- `public/data/monitor-alerts.json` — regenerate local release-bound analysis, preserving event history.
- `public/data/release-manifest.json` — matching locally generated snapshot manifest.

Other dirty files shown by Git belong to the preceding phases and were not new
Phase 3 scope. Local generated artifacts reference the current base commit while
code remains uncommitted; they are preview/test artifacts, not a published immutable
production release. A later authorized publication must build its own bound release.

## L. Tests and verification

Phase 3 adds **27 JavaScript + 13 Python = 40 tests**. Full relevant suites finish
at **164 JavaScript + 121 Python = 285 passing tests**, zero failures. Existing
tests were not removed or weakened. `npm run build` succeeds; the existing large
bundle warning remains (main JS 1,069.78 kB, gzip 315.42 kB). `git diff --check`
passes. No SMTP or deployment command was run.

Coverage includes authoritative parsing, units/columns/state completeness,
publication rollback retention, same-period corrections, wrong POWER geometry,
weather-period regression, matched-calendar baseline integrity, national weights,
missing/partial coverage, regional calendar boundaries, official qualifications,
no maturity backcasting, stage-specific heat, joint moisture logic, stale/missing
weather, no all-missing safe zero, leap-day unavailability, condition direction and
missing comparator, supply-version/coverage integration, deterministic/non-mutating
artifacts, release and provenance validation, quarantine, bilingual rendering and
isolation from existing notification health.

Real NASA seven-day Iowa samples are saved with request URLs, raw-response hashes
and retrieved values. These tests do not contact the network:

| Window ending | Raw context and calendar | Screen result |
| --- | --- | --- |
| 2012-07-22 | Estimated silking; 6 days ≥35°C, maximum 40.71°C; 0.43 mm rain; mean-maximum anomaly about +7.39°C | Heat and joint moisture screens trigger |
| 2019-06-09 | Estimated vegetative stage; 0 heat days; root wetness anomaly about +0.121 | Neither reproductive-stage screen triggers; NOT a flood/planting-delay detector |
| 2021-07-21 | Estimated silking; 0 heat days; mean-maximum anomaly about +0.036°C | Neither screen triggers; NOT a claim the entire season was normal |

These are limited architecture checks, not whole-season validation or a backtest.
The fixed 1991–2020 baseline is retrospective and includes years unavailable in
2012/2019. Historical as-of crop-condition and subsequent supply vintages have not
been paired with these windows. Thus the implementation verifies weather/stage
processing but makes no historical prediction-skill, official-confirmation or
weather-to-yield attribution claim. Thresholds were not fitted to these examples.

Additional local verification: real NASS and NASA collection succeeded; all ten
baselines have 365 matching-calendar windows and thirty samples each. A deep
comparison excluding `cornPilot` confirms existing `official-data.json` contents
still match the base commit; `alert-delivery.json` has no diff.

## M. Remaining limitations and operations

- One unweighted grid point per large state is the main limitation. Production
  weighting improves importance context, not weather spatial representativeness.
- Calendar stages are approximate and cannot locate individual fields. Reported
  cumulative progress does not provide continuous stage occupancy.
- Prior-year production shares may differ from this year's acreage and yields;
  changes in irrigation, soils, hybrids and management are not modeled.
- POWER is a gridded model/data product. Root wetness is not direct crop stress.
  Screens are uncalibrated, lack crop-damage verification and omit important hazards.
- Weekly reports can omit seasonal metrics. The parser requires all ten rows
  for each included table; changed official layouts stop interpretation until
  reviewed, preserving previous accepted values.
- Publication precision is a day where the official report supplies only a date.
  A retained report is not made current by its fetch clock.
- The baseline has no February 29 result. Baseline provider revisions require
  deliberate rebuild/review; routine daily refresh intentionally does not repeat
  ten thirty-year downloads.
- The command's summary counts failed records that exist; if a baseline record
  has never been bootstrapped, Central Data Health still marks it unavailable,
  but it is not included in that CLI failed-record count. Operators must check
  dataset health/coverage, not interpret command exit zero as full coverage.
- Only twelve weekly reports are retained in the source cache, with Phase 2's
  existing bounded journal; this is not a complete historical vintage archive.
- Current US PSD coverage is unavailable in the local legacy snapshot. No current
  forecast or live revision example is fabricated to fill this gap.
- Historical samples lack paired as-of progress/condition and USDA vintages;
  formal backtesting and causal yield inference remain absent.

Operations: `python3 scripts/refresh_corn.py --bootstrap-baselines` initializes
missing baselines once; ordinary `python3 scripts/refresh_corn.py` refreshes NASS
and recent weather only, preserving accepted records on failure. Then
`npm run evaluate-alerts` builds the shared artifact without sending mail.
The existing workflow has the refresh step before evaluation but has not been run
or deployed for this phase. Do not delete good baselines merely to force a refresh.

## N. Ranked next directions and infrastructure assessment

1. **Improve US corn spatial resolution.** Validate multiple crop-area-weighted
   points per state or a county/grid crosswalk before making stronger exposure claims.
2. **Historical backtesting.** First acquire as-of NASS progress/condition and USDA
   vintages, then evaluate withheld seasons and baseline availability without
   hindsight; keep causal claims separate.
3. **Deterministic weekly research brief.** Reuse accepted changes and provenance;
   useful synthesis without adding a new inference model or automatic email rule.
4. **Trade dependency.** Add maintained crop-specific exporter/importer context
   once exposure quality is established; do not equate national output with exports.
5. **Logistics.** Connect measurable bottlenecks to those trade routes, with dated
   source evidence rather than generic geopolitical labels.
6. **Policy lifecycle.** Track proposal, announcement, effective date, modification
   and expiry against authoritative policy records.
7. **Brazil soybean pilot.** Reuse proven interfaces only after resolving subnational
   production, local crop progress, calendar and observation-source differences.
8. **Black Sea wheat pilot.** Important but higher geographic, war-related reporting
   and winter-crop evidence uncertainty; avoid scaling the current point limitations.

None of these next directions is implemented here.

**Git + JSON + GitHub Actions remains sufficient for this bounded pilot.** The
official cache is approximately 1.46 MB and the evaluated monitor approximately
0.50 MB locally. Baselines are compact derived statistics, not thirty years of raw
daily values in the frontend bundle. Normal refresh adds ten recent point requests
plus a small number of NASS requests; expensive baseline initialization is explicit.
Weekly history and the existing change journal remain bounded. Production build
and complete tests pass, and no database scaling limit was demonstrated.

The existing >500 kB JavaScript warning is a frontend bundling concern, not evidence
that a database is required. If later county/grid coverage or unbounded vintage
history causes measured runtime, repository-size, concurrency or query problems,
evaluate object storage/archive separation and then a database using those measured
requirements. No speculative infrastructure migration is justified by this pilot.
