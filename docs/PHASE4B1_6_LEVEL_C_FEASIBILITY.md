# Phase 4B-1.6 — Level C spatial crop monitoring feasibility

Study date: **2026-10-05**. Repository baseline: **`951cdc6`**, `main`, clean at inspection. This is a design study, not an implementation or a new scientific methodology release.

Scope: official documentation, live service metadata, bounded archive/raster samples, existing project contracts and workflow. No application code, data cache, historical artifact, workflow or notification configuration was changed. No full national raster was downloaded. No commit, push, deployment or email was performed.

Evidence labels used below: **verified** means documentation or a specifically identified sample; **estimate** means capacity arithmetic, not a benchmark; **proposal** means a future decision requiring implementation tests. Findings do not certify every year, week, geography or service as available.

## A. Executive feasibility assessment

**Yes, with a small infrastructure adjustment: prepare crop geography separately, retain reproducible inputs outside Git, and publish compact summaries.** A database, permanent compute server and browser-side raster engine are not required.

The important qualification is scientific, not computational:

- CDL × gridded weather can support **mapped-corn-area weather screening exposure / 玉米制图面积—天气筛查暴露**.
- Adding USDA gridded progress supplies synthetic sub-state **development context**, not a recoverable local silking-to-maturity area fraction.
- Consequently, the proposed three-layer stack cannot yet support an unqualified claim of **stage-specific Level C exposure**. Geometric crop/weather intersection and local stage identifiability must have separate eligibility statuses.

The existing Level A product should remain intact. Prefer a narrowly bounded grid prototype over building a second full county-monitoring system first. Keep state-progress/multi-point approaches as a clearly labeled reference/fallback, not as hidden substitutions inside a Level C result.

Current local architecture: ten states (IA, IL, NE, MN, IN, SD, KS, OH, MO, WI), prior-year NASS grain-production weights, state progress, one POWER request point per state, seven-day weather windows and 1991–2020 matching-window normals. The ten states represent **81.1612%** of the accepted national reference production, not the whole country. `us-corn-point-exposure/v1` and `us-corn-spatial-stage-screen/1` remain separate. See the preserved [Phase 4B-1 baseline](PHASE4B1_SPATIAL_STAGE_ALIGNMENT.md).

## B. CDL assessment

### Product and access

CDL is an annual crop/land-cover classification, not a map of realized grain yield or verified harvested area. Selected-state coverage starts in 1997; the current national archive covers CONUS from 2008. The 2025 native product is 10 m, NAD83/Conus Albers, with a **2026-02-27 publication date**, and is public domain. Its class dictionary separates corn (`1`), sweet corn (`12`) and popcorn/ornamental corn (`13`). The 2025 national accuracy table reports corn producer/user accuracy of 92.2%/91.2%; these are not per-field guarantees. [2025 official metadata](https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_CDL25_FGDC-STD-001-1998.htm).

| Geography year | Resolution to plan around | Availability/vintage caution |
| --- | --- | --- |
| 1997–2007 | Selected-state legacy products; resolution varies, including 30/56 m | Inspect each state/year; not a complete national series |
| 2008–2009 | Current reprocessed national archive: 30 m | Originally coarser products were reissued in December 2017; current bytes are not original-time releases |
| 2010–2023 | National 30 m | Preserve revision identity, not just year |
| 2024–2025 | Native 10 m; separately distributed resampled 30 m | Do not describe the latter as an area-preserving fraction product |
| 2026, during this study | Final 2026 CDL not in the checked national release listing | Use a disclosed prior available geography proxy, or wait for retrospective analysis |

The historical resolution/reissue distinction is documented in [NASS's 2008 metadata](https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_mt08.htm). Official downloads list 2025 at **9.8 GB native / 1.9 GB resampled**, 2024 at **9.0 / 1.6 GB**, 2023 at **2.0 GB**, and 2015 at **1.8 GB**, all ZIP sizes. These are download sizes, not decoded memory requirements. [National releases](https://www.nass.usda.gov/Research_and_Science/Cropland/Release/).

Practical access routes:

- Versioned national ZIPs are the simplest archival reference; obtain a state/area subset for small work.
- CroplandCROS provides public viewing/access. Its live `CDL_WM` ArcGIS ImageServer metadata was reachable: one unsigned-byte band, nominal 30 m service pixels, **EPSG:3857**, year selection, nearest-neighbor default, maximum export dimensions 4097 × 4097, and `exportTilesAllowed: false`. This is **not** proof that its rendering equals native 10 m equal-area data. Use an explicit year/mosaic selection and unstyled categorical values; do not count pixels in a colored web image. [Verified service metadata](https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer?f=pjson).
- A working metadata endpoint does not validate export reliability, request limits, WMS/WCS support or preservation of class counts. Those remain prototype acceptance checks. Do not make a legacy CropScape endpoint or a third-party Earth Engine mirror the sole dependency.
- NASS offers county pixel-count summaries, useful for area checks but insufficient to locate corn inside weather cells. CDL pixel-count acreage differs from official survey acreage and is subject to classification bias. Compound corn classes, grain versus silage, boundary pixels and nodata need explicit treatment. [CDL FAQ](https://www.nass.usda.gov/Research_and_Science/Cropland/sarsfaqs2.php).

### Recommended representation

**Derived fractional corn-area weights plus a sparse overlap table**, created once per mask/grid version. Preserve source year, publication/revision, class policy, source hash and processing specification. Do not ship full CDL to Actions every day or to the browser.

For the first experiment, use a native 30 m historical CDL subset. For later 10 m years, either aggregate native data in streamed chunks or benchmark the official resampled 30 m product against native counts on a bounded area. A categorical majority/nearest resample is not equivalent to summing corn area. Label any approximation and its measured area difference.

Start with class 1 only, explicitly named **mapped class-1 corn area**, with excluded compound-crop classes reported. Do not silently include sweet/popcorn, infer grain-only acres, or count a double-cropped parcel twice. Broader class inclusion requires a versioned crop-universe decision, not a new hazard rule.

## C. USDA gridded progress assessment

### What the product actually represents

NASS supplies weekly growing-season layers for corn, soybeans, upland cotton and winter wheat, with an archive from 2015. The original county survey values are converted to scalar indices. Crop-acreage-informed points inherit county values; simple kriging, smoothing and range truncation form the published synthetic surfaces. A reporting-state mask can include an entire state even when only one county reported. The documented intended delivery lag is one or two days after state reports, not necessarily the state-report publication time. Week-to-week index decreases can occur. [NASS methodology, sections 2–4](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/CropProgressandConditionLayersDescription.pdf).

Thus there is **county-informed sub-state variation**, not merely a redistribution of state averages. But there are no independent field observations at every raster cell, and no public reporter-density grid establishing local support. Filling a state with finite values is not proof of dense observation coverage.

Corn progress is a scalar in [0,1], formed from the sum of seven cumulative milestone percentages divided by 700. Its ingredients are planted, emerged, silking, dough, dented, mature and harvested. They are **not seven separately published raster bands** in the documented product. [Progress metadata and formula](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/metadata/metadata_CropProgress.htm).

Condition is a scalar in [1,5]: the five category percentages are weighted from 1 for very poor to 5 for excellent. It is not a good/excellent percentage or five category grids. Metadata describes nominal 9 km float32 GeoTIFFs in NAD83/Conus Albers; its historical completeness statement excludes AZ, CA, FL and NV. Actual weekly valid footprints must still be inspected. [Condition metadata](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/metadata/metadata_CropCondition.htm).

### Actual archive/sample verification

HTTP HEAD and byte ranges were used; **no complete annual archive was fetched**. The outer ZIP contains a second ZIP per crop, itself compressed. Random access to an arbitrary late-season TIFF therefore cannot be assumed even though the outer server supports ranges.

| Archive | Verified outer bytes | Corn subarchive compressed bytes | Bounded TIFF verification |
| --- | ---: | ---: | --- |
| `cpc2015.zip` | 68,567,161 | 21,641,690 | `CornCond15w16.tif`: one float32 band, EPSG:5070, 139 × 84, approximately 8999.255 m pixels |
| `cpc2025.zip` | 48,854,144 | 15,038,904 | `cornProg25w14.tif` and `cornCond25w15.tif`: one float32 band each; progress 290 × 136, condition 59 × 51 |
| `cpc2026.zip` | 44,293,819 at inspection | 13,470,162 | `cornProg26w14.tif` and `cornCond26w14.tif`: one float32 band each, 562 × 354, exactly 9000 m pixels |

Sources: [2015 ZIP](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/datasets/cpc2015.zip), [2025 ZIP](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/datasets/cpc2025.zip), [2026 ZIP](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/datasets/cpc2026.zip). Checksums and transforms are recorded in the audit appendix.

**Availability boundary:** recent sampled progress and condition files are real single-band products. The 2015 corn archive and sampled condition layer were verified; every 2015 progress week was not inventoried. No full-year completeness claim, all-stage/year matrix or authenticated original publication history is inferred from a ZIP filename. The official index exposes annual downloads, not a verified stable per-stage raster API. A future ingester must inventory weeks/products, missing files and revisions before accepting a season.

The old metadata's 507 × 320 grid is **not a universal array shape**. Sampled 2025 pixels were approximately 8999.255 × 8995.486 m; sampled 2026 files used a different full-domain origin and exact 9000 m cells. This is a concrete reason to fingerprint actual geometry rather than align arrays by row/column.

Historical archives are mutable: NASS records a general historical update in 2021 and soybean reprocessing in 2023. A current archive download is not evidence of what a user could have known in 2015. [Official change log](https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/changelog.txt).

### Can the index supply stage fractions?

**No unique stage-fraction inversion exists.** As an illustrative mathematical counterexample, cumulative vectors in order planted→harvested can be:

- `[100,100,100,50,0,0,0]`;
- `[100,100,50,50,50,0,0]`.

Both have index 0.5; silking attainment is respectively 100% and 50%. This ambiguity exists even before interpolation. Applying `index × corn area` would weight ordinal development, not identify sensitive-stage acreage. An index threshold cannot certify binary local stage presence either. Do not fit an index-to-stage conversion from historical yield outcomes.

State milestone fractions/bounds may continue as the Phase 4B-1 screening proxy, but assigning them to every grid cell remains a **state-stage assumption**. Do not advertise that hybrid as resolved local stage alignment. Retain gridded progress as contextual evidence unless a separately validated stage-resolved source/model becomes available.

Condition belongs in a separate **official-derived condition context / 官方衍生作物状况参考** layer. For example, all-fair and half-poor/half-good both produce condition index 3, despite different category distributions. Condition shares survey lineage with progress and is influenced by many causes: it is corroborative context, **not statistically independent validation** of weather damage. Never use it to decide retrospectively which weather exposures count.

## D. Weather-source comparison

Ranking is for an economical US gridded monitoring extension, **not a claim of universally superior accuracy**. All shortlisted long-record sources cover 1991–2020. A new provider requires its own matching-window baseline and version; existing POWER percentiles cannot be transferred.

| Rank / product | Variables and spatial/time support | Availability, revisions, access | Project assessment |
| --- | --- | --- | --- |
| **1 gridMET** | Daily Tmax/Tmin/rain; RH/specific humidity and VPD; no root-zone soil moisture. ~4 km geographic grid | 1979 onward, near-daily updates; last 60 days preliminary and older reprocessing possible. NetCDF, direct files and THREDDS; copyright waived | Best first temperature/rain grid candidate. Compact files, no CDS account, suitable historical span. Not a complete replacement for the current moisture screen |
| **2 PRISM 4 km** | Daily Tmax/Tmin/rain/dewpoint/VPD; no soil moisture. Geographic grid; 800 m also available | Daily 1981 onward. Near-daily preliminary products; revisions over six months. Current COG ZIP/web services and FTP; free reuse with attribution | Strong US surface-weather alternative and sensitivity reference. More individual files; do not select 800 m merely because free |
| **3 ERA5-Land** | Hourly temperature/dewpoint/precipitation and four modeled soil-water layers. ~9 km, CDS 0.1° grid | 1950 onward; near-real-time about five-day lag, later consolidated data. CDS/API account/token route; CC-BY attribution | Most complete single-system variable candidate; heavier retrieval, time aggregation and soil-layer semantics. Not interchangeable with POWER root wetness |
| NOAA nClimGrid-Daily | Daily Tmax/Tmin/Tavg/rain; no humidity/VPD/soil moisture. ~5 km geographic grid | 1951 onward; preliminary often 2–3 days, subsequent revisions. Monthly NetCDF, HTTPS/THREDDS | Strong official temperature/rain reference, especially regional aggregation. Less complete for future humidity work |
| NASA POWER | Daily Tmax/Tmin/rain/dewpoint/RH and modeled root wetness; meteorology ~0.5° × 0.625° | 1981 onward; ~2–3 day meteorological latency, later replacement by improved data. Existing API, public NASA data | Preserve compatibility and fallback. Many nearby requests duplicate the same cell; projecting to 9 km does not create 9 km evidence |
| Daymet V4 family | 1 km daily Tmax/Tmin/rain/vapor pressure; no root soil moisture; Lambert Conformal Conic | Long record from 1980; annual archive plus a separate monthly-latency provisional product from 2021. NetCDF/THREDDS and NASA distribution | Good retrospective research option; not the first choice for daily early warning; fine grid raises I/O without resolving stage ambiguity |
| ERA5 | Global ~31 km native atmosphere, commonly served at 0.25°; hourly temperature/dewpoint/rain/land variables | 1940 onward, near-real-time and later final versions; CDS | Useful global consistency, weaker US spatial benefit than the shortlisted options |

Primary evidence: [gridMET provider](https://www.climatologylab.org/gridmet.html); [PRISM availability/revisions](https://prism.oregonstate.edu/data/), [PRISM terms](https://prism.oregonstate.edu/terms/); [ERA5-Land overview](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5-land), [CDS license/access](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=documentation); [NOAA product](https://www.ncei.noaa.gov/products/land-based-station/nclimgrid-daily); [POWER sources](https://power.larc.nasa.gov/docs/methodology/data/sources/), [POWER spatial guidance](https://power.larc.nasa.gov/docs/tutorials/); [Daymet overview](https://daymet.ornl.gov/overview), [monthly-latency product](https://daac.ornl.gov/DAYMET/guides/Daymet_V4_Daily_MonthlyLatency.html); [ERA5 overview](https://climate.copernicus.eu/what-copernicus-climate-change-services-era5-reanalysis-dataset).

Additional options: NLDAS supplies hourly land-model moisture at 1/8° from 1979, approximately four-day lag; it is a possible future soil component, not a same-variable substitute. SMAP L4 supplies modeled/assimilated root-zone moisture from 2015, but cannot independently furnish the existing 1991–2020 normal. Neither justifies adding a moisture hazard here. [NLDAS](https://ldas.gsfc.nasa.gov/index.php/nldas), [SMAP product](https://data.nasa.gov/dataset/smap-l4-global-3-hourly-9-km-ease-grid-surface-and-root-zone-soil-moisture-analysis-update).

Operational verification is deliberately narrow: gridMET directory, `.dds` and `.das` metadata responded; no daily service SLA was tested. The inspected Tmax file is 585 × 1386 × 365, packed unsigned 16-bit, Kelvin with scale 0.1 and offset 220. Missing codes must be masked **before** scaling. [Live schema](https://thredds.northwestknowledge.net/thredds/dodsC/MET/tmmx/tmmx_2025.nc.dds), [attributes](https://thredds.northwestknowledge.net/thredds/dodsC/MET/tmmx/tmmx_2025.nc.das).

Use a validated spatial/time subset or chunked download with retries, byte limits and accepted hashes. If subsetting fails, a bounded full annual weather-variable file can be a backfill fallback, not hundreds of point calls or repeated full-history downloads. PRISM/gridMET share upstream information, so their agreement is not independent replication.

**Compatibility gate:** the current dry screen requires both rainfall and POWER root wetness below their own matching-normal P20. gridMET/PRISM cannot silently turn this into a rainfall-only screen. Keep the legacy moisture result separate; a spatial moisture result remains unavailable until a compatible, versioned soil approach is approved. Temperature-only geometry experiments can use the existing heat rule without pretending to reproduce the whole legacy method.

## E. Grid-resolution recommendation

Recommend a **versioned 9 km EPSG:5070 analysis/reporting lattice**, with exact origin, extent, axis order and nodata policy pinned. The sampled 2026 progress geometry is a practical candidate anchor, not a promise that every USDA layer shares it. Regrid historical layers explicitly and preserve native transforms. This grid choice is a proposal, not a registered production methodology.

| Input | Native support | Treatment |
| --- | --- | --- |
| CDL | 10/30 m Albers categorical cells; service outputs may instead be Web Mercator | Count class area in equal-area coordinates; retain partial boundary intersections |
| NASS progress/condition | Nominal 9 km Albers, synthetic and smoothed | Validate source geometry per file; preserve valid fraction during conservative overlap aggregation |
| gridMET / PRISM / nClimGrid | Approximately 4–5 km longitude/latitude cells | Construct native cell footprints; evaluate the screen at native support before corn-area aggregation |
| Daymet | 1 km Lambert grid | Same native-support approach; no claim of 1 km phenology |
| ERA5-Land / ERA5 | 0.1° / coarser geographic grids | Geographic cells are not equal-area 9 km squares; intersect their footprints |
| POWER | Tens-of-kilometers native support | Label coarse support explicitly; no apparent precision gained from subdividing it |

The reporting lattice is not the scientific error scale: NASS smoothing and county reporting may make effective support coarser than 9 km. For a POWER-based result, coarser weather still governs. County boundaries alone also do not improve the underlying evidence.

Reject a 10 m or 1 km combined “risk” map. Do not bilinearly resample class IDs, turn nodata into zeros, or average weather first and then apply nonlinear thresholds. If different weather components have different grids, retain their support and joint-valid intersections rather than implying a common fine-resolution measurement.

## F. Spatial-intersection methodology

Proposed minimum deterministic chain:

1. Validate source CRS, affine transform, dimensions, class/units, nodata, dates and hashes.
2. Stream the selected CDL mask into corn area for intersections of **weather cell × analysis cell × state**; add county boundaries only if actually needed. Store stable cell IDs and area in square meters.
3. Keep the resulting sparse area-overlap table as an annual immutable derived input. Check that intersection areas sum back to mapped crop area within a documented numerical tolerance; do not repair discrepancies by renormalizing silently.
4. Compute the unchanged selected weather screen at each native weather cell over its complete required window. A multi-day condition must hold for the same weather cell, not three different hot locations on three days.
5. Sum screened mapped corn area to the 9 km reporting grid, then state and explicit Corn Belt/CONUS domains. Preserve partial cells and missing weather area.
6. Display the synthetic progress/condition index separately, with coverage and age. **Do not multiply by the progress index as a stage fraction.** A stage-specific output is null without an eligible stage-resolved model/source; a state-stage proxy remains explicitly hybrid.

A new crop mask can change area and the denominator without changing weather; that is a structural geography change, not a hazard escalation. Annual masks must not change midway through a comparison without a version break or a like-for-like recalculation.

## G. Temporal-alignment methodology

Preserve separate observation period, source publication evidence, first-seen time, retrieval attempt and accepted revision. ZIP modification time is not the publication time of every member. Grid delivery may follow the state bulletin; never assign Monday's state-report timestamp to a Tuesday/Wednesday grid without evidence.

For operational forward application, choose a grid known to be published **before the start of the weather interval**, then hold it, with no interpolation using the next report. With date-only publication evidence, first use the next complete provider-defined day. Proposed maximum hold is seven days from evidenced grid availability, consistent in spirit with Phase 4B-1; expose both publication age and Sunday-observation age. Late/missing reports become unavailable, not silently extrapolated. The same grid can remain displayable as historical context after it is ineligible for current alignment.

Where exact historical delivery evidence is absent, label the replay **retrospective, availability unverified**. An assumed lag can be a sensitivity scenario, not certified point-in-time knowledge. Current downloads of revised historical grids cannot recover the original real-time vintage.

Daily boundaries also differ. gridMET describes a nominal day ending at 07:00 UTC the next calendar day; PRISM uses a day ending at 12:00 GMT. POWER currently uses UTC in this project. Preserve actual interval bounds and do not merge same-date values as if simultaneous. [gridMET file attributes](https://thredds.northwestknowledge.net/thredds/dodsC/MET/tmmx/tmmx_2025.nc.das), [PRISM daily timing](https://www.prism.oregonstate.edu/calendar/).

ERA5-Land accumulation conventions require special care: 00 UTC can represent the preceding day's accumulated precipitation; summing already accumulated hourly values overcounts rain. Temperature extrema from hourly samples are not automatically identical to a provider's daily extremum statistic. [ECMWF accumulation documentation](https://confluence.ecmwf.int/pages/viewpage.action?pageId=505384848).

### Historical geography and baseline

- **Retrospective 2015 geography:** use 2015 CDL, explicitly marked as post-season knowledge, to study where that year's mapped crop actually was.
- **As-known-in-2015 replay:** use only a mask demonstrably published before the evaluation date, typically an earlier crop year; retain its original edition if available. A current reprocessed prior-year map still does not establish original-time knowledge.
- **Current season:** latest validated available CDL is a proxy. Rotation and planted-area shifts can make last year's corn pixels wrong this year. A trailing multiyear crop frequency layer could later measure geographic plausibility, but is not current planted area and must exclude future years.
- Recompute a chosen provider's 1991–2020 matching-window normals once outside daily work. For early historical years, that fixed normal includes later climate observations; preserve the legacy retrospective-normal disclosure rather than claiming a strict historical forecasting experiment.

No yield-outcome inspection, parameter optimization or holdout selection is needed for these geometry/time checks.

## H. Crop-area / production weighting

Let `a_i` be mapped class-1 corn area in a disjoint spatial intersection, `v_i` eligibility for the required weather window, and `h_i` the existing screen (0/1). For a declared target domain:

`A = sum(a_i)`

`A_valid = sum(a_i * v_i)`

`E = sum(a_i * v_i * h_i)`

Publish together:

- **Mapped-area weather coverage:** `A_valid / A`.
- **Screened share of target mapped area:** `E / A` — known eligible contribution, not a complete estimate when coverage is partial.
- Optionally **screened share among weather-covered area:** `E / A_valid`, explicitly conditional and never substituted for the national/target share.
- Missing mapped area: `A - A_valid`; with no eligible inputs, exposure is **null**, not reassuring zero.

Crop-map valid coverage, weather coverage, progress-index availability and **stage-fraction eligibility** are different quantities. A finite progress index can count as contextual grid availability but not as known local stage-area coverage. Compute joint coverage on actual intersections, not by multiplying marginal percentages.

`A` requires a validated, fixed target mask, not just the pixels fetched successfully today. Unavailable CDL tiles are unknown, not non-corn. If missing geography prevents establishing the target mapped-corn denominator, publish the available-area subtotal and missing geographic footprint, but leave the whole-domain area percentage unavailable. Do not guess corn acreage in missing tiles. Square meters can be displayed as hectares (`/10,000`) or acres (`/4,046.8564224`), always labeled **mapped classification area**, not official acreage or affected acreage.

If a valid local stage fraction `s_i` eventually exists, `sum(a_i*v_i*h_i*s_i)` still assumes spatial mixing within the unresolved cell. Without within-cell stage locations, exact overlap is not identified. With stage and hazard fractions on the same area/time population, overlap can at most be bounded by `max(0,s+h-1)` and `min(s,h)` absent further assumptions. The current scalar index does not even supply `s`. Do not manufacture it.

**Production importance is a separate metric.** A future allocation `p_i = state_production × a_i/state_mapped_area` assumes uniform production density within each state and a compatible crop universe. It is not observed grid yield and is especially problematic for class-1 corn versus grain-only totals. Do not present it as harvested acreage or add county yield allocation to the first prototype. Keep existing state production-equivalent screening beside, not numerically merged with, mapped-area screening.

Use national production totals only for the production metric; use the declared full target mask for the area metric. A ten-state denominator is ten-state area, not US area. Missing states remain outside coverage; no reweighting to 100%. Weather-event area is not damaged area, and repeated weekly exposure must not be summed as unique seasonal acreage.

## I. Storage-volume estimate

Units below are decimal MB/GB unless stated; directory `M` labels are approximate provider display units. **No full-season runtime or compression benchmark was performed.** Planning assumptions: April–November = 244 days; 35 weekly snapshots; full rectangular grids are conservative arithmetic, including nodata.

| Layer | Source transfer / retained input | Decoded/intermediate estimate | Browser/Git recommendation |
| --- | --- | --- | --- |
| Annual CDL | Verified listing: ~1.6–2 GB at 30 m, ~9–9.8 GB native 10 m | Published dimensions imply ~14.85 GB (legacy 30 m canvas) or ~151.98 GB (2025 10 m canvas) for one byte/pixel; stream, never materialize all in RAM | None of the raw raster in Git/Pages |
| Corn weekly progress + condition | Verified 2025 corn ZIP ~15.05 MB; outer all-crop ZIP ~48.85 MB | 562×354×4 bytes×2×35 ≈ **55.7 MB** if represented on the proposed fixed lattice; actual compressed extents vary | Only compact diagnostics/context summaries |
| gridMET Tmax/Tmin/rain, full annual source files | Directory lists 2025 ~145M +146M +56M ≈ **347M**; no bulk download | 810,810 cells×244 days×3×4 ≈ **2.37 GB** float32 for a season; full year 3.55 GB | Incremental subset/chunk cache outside Git |
| Weather, seven-variable planning scenario | Roughly 0.8–1.5 GB compressed annual input budget, not measured | Same cells×244×7×4 ≈ **5.54 GB**; not a proposal to ingest seven variables now | Retrieve only variables actually used |
| Annual 9 km corn-area grid | Derived | One float32 field ≈ **0.80 MB**; validity/IDs/boundaries add overhead | Store scientific binary outside Git; optional compact release manifest inside |
| Sparse crop/weather/state overlap | Derived once/year/grid version | **10–100 MB planning range**, to measure; depends on nonzero intersections, boundaries and representation | External versioned derived input |
| Weekly exposure/coverage grids | Derived | Four float32 fields×35 ≈ **111 MB**, or ~777 MB if all 244 daily frames retained | Do not put every frame in the site |
| State/domain summaries and provenance | Derived | Target **50–250 KB** current JSON; **2–10 MB** seasonal weekly summaries | Small current summary in Git; lazy historical files/assets |
| Optional map | Derived | Latest small image ~0.1–0.5 MB design target; simplified geometry budget ~0.2–1 MB | Load on demand; test actual compressed size |

Measured source-size basis: [CDL releases](https://www.nass.usda.gov/Research_and_Science/Cropland/Release/), [gridMET directory](https://www.northwestknowledge.net/metdata/data/), the ZIP/sample audit, and the linked raster metadata. Exact weather dimensions/scaling were read from the live schema, not guessed from nominal 4 km.

A first 30 m season therefore has about **2–3 GB compressed primary inputs**, plus intermediates and immutable revisions; native 10 m begins around **10–12 GB compressed**. Archive scope and duplicated revisions can materially increase this. A 30-year, three-variable weather baseline is roughly **10 GB compressed / 100+ GB decoded** at national scale using this order of magnitude. Process year/month chunks; do not bundle baseline initialization with a daily update.

Reducing to the Corn Belt or one-state prototype lowers volume substantially, but state acreage share is not a reliable proxy for rectangular download fraction. Measure the actual subset. Distinguish stored packed integers from decoded float32/float64 arrays: convenience operations can double memory or trigger a whole-file load.

## J. GitHub Actions feasibility

**Yes, if raw rasters remain outside Git, heavy preparation is separated and incremental processing is measured.** The current daily Pages build has a 20-minute timeout and sequential collectors, tests, immutable data-release handling and a separate notification path. Do not insert a national CDL or baseline backfill into that critical path.

GitHub currently documents public standard Linux runners with 4 CPUs, 16 GB RAM and 14 GB SSD; private standard runners differ. Pages has a 1 GB published-site cap and soft 100 GB/month bandwidth limit. These are platform limits, not a recommended data budget. [Runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Proposed workload split:

| Work | Cadence / route | Capacity target, not measured performance |
| --- | --- | --- |
| Crop-mask/intersection preparation | Annual/version change, separate manual or scheduled preparation job | Stream state/tile chunks; standard runner only after working-set test; local/larger one-off machine if needed |
| 1991–2020 normal/backfill | Separate research jobs, year/month partitions | Immutable checkpointed outputs; never download/decode 30 years together |
| New weather + grid progress | Daily weather, weekly progress; separate bounded producer | Warm incremental target <5 min, <4 GB RAM, <4 GB scratch; prove rather than assume |
| Static website | Consume validated compact product | Existing behavior/release safeguards preserved; no geospatial dependencies in browser |

The 10 m national ZIP plus a decoded canvas exceeds the small-runner disk envelope. Even a full 30 m decoded canvas can exceed it. Stream subsets/tiles, or prepare annual weights once off the daily runner. National feasibility does not imply that every preprocessing operation fits a default runner.

Incremental design: reuse annual overlap weights and normals; process newly available weather dates and changed weekly grids; recalculate only affected windows. Because sources revise recent data, “fetch only yesterday” is insufficient. Track per-date content, revisit the provider's revision horizon at a controlled cadence, and preserve prior accepted inputs. gridMET's 60-day provisional period and PRISM's six-month revision cycle imply different maintenance costs.

An entire ~347 MB weather year downloaded daily would transfer roughly 127 GB/year before other inputs; subset/chunk access is worth validating. Processing only new windows reduces compute, but only persistent retained inputs and revision detection preserve reproducibility.

Current local footprint was ~3.3 MB `.git`, 4.8 MB `public/data`, 12 MB `dist`. These are local measurements, not future growth guarantees. At 250 KB per daily snapshot, naive annual summary churn is ~91 MB before Git compression. Keep detailed gridded history outside the repository and avoid copying a whole season into each daily commit.

## K. Raw-data storage strategy

| Option | Appropriate use | Limitation / decision |
| --- | --- | --- |
| Re-download from provider only | Disposable exploration with immutable provider versions | Not enough for operational replay: same URL/year can change |
| Local cache | Annual preparation and developer backfills | Not durable/shared by itself; acceptable for a bounded offline prototype |
| Actions cache/artifacts | Temporary job handoff and debugging | Eviction/expiration; not scientific archive. Public artifact retention is at most 90 days under documented settings |
| GitHub release assets | Small, infrequent immutable masks, normal bundles or research snapshots | Outside Git; each file must remain under 2 GiB; unsuitable as a high-frequency raw-raster transaction store |
| Versioned object storage | Accepted weather subsets, masks, source/derived manifests and revisions | Small additional credentials/retention cost; preferred once daily spatial monitoring is approved |

Documentation: [artifact retention](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization), [release assets](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

Minimum now: no new account or infrastructure for this study; a later one-state offline prototype can use a local cache. Minimum for reliable operational history: durable **content-addressed accepted subsets**, plus annual weights and source/manifests outside Git. Release assets can bridge low-frequency derived products; object storage is the simplest long-term daily archive if live work proceeds.

Store the exact normalized native-cell values consumed, original packing/units/missing masks, source/request bounds, original and derived hashes, and spatial-overlap/normal versions. Keeping compact consumed subsets rather than every global raster is acceptable if they completely reconstruct the calculation; document what cannot be reconstructed. Never call a hash-only manifest a raw-data archive. Do not claim permanence from an expiring artifact.

## L. Frontend/map strategy

First release, if approved: current national/domain and state summaries, observation window, mapped-area/weather coverage, synthetic-progress availability, unavailable local-stage fraction, mask year, weather version, method and release identity. Add top screened regions only when both the screen and sufficient denominator evidence exist; do not rank missing regions as low risk.

Use the existing bilingual UI and Central Data Health vocabulary. Suggested visible wording:

- **Mapped corn area overlapping the weather screen / 与天气筛查条件重叠的玉米制图面积**.
- **USDA synthetic development index; not local stage percentages / USDA 合成生长进度指数，非当地各生育期百分比**.
- **Screening exposure, not confirmed crop damage / 筛查暴露，不代表已确认受灾**.
- **Geography proxy: 2025 CDL; 2026 planting locations not yet verified / 地理代理：2025 年 CDL；2026 年种植位置尚未核实**.

Simplest honest visualization: state summary table plus an optional **static 9 km context image** with legend, date, missing-area hatching and prominent support limitations. A simplified state choropleth also works but must not imply all acres in a state share the same condition.

County GeoJSON adds polygon cost and apparent local precision without solving stage support; defer. Grid GeoJSON with hundreds of thousands of repeated polygon coordinates is wasteful. Vector tiles/COG browser readers and time sliders are unnecessary initially. If inspection later requires cell interaction, load a bounded visible-grid subset or compact ID/value array against shared geometry, not national raw rasters. Avoid embedding hundreds of daily maps in Pages.

## M. Level A vs B vs C comparison

| Dimension | A: state + representative point | B: county/production-zone multi-point + state progress | C candidate: crop mask × weather grids + synthetic progress context |
| --- | --- | --- | --- |
| Defensibility | State association only | Better agricultural weather sampling | Real mapped-crop/weather intersection; local stage fraction still unresolved |
| Spatial accuracy | Single point may miss crop geography | Depends on zone weights/native weather support | Better area support, limited by mask error, weather support and modeled progress |
| Temporal accuracy | Existing publication-aware holding | Same stage limitation | Must also preserve grid-release lag and provider day boundaries |
| Inputs | Small existing point/state records | County/zone weights, extra samples and normals | Annual masks, intersection weights, daily weather, weekly index/vintages |
| Compute / maintenance | Low | Medium; more point histories | Higher annual work; moderate incremental daily work |
| History | Existing 2012–2019 research preserved | Depends on published weights/samples | CDL nationwide from 2008; gridded progress from 2015, not 2012–2014 |
| Reproducibility | Current versioned research | Requires weight/point/vintage pinning | Requires retained grid subsets, geometry and source revisions; raw archive alone is not original-time evidence |
| Frontend | Existing summary | Similar summaries | Similar summaries; optional honest context map |

Three architecture options:

- **Stay A — Small:** no new infrastructure; preserve useful screening. Does not reduce representative-point bias materially.
- **Build B — Medium:** production/area-informed zones with deterministic distinct weather cells and state progress. Improves sampling at manageable cost, but adds another adapter/weighting system and does not resolve local stages.
- **Prototype C geometry — Large overall, bounded first step:** annual fractional mask/overlap preparation, daily grid subsets, compact summaries, synthetic progress as context. Strongest attainable crop/weather-location improvement; requires durable versions and clear stage limits. Recommended research path, not an authorization to replace the live product.

**Keep B only as fallback/reference.** Do not build a full B product as a mandatory detour. This recommendation does not rename a state-stage hybrid “complete C”; a proper stage-resolved C metric remains gated.

## N. Scientific limitations

CDL is classified land cover, not a census of currently surviving grain plants. Rotation, map revision, grain/silage differences and class errors affect the denominator. Resampled 30 m and native 10 m masks can differ even with identical crop definitions.

Weather grids smooth local extremes and do not measure canopy temperatures or every field's rain. Irrigation, drainage, soils, management, hybrids, pests and disease remain unobserved. A dry atmospheric or soil proxy does not establish crop water stress, and condition changes have many possible causes.

Synthetic progress interpolation can reduce sharp spatial contrasts, introduce apparent progression reversals and mask sparse local reporting. Its use of crop geography does not constitute an independent validation of CDL. More pixels do not create more independent observations.

Area-weighted overlap can reduce wrong-location exposure and representative-point bias. Whether it improves predictive skill requires later independently designed validation; no such claim is made here. Provider switching also changes measurement, not just spatial weighting, and must be separated from method comparisons. None of these layers identifies causal yield loss or validates a price model.

## O. Failure/fallback design

| Failure | Conservative response |
| --- | --- |
| Current-year CDL absent | Retain latest eligible available mask with year/publication and proxy label; no claim of current planted acreage |
| Mask revised or crop classes change | Validate, new version and structural change; preserve earlier mask and calculations |
| Grid progress late/missing | Last accepted context with age; local stage eligibility unavailable; labeled state-stage fallback only as a separate product |
| Finite progress index but no stage fractions | Publish index context; stage-specific area remains null |
| Missing weather cells/days | Reduce actual aligned area coverage; no interpolation across missing event days; unknown rather than zero |
| Provider revised past weather | Retain old accepted version; recompute affected windows under new version; compare only compatible methods |
| File shape/CRS/origin changes | Quarantine until geometry validation; never same-row overlay by nominal resolution |
| Wrong scale/offset/units or corrupted ZIP | Reject using schema/range/checksum checks; retain last good result |
| Partial geographic footprint | Use full declared target denominator and report missing share; do not normalize covered states to national 100% |
| No publication evidence | Retrospective context or availability-unverified state; no invented official timestamp |
| Gridded service outage | Preserve dated accepted product; optional separately labeled A/B reference; never silently substitute providers or call stale output current |
| Durable archive write fails | Do not promote a new reproducible spatial release; retain accepted release |
| Processing exceeds budget | Stop bounded job, retain last good output; do not block or rewrite the existing unrelated site data |

## P. Infrastructure and provenance recommendation

Future minimum stack: pinned Python geospatial reader/transform dependencies in the **offline/preparation producer**, chunked arrays, a versioned manifest and durable small input/derived objects; existing static frontend and release architecture. No GIS server, PostGIS, streaming bus or browser raster processing is justified yet.

Use the existing Phase 1 accepted/attempt metadata and derived provenance, not a parallel health system. Relevant existing integration points are `scripts/data_contract.py`, `src/data/dataContract.json`, `src/services/dataHealth.js`, and existing corn derived-provenance paths. Future source-specific extensions should identify:

| Existing contract role | Spatial information to preserve |
| --- | --- |
| Dataset/provider/source/download identity | Crop mask, progress/condition and weather provider/product IDs and exact request URLs |
| Observation/publication | Crop year, weather interval, progress week-ending, evidenced issue time; unknown stays null |
| Version/accepted identity | Source edition, content hash, consumed-subset hash and retained object reference |
| Source extensions | CDL year/class policy, native transform/CRS/nodata, mapped geography, provider day definition and revision status |
| Derived provenance | Analysis-grid definition/hash, overlap-weight version, baseline version, hazard/spatial method versions, exact input identities |
| Evidence eligibility | Area domain, mask/weather/index/stage eligibility separately; concrete missing reasons |
| Release | Existing immutable release identity and input linkage; no alternative notification lifecycle |

Proposed new dataset IDs/extensions require schema and Python/JavaScript parity tests when implemented; they do not exist merely because this study names them. Preserve all frozen historical methods and artifacts.

Phase 2 integration should summarize analytically meaningful mask/coverage/eligibility transitions and source corrections at domain/state level. Do not emit a global change event per cell/day. A new source or changed mask is a structural comparison, not an automatic worsening signal. Raw pixel deltas stay in the external diagnostic archive. No spatial notification changes are proposed or performed here.

## Q. Estimated complexity

These are engineering planning estimates, not elapsed-time promises or paid-cloud quotes.

| Component | Complexity | Main cost / acceptance question |
| --- | --- | --- |
| Level B | **Medium** | Official weight coverage, distinct native cells, historical weight editions and comparable normals |
| Level C overall | **Large**, separable into small experiments | Scientific eligibility plus reproducible raster I/O, not frontend rendering |
| Ingestion | Medium | Nested archives, subset reliability, variable packing and provider revisions |
| Reprojection/intersection | Medium–Large | Exact geometry, crop-area conservation and changing grids |
| Crop-mask creation | Large once per year/version | National high-resolution I/O, class policy and original-time geography |
| Progress alignment | Large scientifically | Scalar index cannot identify local stages; more coding does not solve missing information |
| Weather aggregation | Medium | Native support, time boundaries and missing-data windows |
| Exposure calculation | Small–Medium after validated inputs | Existing hazard semantics; no unsupported stage multiplication |
| Historical replay | Large | Geography/weather vintage archive, baseline volume and 2012–2014 progress gap |
| Frontend map | Small for static/state view; Medium–Large for tiled interaction | Honest coverage/precision communication |

A one-state offline experiment is roughly several engineering days; hardened multi-year national operation is a multi-week undertaking with data-access contingencies. The dominant resource expense is annual mask/baseline preparation and versioned data handling. Daily summaries are small. No paid service purchase is justified before the bounded workload is measured.

## R. Recommended implementation roadmap

### Next task only: Phase 4B-1.7 — Iowa crop-mask × weather overlap proof

**One state, one historical mask, fourteen days, no live changes.** Proposed deterministic selection: Iowa (largest current reference production share), 2015-07-01 through 2015-07-14 (a fixed calendar window inside the available development research years, not selected from outcomes). Do not inspect holdout or yield performance.

Scope of that future task:

1. Bounded 2015 native 30 m CDL Iowa subset, gridMET Tmax subset and corresponding USDA progress/condition context, with explicit post-season mask/retrospective-vintage labeling.
2. Validate actual raster schema, transforms, class values, packing, valid masks and date windows; register no live source yet.
3. Build area-conserving crop/weather/reporting-grid weights. Demonstrate boundary handling and invariance to processing chunk size/order.
4. Evaluate only the existing temperature-screen geometry; do not introduce EDD, VPD, excess wetness or a replacement dry screen. Do not derive local stages from the index.
5. Record download bytes, RAM, scratch disk, runtime, summary size and how much mapped area is actually covered. Verify null/partial coverage and input-failure retention.
6. Demonstrate exact offline repeatability from retained sample inputs; identify unavailable historical publication evidence rather than reconstructing it.
7. Produce a research summary and optional static image, with no deployment or notifications. Set a go/no-go gate for scaling.

Later, only with approval: validate prior-available mask operation and incremental revision handling; prepare national weights/baselines in partitioned jobs; integrate compact source products with Canonical Data Health; then add an honest UI. A local-stage model/source is a **separate scientific decision**, not an automatic result of raster intersection.

**Phase 4B-2 hazard expansion should follow the bounded spatial/coverage upgrade and its semantic acceptance**, not precede it. This isolates location/coverage changes from hazard changes. It need not wait indefinitely for unknowable field-stage truth, but any remaining state-stage proxy must be explicit and separately versioned before new hazards are considered. No expansion is authorized by this study.

## S. Final decision answers

| Question | Decision | Qualification |
| --- | --- | --- |
| 1. Is Level C technically feasible? | **Yes, with infrastructure adjustment** | Crop-area/weather intersection is feasible; the full stage-specific claim is not identifiable from the scalar progress grid alone |
| 2. Can Actions + Pages remain primary? | **Yes, if raw rasters remain outside Git** | Separate annual/backfill work, preserve accepted subsets, publish compact summaries |
| 3. Is USDA gridded progress suitable for local stage alignment? | **Partially** | Useful synthetic sub-state developmental context; **no** for local stage fractions or confirmed stage-acreage overlap |
| 4. Preferred weather, top three? | **1 gridMET; 2 PRISM 4 km; 3 ERA5-Land** | POWER remains the unchanged compatibility reference; no provider is a drop-in replacement for its root-wetness screen |
| 5. Common resolution? | **Versioned 9 km EPSG:5070 reporting/analysis grid** | Retain native weather support and crop-area intersections; effective scientific support can be coarser |
| 6. Build Level B first? | **Keep Level B only as fallback/reference** | Avoid a mandatory full intermediate platform; do not disguise state-stage assumptions as full C |
| 7. Hazard expansion before or after spatial upgrade? | **After** | First prove area conservation, coverage, no-look-ahead semantics and method separation |
| 8. Next narrow task? | **Phase 4B-1.7 Iowa fourteen-day offline overlap proof** | No live pipeline, hazard expansion, holdout tuning, deployment or email |

Bottom line: World Food Lens can move beyond a state weather proxy without becoming a heavyweight crop model. The defensible initial gain is **where mapped corn and weather overlap**, not proof of which fields were in a sensitive stage or suffered damage.

## Audit appendix — bounded checks and untouched baseline

### Sample procedure

Read-only inline inspection used Python standard-library HTTP Range, ZIP structures, DEFLATE and TIFF tags in memory. Initial inspection assumed TIFFs were directly in the outer archive, discovered nested crop ZIPs and stopped; subsequent bounded prefix reads inspected actual inner TIFFs. HTTP 206 was required before reading bodies. No full annual archive or CDL/weather raster was downloaded. ZIP ranges totaled **under 5 MB**, including repeated concise verification; web/HTML metadata was additional. No temporary script/data files were written to disk, so no cleanup deletion was necessary.

This is **header/structure validation**, not a full raster quality test or an executed crop/weather intersection. ZIP-member CRCs were checked in the concise recent sample pass. Not every source, pixel value, week or export API was exercised.

| Sample | Geometry recorded from GeoTIFF | SHA-256 of sampled TIFF bytes |
| --- | --- | --- |
| 2015 `condition/CornCond15w16.tif` | 139×84; pixel 8999.255456289853 m; upper-left (173994.29253365658, 1421465.4586504214) | `67742db7316592243318a7070b118ca47ef05658fa7d77f1fdfe2d9441250a69` |
| 2025 `progress/cornProg25w14.tif` | 290×136; pixel X 8999.255456289853, Y 8995.486488541766 m; upper-left (-1013907.427696604, 1529607.2828358226) | `162c18ea72c41eef0e884a5fdf2555d1ca85873949783d2603eca3428fba0c0b` |
| 2025 `condition/cornCond25w15.tif` | 59×51; same 2025 pixel scales; upper-left (164995.03707736684, 1124490.0285928561) | `c55ca5ae06e1a3af8dc01dd10c736cdb372b2b02054df3d75b3ee450dc6c1d19` |
| 2026 `progress/cornProg26w14.tif` | 562×354; pixel 9000×9000 m; upper-left (-2588777.1325473282, 3284812.3515439425) | `00a77ea80f86a82ffb7db0f00ca22c7b9035122c464aca7f258c137061efb32e` |
| 2026 `condition/cornCond26w14.tif` | Same sampled 2026 geometry | `69adf2b2ce8d29cf93a3d20786ca5c95db23434d342bc481cc18c9656cd5f9d1` |

GeoTIFF tags inspected include dimensions, bits/sample, samples/pixel, sample format, pixel scale, tiepoint, GeoKeys and nodata. Sampled products are single-band float32 in EPSG:5070 with `-9999` nodata. Archive HTTP last-modified evidence included 2025-11-25 for `cpc2025.zip`; this is deliberately **not** promoted to all member publication dates.

Additional practical findings: live gridMET schema and attributes succeeded over HTTPS; PRISM's modern format is COG rather than relying on retired BIL conventions, and 800 m access became public in 2025. [PRISM format specification](https://www.prism.oregonstate.edu/formats/), [dated transition notice](https://www.prism.oregonstate.edu/notices/notice_20250327.php). Do not copy obsolete download assumptions into a future implementation.

### Repository verification

The task adds only this study document. Production source, historical inputs/results, checked-in live data, dependencies and workflows remain unchanged. No JavaScript/Python suite or production build was rerun because no executable artifact changed; this is not a new test-pass claim. No historical pipeline, holdout analysis, notification or provider refresh in the application was run. Source requests above were isolated read-only research checks.
