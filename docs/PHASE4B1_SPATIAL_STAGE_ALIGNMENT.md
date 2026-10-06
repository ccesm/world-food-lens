# Phase 4B-1 — US Corn Spatial × Stage Alignment

Date: 2026-10-05. Scope: input alignment and screening semantics only. No new hazards, parameter selection, holdout inspection, deployment or email. Baseline checkpoint: `42c55f6` (Phase 0–4B-0). The pre-existing local historical input archive is preserved without changing its bytes and is included for offline reproduction.

## A. Previous spatial model

Legacy methodology: `us-corn-point-exposure/v1`. The frozen implementation, configuration and Phase 4A result remain unchanged. `corn-history/1` remains reproducible. The existing eight replay-source hashes are checked in tests.

| State | Stable new unit | Legacy POWER request coordinate | 2025 grain production, 1,000 bu | Share of national production |
| --- | --- | --- | ---: | ---: |
| Iowa | US-IA/maize | 42, -93.5 | 2,772,000 | 16.286% |
| Illinois | US-IL/maize | 40.5, -89 | 2,354,000 | 13.830% |
| Nebraska | US-NE/maize | 41, -98 | 2,027,300 | 11.911% |
| Minnesota | US-MN/maize | 44, -95 | 1,698,450 | 9.979% |
| Indiana | US-IN/maize | 40, -86 | 1,066,920 | 6.268% |
| South Dakota | US-SD/maize | 44, -97.5 | 1,085,850 | 6.380% |
| Kansas | US-KS/maize | 39, -98 | 942,500 | 5.537% |
| Ohio | US-OH/maize | 40.5, -83.5 | 584,600 | 3.435% |
| Missouri | US-MO/maize | 39, -92 | 677,100 | 3.978% |
| Wisconsin | US-WI/maize | 43.5, -89.5 | 605,360 | 3.557% |

Values are the accepted local NASS annual snapshot, observation year 2025, publication 2026-01-12, national grain production 17,020,549 thousand bushels. They are reference weights, not a 2026 production forecast. Ten states cover 81.1612%; the remaining 18.8388% is not covered. Coordinates are **inherited representative requests**, not verified crop-production centroids.

Crop Progress and crop condition enter as **state aggregates** from weekly NASS reports. Condition is a separate five-category acreage assessment; good + excellent is not a weather damage observation. Progress contains planted, emerged, silking, dough, dented, mature and harvested where reported. Neither dataset identifies the fields surrounding the weather point. The [NASS survey description](https://data.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Crop_Progress_and_Condition/index.php) describes weekly Sunday observations and publication on the first business day; state-level estimates do not identify a within-state crop/weather intersection.

Legacy stage handling uses south/central/north calendar templates plus explicit official endpoints or mixed-stage information. It applies the selected report's endpoints on some weather dates and uses calendars on others. A 50%-attainment milestone is not a binary observation that the entire state occupies that stage.

Legacy weather uses UTC daily POWER Tmax, Tmin, corrected precipitation and modeled root wetness. Seven-day quantities are compared to **the same request point**, same ending month/day, seven-day windows in each year of 1991–2020 (30 samples). February 29 lacks a full matched normal and is unavailable. A uniform release-relative weather window ends four days before evaluation. The fixed baseline is retrospective for early historical seasons.

**Unobserved overlap assumptions:** a point can represent state weather; state acreage progress applies near that point; prior-year grain-production importance represents the present crop; within-state progress acres can be assigned equal production importance. None proves that a field in a sensitive stage experienced the point's weather. Historical Iowa east/west diagnostic points were not an adopted multi-point sampling scheme and remain research-only.

## B. Authoritative spatial source assessment

These are source/design assessments, not new integrations or guarantees of current county completeness. Public statistical products can be accessed without connecting any personal account. Redistribution and source attribution should follow each product's metadata; no new licensed/private source is used here.

| Candidate | Resolution / cadence / history | Access, stability and burden | Suitability / decision |
| --- | --- | --- | --- |
| Existing NASS annual production + harvested area | State; completed-year annual releases and revisions; archived prior-year vintages already collected for 2012–2019 | Existing public ESMIS text adapter, accepted raw hashes and canonical metadata; low incremental burden | Retain national production shares. Published area could support a separate area metric, but does not locate corn within a state |
| NASS county grain production / harvested acreage via Quick Stats | County/available agricultural district, usually annual; series/program coverage varies by location and year | Public query/download tools, API registration/key where applicable; suppressed or missing counties, changing publication coverage and revisions require explicit handling. County boundary/identifier crosswalk needed; moderate burden | Best next maintainable production-geography upgrade, after completeness/vintage checks. Missing counties must not inherit average yields or be silently normalized |
| Census of Agriculture | County and state, five-year snapshots; historical censuses | Public tables and geographic downloads; stable administrative IDs but release lag and disclosure suppression. Moderate once-per-vintage processing | Useful fallback/benchmark, not current-season crop distribution or weekly stage evidence |
| Cropland Data Layer (CDL) | Annual classified crop grid; national CONUS since 2008; 30 m legacy and 10 m recent products | Public domain/free redistribution with provider disclaimers. GIS processing, classification error, crop-class semantics and annual release vintages needed. Full 2025 national downloads are 9.8 GB at 10 m or 1.9 GB resampled to 30 m | Useful future crop-area/weather intersection; do not process national rasters in every daily Actions job. Prior-year CDL is a map proxy, not current-year truth; current-year post-season maps introduce look-ahead if backcast |
| NASS gridded progress / condition | Weekly synthetic sub-state grid; archive from 2015, not all 2012–2019 seasons | Public files and metadata; confidential county reports are transformed into synthetic fields, not observed field stage maps. Additional GIS/vintage integration burden | Investigate later, but **not** an automatic Level C upgrade. Corn progress index averages seven cumulative milestones; it cannot uniquely recover those seven percentages or exact pollination occupancy |

Primary documentation: [Quick Stats](https://data.nass.usda.gov/Quick_Stats/), [Census](https://data.nass.usda.gov/AgCensus/index.php), [CDL metadata/FAQ](https://data.nass.usda.gov/Research_and_Science/Cropland/sarsfaqs2.php), [CDL download releases](https://www.nass.usda.gov/Research_and_Science/Cropland/Release/), [gridded progress metadata](https://data.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/metadata/metadata_CropProgress.htm).

Weather options:

| Option | Practical consequences | Decision |
| --- | --- | --- |
| Existing one POWER point/state | Daily API already integrated, historical data since 1981 covers the existing normal; no additional calls or credentials. Still coarse and model-derived, with delivery lag and later revisions | Retain now; improve evidence/time semantics without changing provider or thresholds |
| Multiple POWER points/state | Improves representativeness only if selection/weights follow agriculture. Each distinct point requires its own 1991–2020 normal and cached history. Nearby requests can duplicate the same native meteorological grid cell | Defer until county-production weights and deterministic crop-relevant sampling are validated. Do not invent equal weights or add cities |
| Production-weighted zones/points | Maintains a bounded number of requests; needs authoritative county/geography vintage, missing-weight diagnostics and crop-relevant coordinates | Preferred intermediate upgrade after county ingestion |
| Weather grids × crop pixels | Better crop-area intersection; nonlinear screens must be evaluated on weather cells before weighting. Raster alignment, crop masks, fixed normals and immutable vintages increase processing/storage requirements | Future Level C; daily point requests for every CDL pixel would be wasteful and brittle |
| NOAA nClimGrid-Daily | US daily Tmax/Tmin/precipitation from 1951; does not supply the existing POWER root-wetness variable. Switching the rain/temperature product requires new comparable normals and provider-specific QA | No switch in this phase; it would confound spatial-stage changes with measurement changes |

[POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) supports point and regional requests and explicit UTC (default time standard is not assumed). [POWER API guidance](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/) describes native meteorology around 0.5 × 0.625 degrees and warns against finer duplicate requests/excess concurrency. [NOAA nClimGrid-Daily](https://www.ncei.noaa.gov/products/land-based-station/nclimgrid-daily) documents the alternative variables/history. No new runtime API reliability claim is made: this phase makes **zero additional external data requests** beyond documentation research. Current GitHub Actions volume/latency and existing normal collection are unchanged.

## C. Selected spatial methodology

New version: **`us-corn-spatial-stage-screen/1`**, stored alongside, not instead of, the legacy artifact. Level **A: state-level representative screening**. Level B requires multiple agriculturally justified samples with explicit support weights; Level C requires corn-area/weather intersection. Neither is claimed.

`cornAlignment.json` specifies stable `US-{state}/maize` units, country/state geography, crop, immutable request coordinates and a sampling version. Each output unit records production weight, sampling method, source versions, daily stage editions, eligible weather/normal, missing reasons and coverage flags. The agriculture meaning is an official corn-producing **state**, not an arbitrarily drawn zone. No field/acreage footprint is assigned to a point.

## D. USDA progress semantics

The [NASS definitions](https://www.nass.usda.gov/Publications/National_Crop_Progress/terms_definitions.php) describe percentages related to acres, with an acre generally counted at/beyond a milestone when at least half its plants are there. Thus 80% silking and 45% dough are overlapping cumulative attainment, not 125% of crop or two exclusive fractions.

Validate reported integer percentages in [0,100], known milestone keys and non-increasing cumulative order within the **same report, state and crop**. Reject impossible/inconsistent input, do not clamp it. Missing remains missing. Do not mix stages across reports. Condition categories remain separate.

The current cache does not certify the progress acreage universe as grain-only, whereas production weights explicitly concern corn harvested for grain. Applying the two is an **additional screening assumption**, not a proven common area denominator. No direct acre conversion is offered. Cross-week corrections may be genuine; this method does not force a monotonic historical development curve through revisions.

## E. Temporal alignment

For each UTC weather day `d`, select the most recently published edition with `publishedDate < d` and `weekEnding <= d`. Same-day reports are excluded because date-only evidence does not prove they were available before the day's weather. Normally Monday's report first applies on Tuesday; Monday continues using the previous report.

Hold the selected report for **at most seven days since its publication date**, then mark it stale. This is a weekly availability convention, not a claim of observed daily physiology. Using seven days since Sunday observation would create a systematic Monday gap; publication-based hold avoids that artificial gap. Observation and publication dates remain separately visible. A normal Monday report can therefore be held eight days after its Sunday observation; delayed publication can increase that age. No interpolation, backcast from next Sunday's report, or calendar fallback is allowed in the new method. Conflicting same-day editions cannot be ordered from dates alone and are unavailable. A missing state in the latest edition does not revert to an older state value.

The rolling operational cache keeps at most twelve reports. Older embedded editions retain a raw hash and parent canonical bundle identity, but may lack their original download URL; the latest URL is **not** relabelled as an earlier edition's URL. Full historical research records retain their individual canonical source identities. The cache is not a complete immutable delivery-time archive; unknown correction histories are not reconstructed.

## F. Stage distribution method

Reported cumulative milestones are preserved. For missing milestone `C_k`, monotonic cumulative order bounds it between the largest reported later milestone (or 0) and the smallest reported earlier milestone (or 100). These mathematical envelopes do not impute a point estimate.

Adjacent milestone brackets are `C_k - C_(k+1)` only when both are observed; otherwise publish a range. For the broad existing reproductive/grain-fill gate, use **silking attained but maturity not attained**:

`F_lower = max(0, S_lower - M_upper)`

`F_upper = max(0, S_upper - M_lower)`

Example: silking 80, dough 45, dented 10 yields silking-to-before-maturity **70–80%**, since unreported maturity cannot exceed dented 10. If maturity 5 is also reported, the proxy bracket is 75%. This is not “75% currently pollinating.” With only silking 80 the range is 0–80%, so a positive screen cannot be confirmed. An entirely uninformative 0–100% bracket provides no eligible stage coverage. Silking 0 or maturity/harvest completion can establish a zero broad bracket without inventing missing stages.

These approximate brackets assume compatible reporting populations and ordered milestones. They are survey-based acre attainment brackets, not exact plant-stage occupancy. Independent bracket ranges must not be summed as if they were a reconstructed joint stage distribution.

## G. Production weighting

`w_state = prior completed-year grain production_state / national grain production`.

Production-equivalent screening answers national production importance, **not area exposure**. Harvested-area weighting would answer a different area question and also require a compatible corn-area universe. No parallel area metric is introduced here.

Live canonical production validation remains strict (all ten valid state quantities, national denominator and publication eligibility). The shared weighting primitive can retain known shares with a missing state, without normalization; a malformed entire live source still fails closed. Coverage is bounded against national production. Changed annual weights/version can create a structural change event.

Historical replay uses the prior completed year's production publication available before April 1 for each season, not 2025 weights for every past year. Fixed spatial points are not historical crop maps; within-state crop geography, irrigated/rainfed distribution and crop-year migration remain unmatched. Later corrected weather and the 1991–2020 normal prevent a full point-in-time validation claim.

## H. Joint coverage

All coverage percentages use the **national** production denominator:

- Production coverage: sum of known valid state weights.
- Mapping coverage: weights with the registered state/coordinate mapping.
- Stage coverage: mapped weights with informative, eligible published stage information for **all seven weather days**.
- Weather coverage: mapped weights with a complete, valid common seven-day point window and its correct baseline.
- Joint coverage: weights satisfying mapping + stage + weather together.
- Missing joint share: `1 - joint`; also report `production - joint` within the represented pilot and `1 - production` outside/unrepresented.

Stage and weather marginal coverage must not be multiplied to invent joint coverage. Sum the actual jointly eligible units. No available-state reweighting. Ten available weather samples are not “100% of US corn weather.” Joint coverage means **state/time input alignment**, not spatially observed acreage intersection or confidence. Missing/all-unavailable exposure is null, not zero.

## I. Exposure definition

Consistent label: **Stage-weather screening exposure / 生育期—天气筛查暴露**.

Existing hazards are unchanged: ≥3 daily Tmax values ≥35°C in a seven-day relevant window; moisture requires whole-window relevance AND rain total below its matching-normal P20 AND mean modeled root wetness below its matching-normal P20. No EDD, VPD, new thresholds, wetness hazard, planting delay or compound score is added.

For each state, evaluate the presence of the broad bracket on each day using its lower/upper bounds. Heat is true when at least three hot days have a positive lower bound, false when fewer than three can have a positive upper bound, otherwise unknown. Moisture is true only with all seven positive lower bounds and the existing joint moisture test; false if the hazard fails or a day has zero possible bracket, otherwise unknown.

Conditional on those same gates, the stage proxy is the **temporal mean** of bracket fractions over hot days (heat) or all seven days (moisture), multiplied by state production weight. A false screen gives zero; an uncertain screen gives a 0-to-possible range; missing required data gives null. Aggregate only jointly eligible weights. Also preserve the unadjusted state-associated screened/possible production shares for audit.

This numerical proxy assumes equal within-state production per acre across stages and uses the point screen as a state association. Its range concerns stage/milestone ambiguity **under those assumptions**; it is not a bound on actual crop/weather overlap, probability, exposed hectares or damage. Different fields can enter a stage on different hot days; even three days do not establish that the same acreage experienced three days of stress. Do not interpret the temporal mean as unique cumulative acreage affected.

## J. Historical diagnostic comparison

Run the frozen legacy generator into a temporary location and compare its bytes with `src/data/cornHistory.json`: **identical**, including its artifact identity. Do not overwrite the old file or adopt any of its threshold experiments.

New research artifact: `research/corn-alignment-history.json`, protocol `corn-spatial-stage-diagnostic/1`. It binds the exact original input hash, legacy artifact ID, replay input/output byte hashes and new source hashes. It contains versioned state/week classifications and evidence, not condition/yield outcome evaluation. Two identical runs/tests produce identical results.

| Diagnostic | Result |
| --- | ---: |
| 2012–2019 weekly windows | 278 |
| Windows with at least one changed state heat/moisture classification, including unknown transitions | 129 |
| Changes from spatial/weight/weather coverage | 0 |
| Temporal-only classification changes under the fixed-order comparison | 0 |
| Changes after adding cumulative-stage semantics / withholding unsupported calendar replacement | 129 |
| Mean joint coverage minus legacy assessed coverage | -20.5335 percentage points |
| Minimum / maximum joint coverage difference | -83.8244 / 0 percentage points |
| Windows with no complete jointly eligible state | 66 |

Attribution order is fixed: legacy → publication-aligned legacy stage gate → cumulative-stage screen. The intermediate retains legacy calendar fallback **only for diagnostic attribution**, not new live outputs. It uses no future progress. Sequential categories can overlap/cancel and are not accuracy metrics. “0 temporal-only changes” does not mean no report/date changed: legacy calendar fallback masked those changes in the tested screen classifications. Unknown early-season stage evidence is the intended outcome, not an all-clear or a missing-state normalization.

Changed windows by season: 2012 23; 2013 18; 2014 14; 2015 19; 2016 12; 2017 18; 2018 18; 2019 7. No coefficient, calendar, threshold or sampling point was selected from these results. Phase 4A's usefulness conclusion is not upgraded; no accuracy improvement is claimed.

Reproduce offline:

```sh
node scripts/evaluate_corn_alignment.mjs
```

The command refuses the legacy output path and input path as destinations. Existing historical data caches are not refreshed during this phase.

## K. UI and canonical/change-tracking integration

The bilingual US Corn module displays the new screening section before an explicitly labelled legacy comparison. Method/Level A and “not affected acreage” appear prominently. It shows the national production, stage, weather and joint shares; missing joint share; sample count; bounded conditional exposure; state cumulative percentages; observation/publication dates; seven daily alignment states and source versions. Unknown does not render as “not triggered.” Archive notices precede both methods. Existing module navigation/themes and other sources are untouched.

`evaluate_alerts.mjs` adds `analysis.cornAlignment` after the unchanged legacy Phase 2 builder. Phase 1 `derivedProvenance` is reused: canonical input dataset IDs, publication vintage, observation IDs, content/revision hashes, method version, calculation time, eligibility and release binding. Parent progress identities plus raw selected edition hashes are retained. No second source metadata contract or generic confidence score is introduced.

Phase 2 already records official progress advancement/revisions. An additive, non-notifying structural event records meaningful method, weight, mapping, stage/weather/joint coverage and eligibility changes; routine daily point changes with identical coverage are not new global events. Existing journal identity, weekly summaries, integrity digest and byte pruning are preserved. The release input digest binds `cornAlignment.json`; Python verification accepts old releases without that configuration but requires it for new alignment artifacts. Legacy corn informational signals and global/email alert behavior are not replaced by the new proxy.

No published cache, delivery ledger, workflow schedule or notification is changed by this task. New artifacts are emitted on the next deliberate local/workflow evaluation after code promotion; old releases show an explicit pending-new-method message, never fabricated new output. Nothing is pushed or deployed.

## L. Files changed

New: `src/data/cornAlignment.json`, `src/services/cornAlignment.js`, `src/components/CornAlignment.jsx`, `scripts/corn_alignment.mjs`, `scripts/evaluate_corn_alignment.mjs`, `tests/cornAlignment.test.js`, this report and `research/corn-alignment-history.json`. Preserve/add the previously untracked `research/corn-history-inputs.json` with its original bytes for offline reproducibility.

Modified: `scripts/evaluate_alerts.mjs`, `scripts/release_pipeline.py`, `src/services/changeSet.js`, `src/components/USCornPilot.jsx`, `tests/test_release_pipeline.py`, `README.md`, `PROJECT_CONTEXT.md`.

Unchanged: legacy replay/algorithm/configuration source hashes, Phase 4A artifact and methodology evidence, all existing official-source caches and other UI/data integrations.

## M. Tests and build

Deterministic tests cover cumulative/multiple/missing/inconsistent stages; published-before-day transitions and future exclusion; ambiguous editions; national full/partial/missing/changed weights; deterministic state sampling and wrong/missing coordinates; incomplete weather/baselines; zero/partial/high/mixed stage overlap; marginal/joint coverage without normalization; canonical source retention/eligibility; input/method versions; additive release/journal identity and no daily flood; both languages; unchanged legacy source hashes; deterministic 2012–2019 research and overwrite guards. An offline generator test uses synthetic fixtures/temp files and cannot send mail. Python includes new/legacy release-manifest compatibility.

Verification: **203/203 JavaScript tests, 131/131 Python tests, production build passed**. Nineteen new JavaScript tests and one new Python regression test were added; the existing cross-language generator test also now checks the alignment method. Legacy historical output was byte-identical on replay. Existing large-bundle warnings are not a methodology issue and are deliberately not refactored in this phase.

## N. Remaining limits

State-level geography is matched; crop/weather spatial intersection is **not**. No production-centroid verification, county/sub-state stage distribution, crop mask, irrigated/rainfed separation or damaged-acreage information is available. Previous-year grain weights, uncertain progress acreage universe and equal-stage-yield assumptions make the output a production-equivalent screening proxy only. A seven-day hold is an availability convention, not measured daily progress. Missing/inconsistent stages, delayed/stale reports, missing weather or wrong baselines reduce joint eligibility. Correction delivery-time histories and historical weather vintages are incomplete. A current-year production map is not inferred from future information.

## O. Architecture decision / Phase 4B-2 gate

| Required decision | Answer |
| --- | --- |
| A. Current spatial level | **State-level representative screening (Level A)** |
| B. Genuinely spatially aligned? | **Partially**: stable state identity and compatible daily publication timing; no observation that the state-stage crop was at the weather point |
| C. Affected acreage? | **No** |
| D. Next spatial upgrade | **County-level aggregation**, with authoritative prior-vintage production/area, explicit suppressed/missing shares and deterministic crop-relevant POWER zones/normals. It can support Level B initially; state progress applied to zones remains coarse. True Level C also needs crop-area intersection and compatible stage evidence |
| E. Ready for Phase 4B-2? | **Yes, with one limited caveat**: hazard expansion must remain separately versioned **state-level screening** with these coverage/eligibility guards; it cannot be advertised as crop impact, acreage or loss. A field/area impact model is **not ready** |

Stop here. No Phase 4B-2 hazard implementation is included.
