# Phase 4B-1.8 — Ten-State Corn Belt Spatial Scaling Validation

Date: 2026-10-05. Baseline: `main`, `951cdc6`. **Offline research only.**

The starting local branch already contained two commits ahead of the retained
`origin/main` reference. Those commits were preserved, not created or pushed
by this phase; new scaling files remain local and uncommitted.

结论：Iowa 的面积交叠方法已成功推广到既有十州。约 **2,740.73 万公顷**
class-1 玉米制图面积均有完整的两周天气数据；单点降雨在部分州明显偏离
面积加权结果。这里只验证空间架构和天气分布，**不是受灾面积、减产或价格预测**。
当地生育阶段仍没有相同空间分辨率的观测。建议下一步先生产化空间管线，
本阶段不加入新风险指标、不部署、不发邮件。

## A. Ten-state scope and frozen inputs

Exactly the existing Phase 3 pilot states: Iowa, Illinois, Nebraska, Minnesota,
Indiana, South Dakota, Kansas, Ohio, Missouri and Wisconsin. Stable identifiers
are `US-IA`, `US-IL`, `US-NE`, `US-MN`, `US-IN`, `US-SD`, `US-KS`, `US-OH`,
`US-MO`, `US-WI`; representative coordinates are read unchanged from
`src/data/cornPilot.json`. Existing production weights are **not used**.

- Fixed window: **2015-07-01–2015-07-14**, identical to Iowa. All states retain
  those dates; no substitution or outcome-dependent selection.
- Crop geography: **2015 CDL**, class 1 only, native 30 m equal-area pixels.
  All ten official state metadata pages identify publication date **2016-02-12**.
  This is retrospective post-season geography, **not** a July-2015-available map.
- Weather: gridMET `tmmx`, `tmmn`, `pr`, all 14 ordered days, native 1/24°
  footprints. Edition text and unknown exact publication times remain explicit.
- Official acreage: USDA NASS *Crop Production 2015 Summary*, published
  **2016-01-12**. Only the 2015 planted/harvested-area table is used, not yield
  or production outcomes. [Official report](https://esmis.nal.usda.gov/sites/default/release-files/k3569432s/kh04dr985/70795996r/CropProdSu-01-12-2016.txt).
- Census 2015 generalized state boundaries audit padding and state identity;
  they do not redefine the official state-clipped CDL mask.

New methodology: `ten-state-mapped-corn-weather/1`; common grid:
`cornbelt-iowa-anchored-9km/1`. Original Iowa, Phase 3/4A and spatial-stage
methods/artifacts are unchanged. No outcome validation or parameter tuning.

## B. Generalized architecture

One reusable state adapter, not ten copied scripts:

1. Bounded, per-state CDL/boundary/metadata and classic-NetCDF retrieval.
2. Reuse Iowa's CRS/class/nodata, packing, units, dates and weather-grid guards.
3. Shared EPSG:5070, 9,000 m lattice, frozen origin **(-52095, 2288295)**.
4. Fractionally intersect categorical native corn pixels with reporting cells
   and densified native gridMET footprints; preserve sparse crop-area weights.
5. Require complete Tmax/Tmin/rain observations across the fixed window for
   joint eligibility; aggregate by actual joint-valid corn area.
6. Isolated state subprocesses, compact summaries and a combined native-support
   distribution. Per-state diagnostics survive other states' failures.

The necessary generalization is the source-origin guard: other state native
origins differ from Iowa, so read every touched native pixel and intersect its
actual rectangle with the **same** reporting lattice. Do not snap crop classes,
interpolate categories or silently create state-specific reporting origins.
Iowa's geometry/utilities themselves were not redesigned.

All 45 state pairs were independently checked for duplicate class-1 native
pixels: **zero**. Independent full native pixel counts equal the reporting-grid
corn totals in every state. Shared grid IDs may cross state boundaries, but
corn-area partitions are nonduplicated. Counts below are state-partitioned
reporting cells, not a count of unique nationwide grid locations.

## C. CDL area validation

Mapped hectares are native class-1 area, not surveyed acreage. The official
comparison basis is **all-purpose planted corn**; grain-harvested acreage is
separate context. One acre = 4,046.8564224 m². No scalar calibration is applied.

| State | Mapped corn ha | Official planted million acres | Grain-harvested million acres | Mapped − planted acres | Difference |
| --- | ---: | ---: | ---: | ---: | ---: |
| IA | 5,284,040.67 | 13.500 | 13.050 | −442,851.15 | −3.280% |
| IL | 4,675,411.62 | 11.700 | 11.500 | −146,806.28 | −1.255% |
| NE | 3,832,254.99 | 9.400 | 9.150 | +69,708.31 | +0.742% |
| MN | 3,215,782.80 | 8.100 | 7.600 | −153,627.64 | −1.897% |
| IN | 2,329,073.01 | 5.650 | 5.480 | +105,264.75 | +1.863% |
| SD | 2,208,811.41 | 5.400 | 5.030 | +58,091.86 | +1.076% |
| KS | 1,599,853.23 | 4.150 | 3.920 | −196,676.57 | −4.739% |
| OH | 1,421,824.95 | 3.550 | 3.260 | −36,594.03 | −1.031% |
| MO | 1,183,559.31 | 3.250 | 3.080 | −325,361.25 | **−10.011%** |
| WI | 1,656,684.54 | 4.000 | 3.000 | +93,756.65 | +2.344% |

The configuration declared a >10% absolute discrepancy **investigation flag**
before the cross-state results were examined. This is not a weather/hazard
threshold, representative-point pass/fail rule or calibrated accuracy score.
Missouri narrowly crosses it and remains flagged.

Missouri investigation:

- Correct 2015 state source, native CRS/resolution/class and independent pixel
  count verified; no area loss through clipping/reporting-cell conversion.
- No duplicate corn pixels with other states; no missing crop/weather geometry.
- Corn-labelled classes excluded by the preserved Iowa definition total
  **7,929.27 ha** (including sweet/popcorn and double-crop classes). This is
  only about 6% of the 131,699 ha planted-area gap; changing those classes
  would not explain it, and the definition was not changed.
- Missouri CDL corn producer/user accuracy metadata: **95.34% / 96.02%**.
  These validation statistics do not establish the cause or a correction for
  statewide mapped-area bias. [Official classification/legend](https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_mo15.htm).
- Survey planted versus grain-harvested universes, classification errors,
  mixed/late-established canopy and map/survey measurement differences remain
  possible explanations, **not demonstrated causes**. The discrepancy remains
  unresolved, rather than silently treating the map as all true planted acres.

Wisconsin also illustrates why grain-harvested area is not the denominator:
its class-1 map includes a broader corn universe than grain-only harvest.
Weather coverage is conditional on mapped class-1 corn, not proof of coverage
of every survey-estimated corn hectare.

## D. Weather coverage and cell accounting

All states have all three fields and all 14 dates. Missing weather cells with
mapped corn = **0** and missing-value dates = **none** in each state. Exact
coverage ratios are retained without normalization; rounded 100% below is
sub-m² geometric accumulation noise, not imputed weather.

| State | Reporting cells | Cells with corn | Native weather cells with corn | Joint coverage |
| --- | ---: | ---: | ---: | ---: |
| IA | 2,340 | 1,896 | 9,281 | ≈100% |
| IL | 2,870 | 1,897 | 8,958 | ≈100% |
| NE | 3,362 | 2,420 | 10,272 | ≈100% |
| MN | 4,884 | 2,285 | 10,773 | ≈100% |
| IN | 1,674 | 1,257 | 5,806 | ≈100% |
| SD | 3,243 | 2,242 | 9,851 | ≈100% |
| KS | 2,960 | 2,718 | 12,253 | ≈100% |
| OH | 2,016 | 1,403 | 6,390 | ≈100% |
| MO | 3,819 | 2,200 | 8,801 | ≈100% |
| WI | 3,132 | 1,841 | 8,480 | ≈100% |

Coverage is Y/X: X = mapped corn area; Y = mapped corn area with complete
weather. No production weights, yield multiplier, stage fraction, extrapolation
or rescaling of uncovered area. Coverage outliers: **none in this period**.
This result does not guarantee coverage in future source vintages/windows.

## E. Level A versus Level C

First compare the existing representative **coordinate** with its gridMET
cell, using the same provider/window as Level C. This isolates spatial
sampling rather than mixing NASA POWER/gridMET product differences.

| State | Point rain mm | Corn-area mean rain mm | Point − area mm | Tmax daily-mean difference °C | Cell-period-max Tmax difference °C |
| --- | ---: | ---: | ---: | ---: | ---: |
| IA | 73.60 | 33.74 | +39.86 | −0.68 | −0.24 |
| IL | 116.90 | 81.33 | +35.57 | +0.07 | +0.87 |
| NE | 36.50 | 37.83 | −1.33 | −0.55 | −0.64 |
| MN | 37.30 | 42.73 | −5.43 | +0.48 | +1.34 |
| IN | 185.00 | 104.61 | +80.39 | +0.21 | −0.62 |
| SD | 35.10 | 42.31 | −7.21 | −1.13 | −0.83 |
| KS | 35.60 | 50.65 | −15.05 | +1.42 | +1.59 |
| OH | 63.30 | 83.77 | −20.47 | −0.30 | −0.76 |
| MO | 113.40 | 88.21 | +25.19 | −0.47 | −0.06 |
| WI | 48.20 | 53.58 | −5.38 | −0.22 | −0.14 |

Daily-mean Tmax = each native cell's mean daily Tmax over 14 days, then
corn-area weighted. Cell-period-max Tmax = each cell's maximum across 14
days, then area weighted; it is **not** the maximum of the statewide mean.
Tmin daily mean and cell-period minimum are also in the artifact.

Actual retained **NASA POWER UTC Level A** point rainfall, compared separately:

| State | POWER point mm | POWER point − gridMET area mean mm |
| --- | ---: | ---: |
| IA | 42.30 | +8.56 |
| IL | 96.68 | +15.35 |
| NE | 40.52 | +2.69 |
| MN | 41.00 | −1.73 |
| IN | 117.58 | +12.97 |
| SD | 62.48 | +20.17 |
| KS | 34.63 | −16.02 |
| OH | 75.58 | −8.19 |
| MO | 101.89 | +13.68 |
| WI | 49.76 | −3.82 |

All five POWER metrics, source identities and differences are retained in
each state summary. These are **not pure spatial errors**: provider/support
and UTC versus gridMET 07UTC day boundaries differ. Iowa's reference 73.6 mm
is the gridMET point, not its POWER 42.3 mm measurement.

No arbitrary “material difference” threshold is introduced. The ten observed
differences answer that question descriptively: rain absolute difference
**1.33–80.39 mm**, median **17.76 mm**; Tmax daily-mean **0.067–1.421°C**,
median **0.475°C**; cell-period maximum **0.063–1.590°C**, median **0.699°C**.
Tmin daily-mean median absolute difference **0.236°C**, period-minimum
**0.451°C**. Rain is particularly different in Indiana/Iowa/Illinois, and
comparatively close in Nebraska for this period. Temperature differences are
not uniformly negligible, particularly Kansas/South Dakota/Minnesota.

Do **not** compare mm and °C numerically or infer statistical significance.
As a dimensionless diagnostic, median absolute difference divided by each
state's spatial P10–P90 range is rain **0.214**, Tmax daily mean **0.234**,
Tmax period maximum **0.251**. Thus this sample does **not** demonstrate
systematically greater precipitation disagreement on every comparable scale.
It does show localized rain heterogeneity that one point can miss. Level C
has a better-defined mapped-area target, not independently established better
meteorological accuracy or crop-impact prediction.

## F. Spatial heterogeneity

Area-weighted empirical P10/P50/P90, min/max and P90−P10 characterize native
weather-cell distributions. No hazard classification or artificial confidence.

| State | Rain P10–P90 mm | Rain P90−P10 mm | Tmax daily-mean P90−P10 °C | Tmax period-max P90−P10 °C |
| --- | ---: | ---: | ---: | ---: |
| IA | 10.6–75.7 | 65.1 | 1.70 | 1.70 |
| IL | 43.2–127.0 | 83.8 | 2.99 | 3.10 |
| NE | 15.3–60.0 | 44.7 | 2.60 | 2.90 |
| MN | 18.4–78.5 | 60.1 | 1.88 | 3.30 |
| IN | 70.5–145.6 | 75.1 | 3.36 | 4.30 |
| SD | 13.5–72.9 | 59.4 | 2.57 | 2.60 |
| KS | 16.3–108.0 | 91.7 | 3.91 | 4.90 |
| OH | 53.0–114.6 | 61.6 | 0.96 | 1.50 |
| MO | 42.4–137.6 | 95.2 | 2.36 | 1.40 |
| WI | 23.1–100.1 | 77.0 | 1.40 | 3.20 |

Percentiles are area-weighted discrete quantiles, not quantiles of ten state
means, independent field observations or common-grid smoothing.

## G. Ten-state aggregate

Label: **Ten-state Corn Belt mapped-corn summary / 十州玉米带玉米制图面积汇总**.
Never “US national corn exposure.”

- Total mapped area: **27,407,296.53 ha**.
- Joint-valid area: **27,407,296.52998835 ha**.
- Raw coverage: **0.9999999999995749**, effectively 100%; residual ≈0.1165 m².
- 30,300 state-partitioned reporting cells; 20,159 contain corn.

| Native-support statistic | Corn-area mean | P10 | P50 | P90 |
| --- | ---: | ---: | ---: | ---: |
| 14-day accumulated precipitation, mm | 57.33 | 16.70 | 48.70 | 108.70 |
| Daily Tmax temporal mean, °C | 27.29 | 25.30 | 26.84 | 29.77 |
| Cell-period maximum Tmax, °C | 33.09 | 29.35 | 33.25 | 36.05 |
| Daily Tmin temporal mean, °C | 15.96 | 14.21 | 15.69 | 18.13 |
| Cell-period minimum Tmin, °C | 11.22 | 8.55 | 10.95 | 14.15 |

Combine native-cell distributions and their nonduplicated crop-area weights;
do not average state means equally or average their quantiles. No USDA
production/yield weighting and no weather-screen/crop-stage multiplier.

## H. Measured performance and reproducibility

Measured locally on macOS arm64 / Python 3.12 with Iowa's pinned isolated
geospatial libraries. The benchmark is **not an actual GitHub runner test**.
Downloads were concurrency-4; geospatial work sequential, separate processes.
Volatile timing/memory measurements are separate from analytical JSON.

| State | Accepted inputs MB | Fresh download seconds¹ | Cold processing s | Warm processing s | Cold peak RSS MB | State summary bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| IA | 209.18 | 1.20 | 31.86 | 0.143 | 452.15 | 11,868 |
| IL | 247.12 | 159.69 | 31.55 | 0.161 | 480.31 | 11,969 |
| NE | 296.63 | 237.73 | 33.32 | 0.181 | 526.55 | 11,938 |
| MN | 424.07 | 432.50 | 32.18 | 0.244 | 711.49 | 11,960 |
| IN | 144.91 | 154.12 | 18.73 | 0.112 | 358.83 | 11,940 |
| SD | 284.75 | 251.78 | 28.16 | 0.174 | 569.87 | 11,944 |
| KS | 258.22 | 167.24 | 26.70 | 0.161 | 510.48 | 11,929 |
| OH | 174.79 | 136.83 | 17.15 | 0.126 | 400.44 | 11,953 |
| MO | 336.52 | 283.43 | 22.78 | 0.194 | 584.94 | 11,891 |
| WI | 271.18 | 125.85 | 22.31 | 0.174 | 487.01 | 11,930 |

¹ Sum of each state's accepted fresh requests, not parallel wall time. Iowa
raw data are reused; its fresh request is only official metadata. MB = 10⁶
bytes. Full per-state disk/time/byte measurements are in
`research/cornbelt-spatial-performance.json`.

| Whole experiment measurement | Observed |
| --- | ---: |
| Accepted state input bytes, including reused Iowa | 2.647 GB |
| Fresh state bytes retrieved this phase | 2.438 GB |
| Concurrency-4 acquisition wall time | 611.44 s |
| All ten weather subsets, three variables × 14 days | 15.269 MB |
| Native area / 45-pair nonduplication audit | 8.40 s |
| Final full geometry rebuild + combined analysis wall time | **267.84 s** |
| First / second annual-cache replay wall time | **4.50 / 4.46 s** |
| Cold maximum state-process RSS | 711.49 MB |
| Cold coordinator RSS | 109.49 MB |
| Warm maximum state-process / coordinator RSS | 167.77 / 107.38 MB |
| Annual cell/overlap/manifests, all ten | **12.087 MB** |
| Logical scratch bytes at final cold completion | 2.662 GB |
| Compact analytical artifact | **141,860 bytes** |

State/coordinator RSS are individual high-water marks, not a continuously
sampled simultaneous memory peak. Scratch is an end-of-run logical file-size
sum, not a continuous disk high-water measurement; it excludes the isolated
environment (the retained Iowa environment) and original Iowa-only derived
files. Warm runs benefit from local filesystem cache. These are not latency
guarantees or a cloud-cache restore benchmark.

The common 465,721-byte acreage report and an initial manual retrieval of it
are outside the state-download sum. Iowa CDL was not downloaded again. Package
installation/bootstrap and exploratory reference requests are not included in
the accepted acquisition benchmark. Exact raw inputs are retained externally;
temporary storage is not a durable scientific archive.

**Determinism:** final cold and both warm outputs are **byte-identical**:

- Analytical hash:
  `3cd4a9e0b80e09d1911d3bec44d2c891b4cc9c706a6f9384b70bab3ec5a49034`.
- Entire-file SHA-256:
  `a2ebf57ca17eb378918a0c4ec4ed9a7cbcb961dc9591525fa2ab1acc4938c103`.
- All ten annual caches reused in both warm runs; no downloads/reprocessing.
- Original Iowa runner was rerun against accepted Iowa inputs into a separate
  external output. That output is byte-identical to the preserved original:
  `b1cd12ac741e916d8f4e179658f09228b1061692e1b3ffae82935aa4f0327c6d`.
  Iowa's 5.284 Mha and 73.6 versus 33.7 mm behavior remains reproducible.

## I. Caching and incremental strategy

Implemented and tested: annual crop-area grid plus sparse crop/weather overlap
cache keyed by crop/boundary bytes, weather coordinates, grid and spatial code.
Artifact hashes and crop-area conservation guard reuse; changed weather
**values** do not rebuild geometry, but changed coordinates, crop/boundary
vintage or method do. Corrupt caches rebuild. Exact source-year/state and
accepted crop bytes are checked; no current-year mask substitution.

Recommended routine architecture (design only):

1. Once per crop year, prepare state crop-fraction grids and native-weather
   overlap weights; persist a verified compact annual package and provenance.
2. Revalidate/retrieve recent gridMET; maintain actual dates, missing masks,
   preliminary/revised release identities and per-state health.
3. Recompute compact summaries from static weights; refresh overlapping recent
   days because values can be revised. Do not treat cache/fetch clocks as
   publication or observation dates.
4. Publish only validated compact derived artifacts. Missing states retain
   their failure status, not reassuring zero or a fresh timestamp on stale data.

The research replay runner deliberately still requires raw CDL for hash
verification. Compact-only cache restoration, automatic recent-data refresh,
current-year unavailable/fallback-vintage policy and scheduling are future
production work, **not implemented in this phase**. A retrospective two-week
run does not validate a season-long service or a 1991–2020 baseline.

## J. Failure isolation

- Each state is processed independently. A nonzero subprocess result ignores
  any old successful weather summary for that state; other states continue.
- If verified annual crop area survives a weather failure, keep that crop
  denominator but count no valid weather support; overall coverage decreases.
- If a failed state's crop geography is unknown, **full-domain mapped area
  and coverage are null**. Known-area subtotal and explicitly conditional
  known-denominator coverage remain separate. Never normalize nine states to
  represent all ten.
- Complete-date failures do not choose another period; partial finite values
  preserve partial area coverage; no eligible data yields null weather stats.
- Duplicate masks/nonconserving areas reject combined replacement. Each valid
  state artifact remains available. Summary writes are atomic.

Tests include a mocked ten-subprocess run where Nebraska fails despite a
deliberately stale successful summary: nine correct states survive and
full-domain coverage remains unknown. This is a deterministic failure
experiment, not an invented real Nebraska outage.

A second **actual subprocess experiment** used an independent external fixture
with accepted files but deliberately omitted `NE/pr.nc`. Nine states succeeded;
Nebraska was `unavailable` with null weather area/statistics. Its verified
annual crop denominator remained known, and ten-state coverage decreased to
**86.0174%**, not 100%. Original raw inputs and the accepted repository summary
were preserved. This simulated outage does not describe source conditions in
the successful ten-state experiment.

## K. Compact artifact and provenance

`research/cornbelt-spatial-summary.json` contains:

- Stable state ID/name/status; mapped/valid/missing area and raw coverage.
- Cell/date coverage diagnostics and area validation (no forced matching).
- Five weather summaries: mean/P10/P50/P90/min/max.
- Existing point coordinate, actual gridMET cell centre, both provider-specific
  comparisons, source identities and day-definition caveat.
- CDL crop year/publication evidence, source/raw/content hashes, input URLs;
  weather period/variables/packing/edition, grid/method/annual-weight versions.
- State analytical hashes and combined contributing/unavailable states;
  verified boundary-union audit, independent native counts, implementation and
  runtime versions. Unknown publication timestamps remain null.
- Explicit local-stage insufficiency and bilingual non-impact interpretation.

No browser raw raster, full grid-cell JSON or sparse matrix. Existing Phase 1
`DataIssue` vocabulary/provenance semantics are reused; this is an offline
artifact, **not** a parallel production metadata/health service or registration.
No global change-set weather spam or existing live UI/data-source changes.

## L. Future map recommendation

Simplest honest next visualization: a **static raster image of 9 km reporting
cells**, colored by crop-area-weighted weather and marking missing support,
with a clearly labelled state-summary table. It must not imply local stage,
field-resolution weather, damage or national coverage. State-partitioned
border cells would first be combined by global grid ID using actual crop areas.

Estimated image budget: roughly **0.1–0.5 MB** for a modest resolution PNG/WebP;
not an implemented/benchmarked map. Approximately 20,159 corn-bearing state
cells as polygon JSON could reach several MB and need geometry simplification.
County aggregation would add another boundary methodology without improving
this task. Do not send the raw sparse matrix or invent a “damaged acreage” map.

## M. Files added and preserved

Added in this phase only:

- `research/cornbelt_spatial/config.json` — fixed scope, dates, grid, references.
- `research/cornbelt_spatial/acquire.py` — bounded acquisition and source evidence.
- `research/cornbelt_spatial/geometry.py` — shared lattice, exact intersections,
  validated annual static cache.
- `research/cornbelt_spatial/audit_boundaries.py` — native-count/state-union audit.
- `research/cornbelt_spatial/validate.py` — per-state metrics, provider comparisons,
  isolated orchestration and compact combined aggregation.
- `research/cornbelt_spatial/test_scaling.py` — 30 new offline regression tests.
- `research/cornbelt_spatial/README.md` — replay, cache and scientific boundaries.
- `research/cornbelt-spatial-summary.json` — deterministic analytical result.
- `research/cornbelt-spatial-performance.json` — measured performance/replay evidence.
- `docs/PHASE4B1_8_CORN_BELT_SCALING.md` — this assessment.

Previously untracked Phase 4B-1.6/1.7 reports, Iowa scripts and summary are
preserved. No tracked existing code/UI/data/workflow was modified. No commit,
push, deployment, production refresh or email performed. Raw/annual/per-cell
cache remains outside Git at `/private/tmp/wfl-cornbelt-2015.M11d2r`.

## N. Tests and build

- Complete existing suite: **203 JavaScript + 131 Python passed**, no failures.
- Original isolated Iowa suite: **17 passed**, unchanged.
- New isolated scaling suite: **30 passed**. Covers all-state aggregation,
  one-state failure/stale-summary rejection, unknown geography, partial weather
  and spatial support, area reconciliation/invalid weights, native-support
  percentiles, deterministic summaries, all-state provenance, dynamic-value
  static-cache reuse, geometry/crop changes, corrupt cache, shifted origins,
  retained static denominator, source-date/year guards, duplicate pixels,
  raw-cache rejection, POWER caveat and original Iowa artifact identity.
- Full accepted-input ten-state cold run and two warm replays: successful,
  byte-identical summaries; actual missing-NE-file experiment passes isolation.
- Original Iowa full replay: successful, byte-identical external output.
- Production build: **passed**, 715 modules, approximately 2m29s. Existing
  >500 kB chunk warnings remain; no unrelated bundle/UI refactor attempted.

Commands: `npm test`, isolated Python unittest discovery for each research
directory, `npm run build`, plus manual full/annual-cache and legacy replays.
Geospatial dependencies remain isolated; no production dependency added.

## O. Remaining scientific and operational limitations

- Local stage is **not independently observed at crop/weather resolution**.
  No local silking acreage or uniform allocation of statewide progress.
- CDL is classified mapped area, not exact surveyed/affected acreage; Missouri
  remains an unresolved planted-area discrepancy. Product-level classification
  accuracy is not field-level confidence or an acreage correction.
- Current-year map availability, original-time vintage eligibility and durable
  accepted-input preservation need production policies. This 2015 map cannot
  be passed off as an available contemporary monitoring mask.
- Native weather is a gridded estimate, not 30 m observations. Provider states
  it cannot resolve sub-grid microclimates, is semi-operational, and recent
  **60 days are preliminary and revisable**. Days use 07UTC boundaries.
  [gridMET provider](https://www.climatologylab.org/gridmet.html).
- One fixed 14-day period and ten states are diagnostic evidence, not all-year
  reliability, statistical significance, historical outcome accuracy or yield
  validation. Cross-provider differences are not pure spatial error.
- Local timing is not GitHub timing. Seasonal baseline generation, preliminary
  revision handling and compact-only annual cache restore are not validated by
  this experiment. Temporary storage is not a durable scientific archive.

## P. Explicit architecture/readiness decisions

| Question | Decision | Evidence/boundary |
| --- | --- | --- |
| A. Did Iowa scale across all ten states? | **Yes** | All ten process the same dates/year successfully; native area reconciles and state masks do not duplicate corn. |
| B. Ten-state joint coverage? | **≈100%; no state outliers** | Raw ratio 0.9999999999995749, conditional on mapped class-1 area, not surveyed acreage. |
| C. How often is a point materially different? | **Descriptive differences, no posthoc cutoff** | Rain absolute differences 1.33–80.39 mm; Tmax daily-mean 0.067–1.421°C. Every state's actual difference is listed in E. |
| D. Is gridMET operationally suitable? | **Yes, with caveats** | Usable bounded requests/coverage; semi-operational service, preliminary revisions, day boundaries, sub-grid limits and source-vintage health remain necessary. |
| E. Can Actions run routinely? | **Yes, with preprocessing/caching** | Measured local footprint fits standard runner resource specifications; actual Linux runner benchmark and compact-only static-cache restore still required before production activation. |
| F. Should Level C become primary? | **Yes for selected variables** | Prioritize mapped-area precipitation/distribution monitoring; also retain spatial temperature summaries where their support matters. Keep Level A as a diagnostic, not silently relabel it Level C. No meteorological truth/impact accuracy claim. |
| G. Ready for Phase 4B-2? | **Yes, but only for selected hazards** | Architecture can support explicitly stage-unresolved weather-screen research. Not stage-specific exposed acres/damage; operational activation must first complete production vintage/cache/revision safeguards. No hazard expansion implemented here. |
| H. What next? | **Productionize Level C spatial pipeline** | Verified annual package, explicit available/fallback crop year, recent-weather revision retrieval, actual Actions dry-run and durable compact provenance before new operational hazard logic. |

Actions feasibility is an **inference**, not a completed CI measurement.
Current official standard Linux specifications include 14 GB SSD and 8 GB RAM
for private repositories / 16 GB for public repositories, above this local
experiment's observed requirements. Cold source bandwidth still makes annual
preprocessing preferable. [GitHub runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Stop here: **no Phase 4B-2, EDD, VPD, wetness, compound hazards, new thresholds,
local crop-stage allocation, production weights, yield modeling, alert,
interactive map, database, cloud migration, deployment or email**.
