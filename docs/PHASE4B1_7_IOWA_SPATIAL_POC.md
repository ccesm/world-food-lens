# Phase 4B-1.7 — Iowa 14-day spatial intersection proof

Date: 2026-10-05. Baseline: `main`, `951cdc6`. **Offline research only.**

结论：已实际完成当年玉米地图与天气网格的面积交叠计算。可以识别“玉米制图面积上的天气”，不能识别受灾面积，也没有当地生育期百分比。单点降雨明显偏离本期面积加权分布；这不是减产预测或预测精度验证。

The previous Phase 0–4B-1 methods, historical artifacts and live behavior are
unchanged. The previously untracked Phase 4B-1.6 report is preserved. No commit,
push, deployment, production refresh, notification or email was performed.

## A. Pilot scope

- Iowa (`US-IA`), class-1 corn, **2015-07-01 through 2015-07-14** inclusive.
- The preceding feasibility study proposed these dates before this experiment.
  They were frozen before weather distributions or acreage/outcomes were
  inspected; all three required weather fields subsequently passed complete-date
  checks. No extreme-event selection, yield evaluation or holdout tuning.
- Method: `iowa-mapped-corn-weather-intersection/1`. It does not replace either
  legacy corn method. The 2015 map is post-season retrospective geography, not
  information available during July 2015.
- No progress/condition grid was needed for this geometric test. Local stage
  eligibility is explicitly insufficient; no stage-area multiplier is applied.

## B. Data sources

| Input | Role | Actual accepted subset |
| --- | --- | --- |
| USDA NASS Iowa 2015 CDL | Crop classification | Native state-clipped GeoTIFF, 207,781,072 bytes |
| University of Idaho gridMET | Tmax, Tmin, precipitation | Three classic-NetCDF subsets, 14 × 85 × 167 each |
| Census 2015 generalized state geometry | Independent boundary/padding audit only | One Iowa polygon, 108,338 bytes |
| Existing retained NASA POWER Iowa point | Legacy reference, no new retrieval | Same 14 dates extracted from preserved historical input |
| USDA NASS Iowa AgriNews | Official planted-acreage comparison only | January 21, 2016 publication; no outcome calibration |

Primary references: [CDL metadata](https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_ia15.htm),
[CDL state file](https://nassgeodata.gmu.edu/webservice/nass_data_cache/byfips/CDL_2015_19.tif),
[gridMET provider](https://www.climatologylab.org/gridmet.html),
[2015 Tmax attributes](https://thredds.northwestknowledge.net/thredds/dodsC/MET/tmmx/tmmx_2015.nc.das),
[Census boundary service](https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2015/State_County/MapServer/7),
[NASS acreage report hosted by Iowa](https://publications.iowa.gov/21433/1/AgriNews02_2016.pdf).
Exact requests and raw hashes are retained in external `acquisition.json`;
the compact summary also records crop/weather URLs and input versions.

## C. CDL processing method

Use class **1**, excluding sweet/popcorn and compound-corn classes. Native
resolution is **30 m**; CRS is NAD83 Conus Albers (EPSG:5070 equivalent).
The raster is 17,795 × 11,671, bounds in metres
`[-52095, 1938165, 481755, 2288295]`, north-up, one uint8 band. It has no nodata
tag; code 0 is background/unclassified, not measured non-corn. Official
metadata states whole-state coverage and publication date **2016-02-12**;
the current file's HTTP modification in 2017 is not promoted to publication.
[2015 classification metadata](https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_ia15.htm).

Read 300 × 300-pixel windows, not a whole decoded raster or a weather calculation
per crop pixel. Sum class-1 pixel areas at 900 m² each. No categorical
interpolation, majority resample, yield weighting or acreage calibration.
Crop-data coverage retains nonzero classified area separately from corn area.

The metadata's corn producer/user accuracies are 98.54%/98.86%, product-level
validation statistics, not guarantees for individual fields or an exposure
confidence score. Map classification, grain/silage definitions and unclassified
land remain limitations. The crop mask is the official state-clipped product;
the generalized Census boundary does not overwrite that crop definition.

## D. gridMET processing method

Native coordinates are EPSG:4326, spaced **1/24 degree**, approximately 4.6 km
north–south and 3.4 km east–west in Iowa. The bounding-box subset extends beyond
the crop footprint; extra weather cells carry no crop-area weight.

Validate CRS, axis order, uniform coordinate increments, all 14 ordered dates,
identical geometry across variables, missing codes, units and physical sanity
ranges. Tmax/Tmin are packed Kelvin (scale 0.1, offset 220); precipitation is
packed millimetres (scale 0.1, offset 0). Fill 32767 is masked before unpacking.
Convert temperature to Celsius; never convert missing to zero.

Provider days correspond approximately to periods ending 07:00 UTC the next
calendar day: the selected interval is approximately July 1 07UTC–July 15 07UTC.
POWER's UTC-day interval differs by seven hours. The retained source note
documents this distinction. The weather file's edition text `04 July 2019`
does not establish an exact official publication timestamp or July 2015
real-time availability. [Provider file attributes](https://thredds.northwestknowledge.net/thredds/dodsC/MET/tmmx/tmmx_2015.nc.das).

The server's `accept=netcdf4` returned HTTP 500/HDF error; `accept=netcdf`
successfully returned bounded classic-NetCDF subsets. No full annual national
weather file or replacement provider was used.

## E. Common-grid definition

- CRS EPSG:5070; 9,000 × 9,000 m cells; nominal area 81,000,000 m².
- Fixed upper-left origin `(-52095, 2288295)`, inherited from the actual native
  Iowa 2015 CDL and frozen in `ia-2015-cdl-aligned-9km/1`.
- 60 columns × 39 rows = **2,340** cells; **1,896** contain mapped corn.
- IDs `US-IA-2015-9km-rRR-cCC`; exact row/column direction retained.
- Last row/column retain full nominal cell area and partial input coverage;
  no padding is invented as valid classified crop data.

This is a reporting lattice, not a claim of independent 30 m weather. Native
weather support is preserved. It is deliberately not asserted to match USDA
progress-grid origins. Scaling must generalize the frozen domain adapter
without silently snapping nonmatching source origins.

## F. Crop-area intersection method

1. Construct each native gridMET cell from coordinate centres ±1/48 degree.
2. Densify each edge into 16 geographic segments, then project to equal-area
   coordinates once. Adjacent footprints share the same transformed boundary.
3. For each common grid cell, find intersecting weather footprints.
4. Count fully interior corn pixels; for every touched polygon-edge corn pixel,
   compute its rectangle–polygon intersection area. Do not use centre-only or
   all-touched counts to determine boundary area.
5. Store a sparse common-cell × weather-cell corn-area matrix: **19,222**
   nonzero weights and **9,281** native weather cells with mapped corn support.
6. Evaluate screening conditions at native weather resolution **before**
   aggregation. Area-weight temperature summaries and rainfall depths by actual
   corn overlap; do not spatially sum rainfall depths or average weather first
   to determine a nonlinear screening condition.

Area conservation residual is about **0.005 m²** over 52.84 billion m²,
floating-point geometry noise, not an observed weather gap. No weights were
renormalized to match total corn area. Nine outcome-independent coordinate
checks across Iowa found a maximum weather-footprint area difference of
**0.00154 m²** when doubling edge segments to 32. This checks geometric
approximation, not weather accuracy or datum precision.

The temporary cell table includes nominal area, corn area/fraction,
classified-data coverage, boundary diagnostic, full-window weather coverage,
screen-overlap area, weather summaries, input versions and eligibility.
Raw rasters and this detailed table are not Pages assets.

## G. Coverage and denominator semantics

| Quantity | Definition | Observed result |
| --- | --- | ---: |
| X | Total class-1 mapped corn area | 52,840,406,700 m² / 5,284,040.67 ha |
| Y | Mapped corn with all Tmax/Tmin/rain observations valid for 14 days | 52,840,406,699.995 m² |
| Z | Joint-valid mapped area meeting demonstration screen | 0 m² |
| Y/X | Full-window mapped-area weather coverage | Effectively 100%; raw ratio 0.9999999999999054 |
| Z/Y | Conditional overlap among weather-covered mapped area | 0% |
| Z/X | Known screened contribution to target mapped area | 0% |

The denominator is **mapped class-1 Iowa corn**, not all actual corn acreage,
official planted acreage, national crop area or production. No observed missing
weather cells/dates occurred over mapped corn. A partial input would reduce Y,
not redefine X; no weather-supported area gives null overlap, not zero.

There are approximately **14.90 km²** of code-0 pixels inside the generalized
Census footprint. This is exposed as possible boundary disagreement/unknown
classification, not guessed corn or proven missing crop area. The official CDL
mask and separate census geometry are not identical measurement systems.
Missing crop geography would make a whole-domain actual-crop percentage
unavailable; this POC reports a validated complete-file **mapped-area** subtotal.

## H. Representative-point comparison

The legacy Iowa coordinate is 42°N, 93.5°W. Its native gridMET cell centre is
41.983333°N, 93.516667°W. Comparing the same provider isolates sampling from
provider differences:

| 14-day statistic | gridMET at legacy coordinate | Corn-area-weighted gridMET |
| --- | ---: | ---: |
| Period maximum Tmax | 32.95°C | Mean of native-cell period maxima 33.19°C |
| Period minimum Tmin | 11.05°C | Mean of native-cell period minima 10.56°C |
| Total precipitation | 73.60 mm | 33.74 mm |
| Demonstration screening | Not flagged | 0% joint-covered mapped area |

The point's rain is **39.86 mm above** the mapped-area mean and near the spatial
P90, not a representative statewide crop-area mean in this window. Temperature
is closer to the area-weighted mean. No heat classification difference was
demonstrated in this quiet period. Neither method is declared meteorologically
correct, and no predictive-performance improvement is claimed.

The preserved POWER UTC reference has maximum Tmax 33.00°C, minimum Tmin
11.74°C, rain 42.30 mm and no temperature demonstration flag. Its difference
from gridMET also contains provider/grid/day-boundary differences; it is not
attributed entirely to spatial weighting. The original stage-gated Level A
method was not silently replaced or recomputed as a gridMET method.

## I. Area validation

Mapped class-1 corn: **13,057,148.85 acres**. The official 2015 all-purpose
planted-corn reference is **13,500,000 acres**, published in NASS Iowa AgriNews
Vol 16-02 on **January 21, 2016**. Difference: **−442,851.15 acres (−3.2804%)**.
[Official acreage evidence](https://publications.iowa.gov/21433/1/AgriNews02_2016.pdf).

This is an informative scale check, not proof that every crop pixel is right.
Survey planted acres and map classification differ in measurement, crop
universe, classification omissions/commissions, boundary treatment and acreage
estimation. No scalar correction or mask tuning was applied, and no yield or
condition outcome was used to select geography, dates or thresholds.

## J. Spatial diagnostics

These statistics use native weather-cell corn-area weights. Percentiles are
weighted empirical quantiles, not independent field observations:

| Statistic across covered corn | Mean | P10 | P50 | P90 | Range |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native-cell 14-day maximum Tmax, °C | 33.19 | 32.35 | 33.15 | 34.05 | 31.25–35.55 |
| Native-cell 14-day minimum Tmin, °C | 10.56 | 9.05 | 10.25 | 12.45 | 7.65–14.75 |
| Native-cell 14-day rainfall, mm | 33.74 | 10.60 | 24.10 | 75.70 | 3.50–150.00 |

Common-cell rainfall means preserve the **same statewide mean** 33.74 mm,
with P10/P50/P90 10.72/24.19/74.70 mm. Native and reporting-grid distributions
are distinct. Daily Tmax/Tmin/rain statistics and actual covered area are in the
compact JSON. No static map was necessary; no frontend architecture was added.

## K. Performance and storage results

Measured on local macOS arm64, Python 3.12, pinned geospatial dependencies.
These are bounded local observations, not a GitHub runner benchmark:

| Work or artifact | Measurement |
| --- | ---: |
| Instrumented CDL download | 207.781 MB; 172.93 s |
| Weather download, each variable | ~0.403 MB; 0.81 / 0.85 / 0.67 s |
| Census boundary download | 0.108 MB; 1.09 s |
| Stable full geometry + aggregation run | Approximately 23 s |
| Peak resident memory | Approximately 452 MB (431 MiB) |
| Reuse-weight 14-day aggregation, excluding load/I/O | 0.016 s |
| Raw + derived scratch, excluding environment | Approximately 212.22 MB |
| Detailed temporary cell JSON | 2.94 MB |
| Sparse overlap matrix | 0.174 MB |
| Compact repository summary | 23,807 bytes |
| Isolated environment | Approximately 287 MiB disk |

Cold provisioning, package transfer, HTTP retries and exploratory requests are
not included in processing time. An initial manual CDL retrieval preceded the
instrumented collector, so this study transferred the 208 MB file twice; the
table is a **single accepted acquisition**, not cumulative session bandwidth.
The first concurrent run also included an in-flight download in its scratch
count; stable measurements above exclude that transient duplication.

Raw/derived files remain at `/private/tmp/wfl-iowa-2015.wMmAbZ`, outside Git.
They are intentionally retained for replay. Exact cleanup/preservation guidance
is in the research README; no automatic broad deletion is performed. This
temporary cache is not durable storage, and losing it loses exact raw replay.

## L. Scientific interpretation and data health

**Crop-area weather-screen overlap / 玉米制图面积—天气筛查交叠** means a mapped
location overlapped the specified native-grid weather condition, nothing more.
It is not affected acreage, observed physiological stress, crop damage,
yield loss, production loss or a price signal.

The demonstration remains Tmax ≥35°C on ≥3 days in either fixed seven-day
half of this window. It is labeled **LEGACY / DEMONSTRATION TEMPERATURE-ONLY
SCREEN**, not the full stage-gated legacy pilot or a future primary hazard
model. No EDD, VPD, moisture proxy substitution, excess wetness, compound score,
new threshold or local phenology multiplication.

Existing Phase 1 `DataIssue` semantics are reused with concrete offline
diagnostics. Retrieval failures, invalid formats, missing dates/units, CRS
mismatch, spatial eligibility failure and partial weather coverage remain
distinct. Failed downloads retain old bytes; validation completes before
atomic summary replacement. Missing data never becomes reassuring zero.
This is not a new production metadata service/dataset registry.

Provenance includes year, evidenced date-only CDL publication, null unknown
publication times, original file and normalized weather hashes, coordinate
geometry/packing/day boundaries, boundary version, method/grid/code/library
versions, eligibility and observation period. Server translation clocks do not
change normalized weather identities. Current historical downloads are not
certified original-time releases. Local stage eligibility remains insufficient.

## M. Files created and unchanged boundaries

New this phase:

- `research/iowa_spatial/config.json` — frozen scientific configuration.
- `research/iowa_spatial/requirements.txt` — isolated, pinned dependencies.
- `research/iowa_spatial/spatial.py` — geometry, schema, area and coverage tools.
- `research/iowa_spatial/collect.py` — bounded external-cache downloads.
- `research/iowa_spatial/run.py` — offline intersection/summary producer.
- `research/iowa_spatial/test_spatial.py` — deterministic regression fixtures.
- `research/iowa_spatial/README.md` — replay, failures and cleanup instructions.
- `research/iowa-spatial-summary.json` — compact scientific result.
- This report.

No existing tracked application/service/component/source cache/workflow/test
file changed. `docs/PHASE4B1_6_LEVEL_C_FEASIBILITY.md` was already untracked
before this task and remains preserved. Raw TIFF/NetCDF/GeoJSON and sparse
matrices are not added to Git, release assets or Pages.

## N. Tests and reproducibility

- **17 new isolated Python tests passed**: class policy/nodata, exact partial
  boundaries, partition conservation, deterministic footprints, CRS/origin
  guards, reprojection, clipped/partial raster extent, native packing and fill
  masking, units/dates/corrupt input, missing weather, native-screen-before-mean,
  no-corn cells, X/Y/Z partial coverage, null unavailable overlap, provenance,
  failed-download retention, failed-summary validation retention and external
  cache enforcement.
- Complete existing suite passed: **203 JavaScript + 131 Python tests**.
- Production build passed, 715 modules; existing large-chunk warnings remain.
  No bundle refactor was attempted.
- Two full final-code executions against identical retained inputs produced
  byte-identical compact JSON, checked by SHA-256. Scientific analysis hash:
  `3d9c8f11a9bdb1374494376d16fe02d02b307fdee3d3b545f882b7ad05a39d4a`.
- Summary-file hash:
  `b1cd12ac741e916d8f4e179658f09228b1061692e1b3ffae82935aa4f0327c6d`.

Timings and retrieval clocks stay outside deterministic scientific JSON. Exact
bytes on a different library/platform combination have not been tested;
versions are retained and geometry equivalence should be checked, not assumed.
No frozen historical research pipeline/artifact was overwritten.

## O. Scaling estimate — not an implemented 10-state pipeline

For ten **Iowa-sized 30 m domains**, one-time crop/overlap preparation would
suggest ~2.1 GB crop transfer and ~4 minutes local geometry CPU/wall work.
At this measured CDL transfer rate, serialized crop downloads alone suggest
~29 minutes. Actual states, compressed formats, source throughput and retries
differ, so plan **minutes to tens of minutes for preparation**, not a promise
that cold setup fits the current daily workflow. Larger/10 m products can be
materially heavier; this pilot rejects 10 m rather than claiming it is tested.

For an April–November 244-day season, three-variable weather storage scales
arithmetically to ~21 MB per Iowa rectangle / ~210 MB for ten equal rectangles
in this packed subset format. Different bounds/headers/retrieval granularity
can increase this; use an initial **0.2–0.6 GB seasonal weather-input budget**,
then benchmark actual domains. Ten 244-day float64 rectangles would occupy
about 0.83 GB decoded if held together; process date/state chunks instead.

Sparse weights are reused once per mask/grid edition, not rebuilt every day.
The measured 0.016 s aggregation excludes retrieval, validation, serialization,
revision tracking and durable archive I/O. These operational costs, reliable
subsetting and accepted-vintage retention dominate a future daily job.
Store only compact summaries in Git/Pages; keep masks/weights/accepted weather
inputs externally. No full-season backfill, baseline or production storage
infrastructure was implemented or benchmarked here.

## P. Final Level C recommendation — required scientific answers

| Question | Answer | Evidence boundary |
| --- | --- | --- |
| A. Reliably identify weather over mapped Iowa corn? | **Yes, with material limitations** | Real area-conserving crop/weather intersection; classified map and modeled native weather, not field observations |
| B. Improve on one representative point? | **Moderately** | Clearly improves area support and reveals rainfall heterogeneity in this window; no changed heat classification or proven predictive improvement |
| C. Can it be called crop-area exposure? | **Only “crop-area weather-screen overlap”** | Area, provider, period, screening rule and coverage must accompany it |
| D. Affected acreage? | **No** | No damage, local stage, management or causal loss evidence |
| E. Primary remaining spatial limitation? | **Local stage information** for stage-specific agricultural interpretation | Crop/weather location is now intersected, but local phenology is still unidentified; weather resolution/classification also limit field precision |
| F. Worth extending to ten-state Corn Belt? | **Yes, after one limited correction** | Generalize the frozen Iowa domain/mask adapter while preserving exact crop-area conservation for differing origins/extents; validate each state's coverage before operational use |
| G. Proceed to Phase 4B-2 hazards now? | **Yes, after scaling Level C** | First validate shared-lattice/domain handling and reusable weight provenance; stage-specific claims remain separately gated |

The next justified task is a bounded scaling/adapter validation, not a full
production deployment or additional hazards in this phase. Keep annual map
preparation separate from incremental weather ingestion. No public product
should describe synthetic progress as local stage acres, or mapped weather
overlap as damaged crops. **Stop after this Iowa proof of concept.**
