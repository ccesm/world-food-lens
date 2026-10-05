# Phase 4B-1.10 — Production operational validation

Status: hosted validation in progress, 2026-10-05. This report will be finalized
from actual runner artifacts, not the Phase 1.9 Mac measurements.

## A. Workflow trace and safe execution scope

The actual production workflow, `.github/workflows/deploy-pages.yml`, is used,
not a separately reimplemented pipeline. A narrowly named validation branch
(`codex/phase4b1-10-operational-validation`) and optional `validation_only` input
exercise its build job. Branch validation cannot save data to main, deploy
Pages, access SMTP Secrets, or invoke the notification job.

Actual sequence: checkout with history → Node/Python setup → dependency install
and complete standard tests → existing macro, Level A weather, drought, ENSO
and corn-source refreshes (last-good retention) → optional geospatial runtime →
scientific annual key discovery/Actions restore → validate/restore/rebuild annual
crop grid → recent weather-cache restore → gridMET refresh and compact summaries
→ diagnostics → existing evaluator (Level C attached AFTER alerts) → complete
standard tests → validation-only numerical/reference and release/alert checks →
build → validation-only local bare-remote immutable release exercise → Pages
artifact upload. Production main then saves its generated-data release, deploys
and enters the unchanged notification path; all three are disabled in the safe
validation run.

The warm validation job runs on a separate hosted runner after the real build
finishes. It requires exact restoration of the accepted annual/weather caches,
reruns aggregation, executes controlled NE and full-module outages, verifies
each release and unchanged notifications, and replays frozen Mac inputs on Linux.
It performs no deployment, notification send or repository data write.

Initial hosted run:
[37383436313](https://github.com/ccesm/world-food-lens/actions/runs/37383436313),
source `fb49a7afaeb49af6f04bbcd81eee5459fbddb0b6`.
Main was independently updated by its existing scheduled data process; the
validation checkout incorporates that latest source-of-truth data without
resetting the user's primary dirty checkout or publishing to main.

## B. Annual-cache behavior and persistence

`ensure_corn_spatial.py` is shared by production and validation. The reviewed
index transitively binds crop class, state, source CDL year/byte hash, boundary
hash, weather coordinates, EPSG:5070 9 km grid and frozen spatial-method source
hashes. An approved package also conserves area, validates file checksums and
proves no duplicate class-1 pixels between states.

- Cold: missing cache → optional checksum-pinned archive restore → authoritative
  source preprocessing if restoration fails → accept ONLY the reviewed index.
- Warm: validated matching index and artifacts → reuse; no CDL reprocessing.
- Source/year/grid/method change: a different reviewed index changes the
  scientific key; an unreviewed candidate is unavailable, never silently current.
- Corruption: invalid entries cannot be reused. Restore or rebuild safely; if
  neither is acceptable, preserve explicit module unavailability and Level A.

Only approved derived grids are saved by `actions/cache/save`; invalid candidates
are not saved under an approved key. Immutable storage uses a scientific base
key plus a snapshot run suffix when regeneration is needed, allowing a repaired
snapshot without overwriting an immutable corrupt entry. Restore prefixes
contain the complete scientific identity, never a loose crop/year-only prefix.
The warm test requires the exact physical key selected by its build job.

The approximately 5.3 MB annual derived cache is NOT public frontend data and is
not committed. Raw annual TIFFs stay in runner temporary storage. Optional
release-asset recovery remains checksum-pinned, but routine successful cache
operation does not require a public release asset. Weather cache entries remain
individually identity/hash checked, with daily rechecks of preliminary data.

Actions caches are branch-scoped, and entries not accessed for over seven days
can be evicted. A validation-branch cache is not automatically available to main.
Thus main's first activation must rebuild or deliberately seed its own scope.
Cold regeneration must remain a tested path, not an assumption of permanent
cache retention. Diagnostic artifacts are retained 90 days, not permanently.
[GitHub cache scope and eviction](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

## C–E. Hosted performance, network and fault measurements

Pending completed hosted-runner artifacts. Local numbers are not substituted.
The cold source acquisition/preprocessing, warm restore, weather runtime,
memory/disk/cache sizes and actual per-state outage results will be recorded here.

Annual acquisition uses authoritative NASS/GMU state TIFFs, NASS state metadata,
Census state boundaries and gridMET coordinate templates. Weather uses bounded
gridMET THREDDS subsets and three retrieval attempts with socket timeouts.
No unofficial mirror or recalibrated crop mask is introduced.

NE failure uses the existing explicit validation-only outage flag, not corrupt
source data. Its verified mapped area remains in the full denominator while its
valid weather area is zero; coverage drops, not renormalized to ten states.
Full-module failure uses a separate deliberately absent annual cache. It must
produce unknown geography/coverage and explicit unavailable states, not zero
corn area or a normal weather classification.

## F–I. Fallback, alerts, releases and Data Health

Healthy current Level C is preferred only for informational spatial weather.
Valid current Level A can be selected as **Representative-point fallback / 代表点
回退**. Its original seven-day UTC window is not substituted into a 14-day
mapped-area aggregate. Both unavailable means unavailable. Stale or future
weather cannot be displayed as current Level C.

USDA statewide phenology, official condition and supply revisions remain
separate. Local stage is explicitly insufficient. No hazard, damage, yield or
production inference is added.

The real evaluator is run with/without Level C using identical accepted source
inputs, prior alert history, delivery ledger and assessment time. New release
IDs necessarily differ, but active/event decisions, legacy source health,
notification eligibility and rendered email body must be identical. These checks
never call SMTP. The existing mail implementation and threshold files are not
changed. Existing ledger/retry/checkpoint tests remain part of the complete suite.

Generated compact data/config bytes bind the normal release manifest and source
revision. The actual `save_data`/`verify_release` implementation is exercised only
against an owned temporary local bare repository; evaluated bytes must equal the
built Pages bytes. No independent release system or real main write is used.

Existing canonical Data Health evaluates crop geography, weather and spatial
intersection separately (30 state records plus the aggregate). Missing/corrupt
crop grids, source failure, incomplete coverage and stale weather retain the
existing reason-code architecture. Detailed filesystem diagnostics go to runner
logs, not public JSON. Proxy geometry remains an explicit reference vintage,
not a claim that this is current-year planted area.

## 2023 geography and newer-source policy

Every valid state output carries `cropGeographyYear`, a separate weather period,
`geographyUse` and `geographyReason`. Known geography retains that information
even when weather is unavailable. The UI says weather is over the identified
CDL map year and explains an older native-30m proxy; it does not say “2026 corn
area” for the 2023 map.

The policy selects the explicitly reviewed native-30m year/index, currently
2023. Newer native-10m CDL is available but NOT validated by this engine. It is
not automatically selected or silently resampled. The annual preparation and
cache guard reject unsupported 2024/2025 family selection. To adopt a new
validated geography, review its derived index/method and update the pinned
configuration; scientific keys and provenance then change together. Automatic
discovery is not permission to promote an unvalidated dataset.

## J–K. Size and cross-environment reproducibility

Raw rasters/grids/sparse matrices stay outside Git/Pages/JavaScript bundles.
The public artifact is inspected for cell arrays and internal filesystem paths.
The approximately 0.25 MB standalone summary is runtime/release data; the
frontend reads the release-bound copy through the existing alert feed, not a
bundled geospatial library. Exact final Pages/JSON and bundle sizes are pending
the hosted artifact inspection.

Fixed Mac annual/weather input bytes are held in an authenticated draft
validation archive, not a public frontend or production release. Checksums:

- Annual derived archive: `c4b589b61a1723fa12d768e94ff3b819947f077e7956bdc36c2c93fa017ea404`.
- Consumed weather archive: `c9e304510a92e519f8421a41d02e74e4abeb0fa93cec9e673189575140d133bc`.
- Reference analytical hash: `01a00c35cad7f9a7482267c788712f90e551368701d892d436840997da463771`.

Frozen-input replay forbids new network retrieval. The comparison checks actual
source identities, all five state/combined weather distributions, areas and
coverage. A 1e−10 weather-value tolerance handles numerical roundoff only; it is
not a new hazard/performance threshold. The new replay also tests the hosted
rebuilt annual grid against these same weather inputs. Volatile operational
timestamps/records are not included in the analytical hash.

## L–M. Scope and tests

Phase 1.10 changes relative to the preserved Phase 1.9 foundation:

- `.github/workflows/deploy-pages.yml`: safe mode, shared annual lifecycle,
  approved-only cache persistence, exact warm restoration and operational checks.
- `scripts/refresh_corn_spatial.py`: explicit proxy reasons and public-error
  redaction; no aggregation/hazard-method change.
- `src/services/cornSpatial.js`: reject future/mislabeled current-year geography.
- `src/components/CornSpatialWeather.jsx`: precise bilingual map-year wording.
- `tests/cornSpatial.test.js`: older/future geography label regression.
- Added `scripts/ensure_corn_spatial.py`, `validate_spatial_operation.py`,
  `validate_spatial_display.mjs`, `validate_spatial_scenarios.py`,
  `validate_spatial_replay.py`, `tests/test_corn_spatial_operations.py`, this report.

Local complete verification so far: **215 JS**, **157 standard Python**,
**12 production numerical**, **17 Iowa**, **30 ten-state** tests pass (216 Python
total). Build passes, preserving the existing large-chunk warning. Eight new
tests cover lifecycle/corruption/unapproved upgrades, cache identity, public
privacy, notification eligibility/body and geography labels. Actual generated
warm, NE outage and full absence scenarios additionally pass release and alert
isolation checks locally. Final hosted results and any refinements follow below.

## N–O. Operational risks and final decisions

Pending completion of the real hosted validation. No claim of production
readiness, reliable hosted source access, cache restoration or Phase 4B-2
permission is made from an in-progress run. No deployment or email was performed.
