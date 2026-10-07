# Phase 4B-1.10 — Production operational validation

Status: **completed**, 2026-10-05 America/Los_Angeles. Final hosted validation
[37394519240](https://github.com/ccesm/world-food-lens/actions/runs/37394519240)
passed at source `cc85ebe2f3d9aef453695357136cb3f2b585a41d`. These are actual
runner measurements, not substituted Phase 1.9 Mac measurements. **No deployment,
real email, main-branch publication or Phase 4B-2 work was performed.**

> Update 2026-10-07: this work is merged and live on main (PRs #1 and #2), and
> real scheduled production runs have since passed. The validation-branch push
> trigger described below has been removed; to repeat the safe validation, run
> the workflow manually with `validation_only: true`.

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
post-refresh release/data invariants → validation-only numerical/reference and release/alert checks →
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
source `fb49a7afaeb49af6f04bbcd81eee5459fbddb0b6` (annual/weather succeeded;
the later fixed-fixture test placement failed). Cold-cache persistence run:
[37385516853](https://github.com/ccesm/world-food-lens/actions/runs/37385516853).
Warm-cache/release/failure checks subsequently passed; strict independent-rebuild
roundoff was diagnosed before the final run passed. Earlier failures are retained
as evidence, not hidden by replacing measurements with a successful-only sample.
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

Measured on actual Ubuntu 24.04.5 x64 GitHub-hosted runners, Python 3.12.14,
the pinned geospatial requirements. These are measured runs, not latency SLAs.

| Measurement | Hosted observation |
| --- | ---: |
| First cold annual lifecycle, run 37383436313 | 762.43 s |
| Second cold annual lifecycle, run 37385516853 | 518.51 s |
| Annual preprocessing itself | 761.41 / 517.73 s |
| Annual raw logical disk footprint | 2,645,253,573 / 2,645,253,572 bytes |
| Annual derived logical footprint | 5,288,573 bytes |
| Annual maximum process RSS | 649,441,280 / 646,651,904 bytes |
| Annual Actions compressed cache | 1,887,956 bytes |
| Fresh gridMET refresh, first/third run | 12.74 / 19.36 s |
| Weather consumed/downloaded bytes | 15,237,628 bytes |
| Weather Actions compressed cache | 3,965,264 bytes |
| Third-run annual cache revalidation | 0.0676 s |
| Separate warm runner annual revalidation | 0.0931 s |
| Separate warm weather recomputation | 0.9909 s, zero network bytes |
| Warm annual/weather restore step wall time | 1 s each (coarse runner timestamps) |
| Third-run build job / warm job wall time | 124 / 36 s; strict independent-rebuild check still failed |
| Final accepted build job / warm job wall time | **108 / 37 s**, all steps passed |
| Final accepted annual revalidation, build / separate warm runner | **0.0919 / 0.0807 s** |
| Final accepted build weather / separate warm recomputation | **0.9509 / 1.4800 s**, zero network bytes |
| Final warm weather cache, retaining two recent windows | **7,505,070 bytes** compressed |

Cold numbers include acquisition/preprocessing/verification, not Node/Python
bootstrap or unrelated collectors. RSS is the process high-water mark, not a
continuously sampled whole-runner peak. Disk is end-of-step logical size,
not SSD high-water usage. Source bytes exclude exploratory requests, optional
failed release restoration and package installation. Local Mac annual preparation
was approximately 291 s including audit, weather 19.47 s and same-day warm
0.35 s: Linux is not assumed to reproduce those timings.

Cold processing is practical but materially slower than local computation;
45-minute job allowance replaces the old 20-minute margin to accommodate cache
eviction and normal collector work. Weather retrieval now has a shared 180-second
operational network budget plus individual bounded reads/retries. Existing valid
same-day cached entries remain usable after that budget. This is operational
failure containment, **not a hazard or scientific acceptance threshold**.

Two real cold runs accepted the exact reviewed annual index, and a later run
restored it across runs. A second hosted runner restored that exact physical key.
The full mapped 2023 area is **29,311,317.72 ha**, unlike the preserved 2015
research area of 27,407,296.53 ha. Joint coverage is
**99.9999993858%**, without normalization; Wisconsin retains the small residual.

Real warm, controlled NE outage, complete absence and corrupt-IA-derived-cache
scenarios all passed release/Data Health/alert/body checks in run 37385726193.
NE outage retains the full mapped denominator and gives **85.6348449079%**
coverage, with nine usable states. Missing all geography gives null full-domain
area/coverage, not a claim of zero corn. Corrupt IA gives nine usable states and
unknown full-domain denominator/coverage; it is not converted into 100%.
The same checks all pass in the final accepted run. The production observation
window advanced normally at UTC midnight to **2026-09-21–2026-10-04**, while
the frozen cross-platform comparison remains **2026-09-20–2026-10-03**; no
state-specific date substitution was made.

Two operational defects were reproduced and corrected: post-refresh unit tests
asserted exact historical cache dates/values, and post-job-only cache saving
skipped persistence when a later test failed. Complete suites now run before
source refresh against their committed fixtures, while actual post-refresh
release/data/notification invariants run afterward. No legacy ENSO, price,
revision or alert assertions were weakened or their algorithms changed.

Annual acquisition uses authoritative NASS/GMU state TIFFs, NASS state metadata,
Census state boundaries and gridMET coordinate templates. Weather uses bounded
gridMET THREDDS subsets and three retrieval attempts with socket timeouts.
No unofficial mirror or recalibrated crop mask is introduced.
CDL, authoritative metadata, boundary and THREDDS requests returned accepted
source bytes on two cold hosted runs. Normal urllib redirect handling succeeded
where applicable; no alternative source URL was substituted. This demonstrates
bounded operational access, not a provider SLA or all-season reliability.

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

In the actual hosted outage snapshot the existing pilot's Level A weather
summary was itself unavailable under its original evidence gates, so the honest
display was **unavailable**, not an invented fallback. The deterministic suite
separately proves valid Level A selects the explicitly named fallback and both
invalid sources remain unavailable. No baseline/phenology gates were bypassed
to manufacture a successful fallback demonstration.

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
The final generated-data revision in that local-only bare repository is
`301c4d399509f7a19cd9e9e64f0eec7e8e447534`, tied to source `cc85ebe...` and
release `release-e05995ddb816cd1b9a39a5226becfcb793483549accf814e19eaa0e93b6fd97f`.
It does **not** exist as a published main data release. The standalone spatial
file is release input; its consumed hash participates in the existing input
identity. The actual frontend-facing spatial copy has the release ID and all
31 canonical records bound to that release. No self-referential release hash.

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
The historical 2015 Missouri −10.011% discrepancy remains in the unchanged
Phase 1.8 artifact/report. The actual 2023 Missouri diagnostic is −2.5510%
relative to 3.85 million official planted acres, with `calibrationApplied:false`.
Different years need not have the same discrepancy. No mask is calibrated to
survey acreage and unknown publication dates remain null.

## J–K. Size and cross-environment reproducibility

Raw rasters/grids/sparse matrices stay outside Git/Pages/JavaScript bundles.
The public artifact is inspected for cell arrays and internal filesystem paths.
The approximately 0.25 MB standalone summary is runtime/release data; the
frontend reads the release-bound copy through the existing alert feed, not a
bundled geospatial library. In hosted run 37385726193:

- Standalone current Level C JSON: **252,593 bytes** (compact summaries, no cells).
- The release-bound spatial copy in the readable monitor snapshot: approximately
  **442,968 bytes** including indentation/record provenance; delivered at runtime.
- Staged Pages archive: **16,885,760 bytes** uncompressed tar, **1,446,561 bytes**
  compressed Actions artifact. Logical website files total **16,871,296 bytes**.
- Main JS: **2,223,206 bytes** after all official sources refreshed; history JS
  **5,350,720 bytes**, CSS **58,705 bytes**. The larger main JS compared with the
  local 1,115,602 bytes is caused by the existing `virtual:official-data` source
  cache embedding, not a Level C grid/summary import. `cornPilot` is already
  stripped by that existing plugin. Level C enters only via runtime alert-feed
  retrieval. No unrelated bundler redesign was undertaken.
- Against the same retained local official cache, the Phase 1.10 wording/check
  changes added approximately **302 bytes** relative to the Phase 1.9 main JS.
  Existing >500 kB chunk warnings remain. Raw annual/weather files and matrices
  are absent from both JS and Pages; no geospatial browser dependency was added.
The final accepted run has **252,653-byte** standalone JSON, approximately
**443,014-byte** readable spatial copy, **16,874,927-byte** logical website and
**16,896,000-byte** tar (**1,445,248-byte** compressed Pages upload). Main/history
JS and CSS byte counts are unchanged from the third-run figures. Actual Level C
analytical/index hashes are absent from the main JS payload, consistent with
the inspected runtime fetch path. Pages upload here stages an artifact; it is
**not public deployment**.

Fixed Mac annual/weather input bytes are held in an authenticated draft
validation archive, not a public frontend or production release. Checksums:

- Annual derived archive: `c4b589b61a1723fa12d768e94ff3b819947f077e7956bdc36c2c93fa017ea404`.
- Consumed weather archive: `c9e304510a92e519f8421a41d02e74e4abeb0fa93cec9e673189575140d133bc`.
- Reference analytical hash: `01a00c35cad7f9a7482267c788712f90e551368701d892d436840997da463771`.

Frozen-input replay forbids new network retrieval. The comparison checks actual
source identities, all five state/combined weather distributions, areas and
coverage. Fixed annual-cache + fixed weather bytes produced **exactly the same
analytical hash** on Mac and Linux, with zero measured weather/area differences.

Independently rebuilding geometry on Linux has a small platform/library
floating-point difference: greatest valid-area delta is **0.179344177 m²** in WI,
greatest coverage-ratio delta **1.0158e−11**, greatest weather-statistic delta
**2.4322e−10 mm** (WI precipitation mean). Mapped native corn counts/areas and
coordinates are identical. The rebuilt numerical hash is therefore **not**
byte-identical; this is disclosed rather than rounded away for hash equality.

The replay audit uses the already-established 1.8/1.9 area-conservation precision
(`max(0.01 m², mapped area × 1e−9)`) to bound overlap-weight differences. Mean
differences additionally must satisfy the mathematical total-variation bound:
`abs(mean difference) <= TV(normalized valid weights) × (max−min) + 1e−10`.
Quantiles/extrema retain the original 1e−10 comparison, and exact source identity,
crop cells, coordinates and missing-weather masks cannot change. Normalization
here is only the existing conditional weighted-mean calculation; published
coverage/denominators are never normalized. No scientific calculation, hazard
threshold, source data or geometry is changed to improve agreement. Tests reject
material mean changes, quantile changes and a newly missing weather mask.

Wisconsin has one missing native-weather cell with about **0.1800 ha** mapped
support; its actual missing dates and area remain reported. The numerical
perturbation is not a newly missing cell or a fabricated 100% coverage. Exact
cache replay remains the path to identical deterministic content. Volatile
operational timestamps/records are outside the analytical identity.

## L–M. Scope and tests

Phase 1.10 changes relative to the preserved Phase 1.9 foundation:

- `.github/workflows/deploy-pages.yml`: safe mode, shared annual lifecycle,
  approved-only cache persistence, exact warm restoration and operational checks.
- `scripts/refresh_corn_spatial.py`: explicit proxy reasons, public-error
  redaction and bounded shared weather retrieval; no aggregation/hazard change.
- `src/services/cornSpatial.js`: reject future/mislabeled current-year geography.
- `src/components/CornSpatialWeather.jsx`: precise bilingual map-year wording.
- `tests/cornSpatial.test.js`: older/future geography label regression.
- Added `scripts/ensure_corn_spatial.py`, `validate_spatial_operation.py`,
  `validate_spatial_display.mjs`, `validate_spatial_scenarios.py`,
  `validate_spatial_replay.py`, `tests/test_corn_spatial_operations.py`, this report.
- `README.md`, `PROJECT_CONTEXT.md`: completed hosted gate and activation status.

Both local and final hosted complete suites pass: **215 JS**, **161 standard
Python**, **12 production numerical**, **17 Iowa**, **30 ten-state** tests
(**220 Python total**). Production builds pass, preserving the existing
large-chunk warning. Hosted build 4.00 s; final local build 1.19 s. Twelve new
tests cover lifecycle/corruption/unapproved upgrades, cache identity, public
privacy, notification eligibility/body and geography labels. Actual generated
warm, NE outage and full absence scenarios additionally pass release and alert
isolation checks locally and on the real hosted runner. Frozen Iowa and ten-state
reference hashes remain respectively `b1cd12ac741e916d8f4e179658f09228b1061692e1b3ffae82935aa4f0327c6d`
and `a2ebf57ca17eb378918a0c4ec4ed9a7cbcb961dc9591525fa2ab1acc4938c103`.
Commands: `npm test`, Python unittest discovery in `tests/spatial`,
`research/iowa_spatial`, `research/cornbelt_spatial`, and `npm run build`.

## N–O. Operational risks and final decisions

The informational layer is operationally validated, **not yet activated on
main/the public website**. Only the safe validation branch was pushed. Primary
dirty work and all preceding local phases remain intact. GitHub main was still
`b1a13afc454dde5fbfbb33816f0c6e7f4e98ec97` when checked after validation.

Remaining risks:

- 2023 class-1 native-30m CDL is a disclosed geography proxy, not exact 2026
  planting. Native-10m adoption needs separate validation, not silent promotion.
- Cache eviction/branch scope means first main activation can legitimately take
  the measured cold path. Caches and 90-day diagnostics are not a permanent
  scientific archive. Optional pinned annual asset is not published; rebuild
  succeeds without it. A long-term accepted-weather archive remains future work.
- Weather sources are preliminary/revisable and not an SLA. One fixed replay
  and several hosted runs do not establish multi-season reliability. Weather
  cache grew from 4.0 to 7.5 MB for two windows; 60-day pruning is implemented,
  but steady-state seasonal cache size has not been measured.
- Existing Level A may itself be unavailable; fallback must not bypass its
  evidence gates. Local stage remains unresolved and alerts remain Level A.
- `ubuntu-latest` warns of an upcoming Ubuntu 26 image change. Pinned Python
  packages plus the safe validation path should be rerun on that image. Existing
  Actions Node-20 compatibility and large-bundle warnings are non-fatal; no
  unrelated version/bundler migration was attempted.

| Required decision | Answer | Qualification |
| --- | --- | --- |
| A. Real GitHub Actions run successful? | **Yes, with limited caveats** | Final entire safe production build + separate warm job succeeds; no public deployment was requested. |
| B. Annual cache restoration reliable? | **Yes, with caveats** | Cross-run and independent-runner exact-key reuse verified; documented eviction/branch scope still applies. |
| C. Cold/warm acceptable? | **Yes** | Cold annual 518.51–762.43 s, fresh weather 12.74–19.36 s; warm weather 0.95–1.48 s, annual validation ~0.08–0.09 s; final build job 108 s. |
| D. One-state failure safe? | **Yes** | Nine states usable; NE absent weather reduces coverage to 85.6348%, not 100%. |
| E. Complete failure preserves behavior honestly? | **Yes** | Explicit unavailable/unknown area, unchanged alerts/email policy; valid Level A is named fallback, invalid Level A remains unavailable. |
| F. 2023 proxy explicit/correct? | **Yes** | Separate geography year/weather dates, reason and bilingual map-year/proxy labels. |
| G. Isolated from automatic alerts? | **Yes** | Same inputs: identical active/events, legacy health, mail eligibility/body and existing ledger tests; SMTP never called. |
| H. Production-ready? | **Yes, with one limited caveat** | Ready as an informational spatial-weather layer over the explicitly older validated proxy, not current-year exact acres; main activation still a separate authorized step. |
| I. May Phase 4B-2 proceed? | **Yes** | Operational spatial foundation passed; any future hazards still need separately versioned methodology/baselines and must not imply local stage or crop damage. Not implemented here. |

Stop after Phase 4B-1.10. **No EDD/VPD/wetness/compound hazard, spatialized stage,
yield model, new alert, map, database, deployment or email.**
