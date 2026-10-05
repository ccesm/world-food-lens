# Phase 4B-1.9 — Level C informational spatial-weather pipeline

Validation date: 2026-10-05. Base checkout: main, `951cdc6`; earlier checkpoint
`42c55f6`. This is an additive implementation, not a replacement for the frozen
Iowa, ten-state, Phase 3 or Phase 4A methods.

## Status and scientific boundary

Implementation, real-source local measurements, compatibility tests and build
are complete. **Operational activation is not complete:** the prepared annual
asset has not been uploaded, the new workflows have not run on GitHub Actions,
and no code has been pushed or deployed. No email was sent. The existing live
site and alert thresholds have not been changed by this local work.

The output is **mapped corn-area × gridded-weather spatial overlap**. It is not
affected/damaged acreage, confirmed stress, yield/production loss, or local
stage-specific exposure. It covers the selected ten states, not all US corn.
Statewide USDA progress, official condition and supply revisions remain separate
context. There is no production weighting, new hazard or alert migration.

Read with the preserved [feasibility study](PHASE4B1_6_LEVEL_C_FEASIBILITY.md),
[Iowa reference](PHASE4B1_7_IOWA_SPATIAL_POC.md), and
[ten-state scaling report](PHASE4B1_8_CORN_BELT_SCALING.md).

## A. Production architecture

Annual native CDL class 1 → frozen exact-footprint corn/gridMET intersection →
versioned derived annual cache → recent gridMET subsets → three-variable joint
validity → compact state and ten-state summaries → existing canonical metadata,
Central Data Health and release identity → frontend informational evidence.

The grid remains `cornbelt-iowa-anchored-9km/1`: EPSG:5070, 9,000 m cells, anchor
(-52095, 2288295), 16 edge segments. The original research geometry and Iowa
weather reader are reused, not copied or rewritten. Annual identity binds their
implementation hashes. New production method:
`mapped-corn-weather-production/1`; annual method:
`native30m-corn-fraction-exact-overlap/1`.

Raw TIFF/NetCDF, sparse intersection matrices and derived crop-cell arrays stay
outside Git and Pages. The browser receives summaries, never raw grids.

## B. Annual preprocessing and geography vintage

`scripts/prepare_corn_spatial.py` verifies official state/FIPS/year URL, source
checksums, whole-state coverage metadata, native raster geometry, boundary
identity, publication date and positive/conserving corn area. A single gridMET
day establishes the native weather coordinates. The reference intersection
engine produces deterministic cells, coordinates and sparse overlap weights.
An independent native-pixel count agrees with every state total; all 45 state
pairs contain zero duplicate class-1 corn pixels. This audit is bound into the
annual index and validated before an annual archive can be published/restored.

The supported source family is **native 30 m CDL, 2008–2023**. NASS changed the
native resolution to 10 m starting in 2024; 2025 CDL is available. This phase
does not pretend the validated 30 m engine supports that family or quietly
resample categorical crops. Consequently **2023 is the latest validated
geography here, not the newest available CDL**. Recent 2026 weather is explicitly
labeled an older-geography proxy, not the exact 2026 planted distribution.
Future crop years cannot describe earlier weather; retrospective offline replay
is separately labeled and is not point-in-time operational evidence.
[Official CDL availability and resolution](https://data.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php).

2023 area checks use the January 12, 2024 USDA annual crop-production report.
All-purpose planted acreage is the comparison basis; grain-harvested acreage is
retained separately. Raster hectares are never calibrated to the survey.
[Official acreage reference](https://release.nass.usda.gov/reports/cropan24.txt).

| State | Mapped corn, ha | Official planted, acres | Mapped minus planted | Weather coverage |
| --- | ---: | ---: | ---: | ---: |
| IA | 5,183,466.66 | 13,100,000 | −2.22% | ≈100% |
| IL | 4,507,861.68 | 11,200,000 | −0.54% | ≈100% |
| NE | 4,210,616.07 | 9,950,000 | +4.57% | ≈100% |
| MN | 3,541,721.76 | 8,600,000 | +1.76% | ≈100% |
| IN | 2,247,735.60 | 5,450,000 | +1.91% | ≈100% |
| SD | 2,618,427.87 | 6,300,000 | +2.70% | ≈100% |
| KS | 2,287,288.62 | 5,750,000 | −1.70% | ≈100% |
| OH | 1,430,349.84 | 3,600,000 | −1.82% | ≈100% |
| MO | 1,518,294.60 | 3,850,000 | −2.55% | ≈100% |
| WI | 1,765,555.02 | 4,000,000 | +9.07% | 99.99998980% |

These are 2023 comparisons. The original Missouri **2015** discrepancy of about
−10% remains in the unchanged Phase 4B-1.8 artifact; it has not been corrected,
replaced by the 2023 result, or used to scale the corn mask.

## C. Routine weather refresh

`scripts/refresh_corn_spatial.py` requests bounded gridMET `tmmx`, `tmmn` and `pr`
subsets for a common 14-day period, default ending UTC today minus two days.
Cross-year windows use the corresponding yearly source files. Missing dates are
NaN, never zero; duplicate, unordered or outside-window dates are rejected.
The reader verifies units/packing, actual coordinates and expected dates. Three
bounded retrieval attempts are supported; a failed state does not cancel others.

Joint valid area requires all three variables on all 14 expected days. Means
and percentiles describe that observed area; coverage separately retains the
full mapped denominator. Temperature means and mean per-location window
maximum/minimum are distinguished. Rain is cumulative per location before
area weighting. Percentiles are computed over concatenated area-weighted native
weather footprints, not averages of state percentiles.

gridMET days nominally end at 07 UTC the following calendar day. Its recent
60 days are preliminary/revisable. Therefore a same-day rerun may reuse checked
bytes, but a new-day refresh rechecks the recent 14-day subsets, rather than
assuming yesterday's preliminary values are immutable. This deliberately costs
more network than fetching only the newest day. The crop mask is not rebuilt.
[gridMET temporal definition and revisions](https://www.climatologylab.org/gridmet.html).

## D. Cache strategy and corruption behavior

Annual key: crop/class, state, CDL year and byte hash, boundary hash, weather
coordinate hash, common grid, annual methodology and reference implementation.
The index identifies all state keys and the mask-partition/native-area audit.
The annual release archive is content-addressed, deterministic and checksum
pinned. Extraction allows only the 41 expected regular files, rejecting links,
path traversal, oversized or unexpected entries. Corrupt/version-mismatched
cache entries are never silently accepted.

Weather key binds provider/year/variable/bounds/actual date request, annual
geometry and reader identity. Each entry binds raw bytes and validated content;
old owned entries are pruned after 60 days. Whole-source hashes and accepted
timestamps remain distinct from fetch-attempt time. Same inputs produce the
same analytical hash despite different run clocks.

Prepared local annual archive:

- SHA-256: `c4b589b61a1723fa12d768e94ff3b819947f077e7956bdc36c2c93fa017ea404`.
- Annual index hash: `bfb0d22a90f0dc185461957f45cdcdfcfb54b4a1a51dbc336f78fc44cab0092a`.
- Configured tag: `corn-spatial-annual-2023-c4b589b61a17`.
- Local file: [prepared annual archive](/private/tmp/corn-spatial-annual.tar.gz)
  (temporary local storage; preserve/upload deliberately before clearing caches).
- **This tag/asset is not yet published.** Configuration pins the validated local
  product; a fresh official-source rebuild may legitimately produce a different
  archive identity requiring review and a new pin.

Dynamic consumed inputs can be archived outside the repository for provenance.
Actions retains that diagnostic artifact for 90 days, **not permanently**.
Compact summaries retain input identities after expiration, but identities alone
cannot reproduce deleted preliminary input bytes. Permanent retrospective
research needs deliberate input retention before relying on those windows.

## E. Compact artifact and denominator schema

`public/data/corn-spatial.json` contains schema/method/grid version, generated
time, analysis period, deterministic analysis hash, ten ordered state summaries,
combined summary and optional source-archive identity.

Each state carries state ID, status/reasons, mapped/valid/missing area in m²,
coverage, five weather distributions (mean/min/P10/P50/P90/max), method, geography
year/publication/proxy label, annual key, source versions/dates, official acreage
comparison, point-comparison diagnostics and three canonical metadata records.
The combined summary lists contributing states and their input identities.

For known geography:

`coverage = sum(valid jointly observed corn area) / sum(total mapped corn area)`.

Failed weather with a verified crop grid contributes its known area to the
denominator and zero valid observed area, **not zero corn area**. If an entire
geography is unknown, full-scope total and coverage are null; known area and
unknown/unavailable state lists remain explicit. The nine available states are
never normalized to ten. Missing coverage is not extrapolated.

Observed production snapshot: 2026-09-20 through 2026-10-03, using 2023 geography.
Total mapped area **29,311,317.72 ha**; joint coverage
**99.9999993859%**. Missing area **0.180012 ha** is retained (tiny masked/numerical
residuals, principally Wisconsin), not rounded away in the data. Weighted daily
Tmax mean 21.1315°C, Tmin mean 11.7393°C, cumulative rain 61.6268 mm. Rain spatial
P10–P90: 20.9–119.1 mm. These are neutral weather descriptions, not hazards.

## F. Central Data Health integration

The existing canonical contract, normalization and datasetHealth interpreter
are reused. Three narrowly declared datasets live in `src/data/cornSpatial.json`:
crop geography, gridded weather, and spatial intersection. Python registers them
into the existing contract at the adapter boundary; JavaScript routes them
through the existing Central Data Health machinery. There are 30 state component
rows plus the ten-state aggregate row.

Frozen Phase 4A contract source files remain byte-identical. Narrow spatial
diagnostics live in canonical metadata extensions, mapped to existing canonical
reasons:

| Spatial diagnostic | Canonical reason |
| --- | --- |
| crop_grid_unavailable | coverage_incomplete |
| crop_grid_version_mismatch | semantic_validation_failed |
| weather_grid_incomplete | coverage_incomplete |
| spatial_alignment_failed | semantic_validation_failed |
| partial_spatial_coverage | coverage_incomplete |

Crop geography is an explicitly older proxy, not a current-year availability
claim. Freshness is assessed against weather observation period, not download
clock alone. Failed refreshes preserve previous accepted values/periods and
mark them ineligible for current Level C display.

## G. Fallback and failure isolation

Healthy, current Level C state data are preferred for informational weather.
Unavailable/stale Level C with valid current Level A uses the clearly labeled
**Representative-point fallback / 代表点回退**. Both unavailable means unavailable,
not zero. Level A's original seven-day UTC window is shown separately and is
not silently substituted into the 14-day gridMET aggregate. The aggregate never
mixes point and area-weighted values or silently includes stale contributors.

Actual NE failure simulation: all other nine state weather summaries remain
identical; the full mapped denominator is unchanged; joint coverage becomes
**85.63484491%**, with NE explicitly unavailable. Corrupt/missing annual state
grids and cache mismatches are separately tested. Unknown geography produces
unknown full-scope coverage rather than a misleading complete nine-state ratio.

## H. Workflow integration and activation steps

The existing refresh workflow gains optional spatial runtime installation,
immutable annual-cache restoration, reusable recent-weather cache, isolated
spatial refresh, diagnostic input retention, existing evaluation/validation,
build and release. It does not recompute native CDL on each daily refresh.
Expected source/cache failures degrade the spatial module, preserving Level A
and unrelated modules. Invalid wire artifacts fail integrity validation rather
than being published under a misleading Level C label.

The existing SMTP job, alert conditions and thresholds are unchanged. Spatial
data are attached **after** alert evaluation. Phase 2 records only meaningful
period, method/geography, availability and coverage-class changes; no grid-cell
events, daily numeric-weather floods or spatial-derived alert events.

Two manual workflows are added:

- `corn-spatial-annual.yml`: annual preparation and checksum-pinned derived
  archive; optional GitHub Release asset publication defaults off. No Pages/email.
- `corn-spatial-validation.yml`: cold/warm/failure measurements, complete tests
  and build; read-only repository permission, no Pages/email/main writes.

Before live activation, an authorized operator must:

1. Publish the prepared annual derived asset, or run the manual annual workflow
   and review/pin its resulting tag, archive hash and index hash.
2. Run the validation workflow on GitHub Actions and review Linux results and
   resource measurements. No CI run is claimed by this report.
3. Deliberately authorize the ordinary application/data release separately.

Until the configured asset exists, a cold routine runner reports unavailable
crop grids and explicitly falls back, rather than pretending the local-only
archive has been deployed. No release or temporary validation branch was pushed
as part of this task.

## I. Frontend changes

The US Corn view gains one modest separate spatial-weather section. Its title
is **Mapped corn-area weighted weather / 按玉米制图面积加权的天气**. It shows geography
year/proxy, weather dates, area denominator, joint coverage and area-weighted
Tmax/Tmin/rain. State details, input versions, official acreage discrepancies
and point diagnostics are collapsible. The no-damage/no-local-stage limitation
is prominent in both languages. State phenology, condition, supply revision and
legacy screens remain separate below; no composite risk score is introduced.

No new raster/map download, CSS redesign or geospatial browser library is added.
The artifact is fetched through the existing data feed/release path, not imported
as a raw-grid JavaScript bundle dependency.

## J. Provenance and compatibility

Each summary binds geography/source bytes, weather bytes/content hashes and
dates, analysis grid, methodology, state contributors, observation period,
coverage and canonical eligibility. Evaluation binds the existing immutable
release ID into every record and the new Phase 2 input identity. Python release
verification includes the spatial input and configuration for new releases;
older releases without the additive dataset remain valid.

The original reference artifact SHA-256 values are unchanged:

- Iowa: `b1cd12ac741e916d8f4e179658f09228b1061692e1b3ffae82935aa4f0327c6d`.
- Ten-state: `a2ebf57ca17eb378918a0c4ec4ed9a7cbcb961dc9591525fa2ab1acc4938c103`.

An actual offline July 1–14, 2015 replay through the production wrapper matches
all ten mapped areas and all five state/combined weighted weather summaries
exactly. Floating reduction order changes some valid-area sums by at most
0.00000763 m²; this is disclosed, not disguised as new JSON byte equivalence.
The frozen research JSON files themselves remain byte-identical. No historical
outcome, yield, condition or holdout data were used to select parameters.

Same accepted current inputs, different run clocks: identical analytical hash.
Annual archive generation is deterministic and verified against its checksum.
The isolated end-to-end release evaluation and Python manifest verification
accept the new input/config binding and all 31 spatial health rows.

## K. Measured performance and storage

These are **local macOS measurements**, not GitHub-hosted Actions timings.
Pinned numerical dependencies match the reference implementation.

| Operation | Measured time | Network / memory notes |
| --- | ---: | --- |
| Annual ten-state geometry rebuild, existing downloaded raw bytes | 282.02 s | Peak RSS 1.944 GB; does not include original large source download |
| First additional annual native-area/pair-partition audit | 8.62 s | Separately measured; audited warm preparation total 10.03 s, peak RSS 1.976 GB |
| Annual warm validation/derived reuse before audit addition | 2.30 s | No native geometry rebuild; not a current complete cold-download measurement |
| Cold recent-weather retrieval + aggregation | 19.47 s | 15,237,628 downloaded bytes; peak RSS 158.94 MB |
| Same-day warm weather cache + aggregation | 0.35 s | 0 downloaded bytes; peak RSS 146.44 MB |
| Warm NE failure simulation | 0.35 s | Other states intact; 0 downloaded bytes |
| Production build, warm installed dependencies | 1.21 s | Existing large-chunk warning remains |

First annual retrieval transferred approximately 2.645 GB of source/cache data.
Its complete uninterrupted acquisition wall time was not measured; do not quote
282 seconds as a network-inclusive full cold run. Weather timings cover the
refresh function; CLI startup and optional archive compression add overhead.
Warm 0.35 seconds is **same-day reuse**, not a promise that a new-day preliminary
source recheck is network-free.

Final sizes: annual derived directory **5,288,554 bytes**; compressed annual
archive **1,892,181 bytes**; accepted weather files approximately **15.24 MB**;
compressed consumed-weather archive **4,197,422 bytes**; public summary
**251,750 bytes**. Raw annual working data approximately **2.645 GB** remains
external. Main built JS is 1,115.30 kB (gzip 330.13 kB); the unchanged historical
chunk is 5,350.72 kB. Raw/grid assets do not enter either JS bundle.

Measured local compute/storage are compatible with cached Actions execution in
principle. Annual preparation is manual with a 45-minute timeout; the regular
existing workflow keeps its 20-minute timeout and restores only the small
derived annual artifact. Actual cold/warm Linux runner measurements remain an
activation gate, not evidence already obtained.

## L. Exact implementation files

Modified existing files:

- `.github/workflows/deploy-pages.yml`
- `scripts/evaluate_alerts.mjs`
- `scripts/release_pipeline.py`
- `src/components/USCornPilot.jsx`
- `src/services/centralDataHealth.js`
- `src/services/changeSet.js`
- `README.md`
- `PROJECT_CONTEXT.md`

Added this phase:

- `.github/workflows/corn-spatial-annual.yml`
- `.github/workflows/corn-spatial-validation.yml`
- `scripts/corn_spatial.py`
- `scripts/corn_spatial_geo.py`
- `scripts/corn_spatial_cache.py`
- `scripts/corn_spatial.mjs`
- `scripts/corn_spatial_requirements.txt`
- `scripts/prepare_corn_spatial.py`
- `scripts/refresh_corn_spatial.py`
- `scripts/validate_corn_spatial_run.py`
- `src/data/cornSpatial.json`
- `src/services/cornSpatial.js`
- `src/components/CornSpatialWeather.jsx`
- `public/data/corn-spatial.json`
- `tests/cornSpatial.test.js`
- `tests/test_corn_spatial.py`
- `tests/test_corn_spatial_reference.py`
- `tests/spatial/test_production_geo.py`
- `docs/PHASE4B1_9_LEVEL_C_PRODUCTION.md`

Earlier untracked 4B-1.6/1.7/1.8 reports and `research/iowa_spatial`,
`research/cornbelt_spatial`/reference artifacts already existed before this
phase; they are preserved dependencies, not newly rewritten Phase 1.9 files.
They must accompany a future authorized commit so fresh CI checkouts have the
reference engine and compatibility fixtures.

## M. Tests and build

Complete relevant suites, all passing:

- JavaScript: **214 tests**.
- Standard Python discovery: **150 tests**.
- Production numerical/geospatial suite: **12 tests**.
- Preserved Iowa numerical suite: **17 tests**.
- Preserved ten-state numerical suite: **30 tests**.
- Python total across those non-overlapping suites: **209 tests**.
- Production build: successful; built spatial JSON byte-matches public input.

New tests: 11 JS + 16 production stdlib + 3 frozen-reference + 12 numerical =
**42**. Coverage includes metadata/fallback/bilingual boundaries, cumulative
area accounting, missing/unknown states, partial coverage, release identity,
unchanged alerts, deterministic projections, annual/source/method cache keys,
corruption, safe deterministic archives, date completeness, matrix sanity,
partial weather, same-day reuse/new-day recheck, consumed input retention and
Iowa/ten-state artifact compatibility. Real ten-state runs additionally verified
native source/area conservation, deterministic reruns and NE failure isolation.

Reproduction commands (raw/cache paths must be outside the repository):

```sh
npm test
python -m unittest discover -s tests/spatial
python -m unittest discover -s research/iowa_spatial
python -m unittest discover -s research/cornbelt_spatial
npm run build
```

The spatial suites require the pinned runtime in
`scripts/corn_spatial_requirements.txt`. The manual validation workflow installs
it and runs all these suites without publication or email.

## N. Remaining scientific and operational limitations

1. Local phenology is unresolved; no statewide percentage is distributed as
   observed local stage acreage. Level C solves crop location × weather only.
2. 2023 geography is an explicitly older proxy. Native 10 m validation is a
   separate future upgrade, not implemented here.
3. CDL class-1 mapped area, survey planted area and harvested grain area are
   distinct measurements. Missouri 2015 and Wisconsin 2023 differences remain
   visible. No calibration or implied classification perfection.
4. Weather footprints are modeled/reprojected spatial estimates, not field
   measurements; gridMET and POWER differ in provider/day boundary. The normal
   Level A seven-day feed cannot be called a paired 14-day comparison.
5. Recent input versions can revise. 90-day Actions retention is insufficient
   for permanent preliminary-vintage retrospective research.
6. Real Actions runtime and annual asset activation are outstanding. A local
   passing build is not a deployed or remotely validated production system.

For the current common-period same-provider diagnostic, absolute point-minus-area
differences range 4.40–33.05 mm for rain, 0.015–0.654°C for mean Tmax,
0.202–0.914°C for mean Tmin, and 0.299–2.459°C for window Tmax maxima. These are
descriptive sampling differences, not statistical significance or a new
pass/fail threshold. The retained 2015 comparison includes different provider/
time definitions and cannot isolate sampling alone. No claim of better yield
prediction or calibrated scientific accuracy is made.

## O. Final decisions and Phase 4B-2 gate

| Question | Decision | Reason |
| --- | --- | --- |
| A. Production-ready informational layer? | **No — not yet operationally activated** | Code and real-source local validation are complete; pinned annual asset and actual Actions validation remain pending. |
| B. Default weather representation? | **Not yet for the live site** | Implemented selector prefers healthy Level C Tmax/Tmin/rain once released; current production activation is not claimed. |
| C. Variable benefit ranking? | **Precipitation first; Tmax and Tmin next, approximately tied** | A practical sampling priority, not a statistically proven skill ranking; both mean temperature and extremes still benefit from spatial diagnostics. No additional variables supported. |
| D. Level A still needed? | **Yes** | Explicit fallback, historical compatibility/reference and diagnostic comparison; original hazard/alert basis remains unchanged. |
| E. Actions + Pages sufficient? | **Yes, with caching/preprocessing** | Local measured resource requirements support this architecture; actual hosted-run confirmation is still needed. |
| F. Ready for Phase 4B-2 on the production foundation? | **No, until operational activation/CI validation** | First publish/verify the annual cache and run the no-deploy validation workflow. Any later hazard method still needs its own specification/validation and must not spatialize phenology. |

This phase stops at production pipeline implementation and local validation.
It does not implement or authorize Phase 4B-2, deployment or email.
