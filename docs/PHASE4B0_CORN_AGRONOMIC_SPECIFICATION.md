# Phase 4B-0 — US Corn Weather–Yield Literature Grounding & Agronomic Model Specification

Review date: 2026-10-04, America/Los_Angeles. Status: **methodology proposal; not implemented or frozen for validation**.

Scope: US grain maize, prioritizing rainfed Corn Belt field conditions. This is a structured, targeted evidence review, not an exhaustive systematic review or a new meta-analysis. It does not establish forecasting skill.

## A. Executive scientific assessment

### Decision

Proceed toward a **stage-aware weather-exposure evidence system**, not a crop-loss model. There is sufficient agronomic justification to improve what is represented, but insufficient evidence to attach universal damage thresholds, yield-loss percentages, or calibrated probabilities.

Well-established concepts include nonlinear temperature response, sensitivity around reproduction and early kernel development, the importance of exposure duration, water supply–atmospheric demand coupling, and damage pathways from waterlogging. Exact responses vary with cultivar, management, stage, soil, irrigation, and weather measurement. These concepts have support across empirical, experimental, and crop-model evidence; their numerical implementations are not interchangeable. [E1] [P1] [P2] [M1] [R1] [E4]

The most important unresolved issue is **identifying joint exposure**: the crop must be in the relevant stage at the place and time of the weather event. A state stage percentage multiplied by a single weather-point flag does not establish that joint event.

### Six required decisions

| Question | Decision | Reason and constraint |
| --- | --- | --- |
| Retain Tmax ≥35°C as the primary corn heat metric? | **Yes, but only as one secondary screening metric** | Keep as an explicitly WFL-defined hot-day screen, not a biological injury boundary; it cannot replace duration, water status or stage evidence. [P1] [M1] [R2] |
| Incorporate EDD above approximately 29–30°C? | **Potentially, with limitations** | Literature supports accumulated supra-breakpoint thermal exposure; daily Tmax excess alone is not the original metric. Resolve intraday reconstruction and spatial coverage before publishing it. [E1] [M1] |
| Make stage-weighted exposure primary? | **Partially** | Make stage awareness primary now in the design; numerical weighting is conditional on compatible denominators and explicit spatial/temporal assumptions. NASS milestones do not identify precise pollination occupancy. [U1] [U3] |
| Represent heat + moisture/VPD overlap? | **Yes** | Separate co-exposure categories, with missingness retained; do not add them into a causal damage score. [M1] [M2] [E2] |
| Add excess wetness / planting delay? | **Yes, but only as separate evidence** | Present wetness, fieldwork, and observed delay side by side; high rainfall is not proof of flooded fields or loss. [E4] [E5] [X2] |
| Enough basis for Phase 4B implementation? | **Yes, with specific unresolved questions** | Enough for descriptive metrics and evidence separation; not enough to enable a national affected-area estimate, exact-stage model, or warning calibration without the gates in N and R. |

### Current project state and review boundary

The inspected local checkout is `main`, HEAD `6625cdb`, with pre-existing uncommitted Phase 0–4A work. Read `PROJECT_CONTEXT.md`, `MIGRATION_NOTES.md`, `README.md`, project inventory, recent history, the pilot services/configuration and the Phase 4A assessment. No remote freshness claim is made and none of that work is replaced.

The pilot combines ten representative state weather points, prior-year national production shares, calendar templates plus official cumulative progress, and seven-day weather windows. Its existing heat screen uses at least three relevant days at Tmax ≥35°C; these need not be consecutive. Its moisture screen uses low rain and low modeled root wetness relative to matching-window percentiles. These are existing WFL conventions, not scientific findings.

Phase 4A already examined 2012–2019, eight seasons and 278 windows. Its **weak/inconclusive** usefulness conclusion stands. This review does not rerun it, select parameters from its comparisons, or inspect additional holdout outcomes. Published literature may contain years outside that sample; consulting published findings is not a new WFL holdout evaluation, and does not make the eventual holdout independent of all scientific prior knowledge.

### Review method and evidence ledger

Search families: nonlinear US maize temperature/yield and Schlenker–Roberts; APSIM extreme heat/VPD; maize pollen, silking, kernel set and heat duration; recent heat meta-analysis; CERES/IXIM model comparisons; US excess rainfall; NASS progress definitions and gridded metadata. Verification used journal pages, PubMed records, author/institutional manuscripts, USDA documentation and university Extension pages. Search cutoff is the review date; no claim that all publications through that date were captured.

Include verified maize-specific evidence relevant to a pathway or measurement definition. Exclude unverifiable citations, commercial summaries as evidence, other-crop results transferred without qualification, and numerical rules supported only by WFL fit. Give priority to US field relevance, but distinguish **study quality** from **transferability**: an excellent chamber experiment can identify a mechanism without validating a US state-level warning.

| Evidence family | What was verified/reviewed | Transferability and access limit |
| --- | --- | --- |
| Empirical temperature | [E1], county-scale nonlinear temperature exposure with precipitation controls | Strong US field association; historical, aggregated and not an organ-temperature experiment |
| US drought follow-ups | [E2], [E3]; modern hybrid trials [E6] | Field and within-county evidence; differing management/soil/genetic estimands. Verified abstracts/metadata; not a reanalysis of their data |
| Reproductive physiology | [P1], US field warming; [P2], controlled pollen-development experiment | Useful triangulation, not universal temperature calibration |
| Reviews/meta-analysis | [R1], verified meta-analysis abstract; [R2], reproductive review abstract; [R3], water-limited reproduction review | R1 full methods/supplements were not accessible here: no claim of independently verified subgroup weights, publication-bias tests or US-only effect size |
| Crop models | [M1], APSIM institutional abstract; [M2], MAIZSIM/2DSOIL; [M3], algorithm ensemble; [M4], CERES/IXIM comparison | Mechanistic/model-conditional evidence; parameter tables are not imported as field thresholds |
| Excess rain | [E4], accessible author manuscript; [E5], publisher evidence | Independent US empirical studies measure different rain characteristics; do not equate all heavy rain with damage |
| Official/Extension | [U1–U5], [X1–X3], [U6] | Official variable definitions and operational agronomy, not randomized yield-response evidence |

Ratings below are this review's qualitative synthesis, not a formal GRADE assessment. Studies sharing authors, experiments, or data are not counted as independent replications. Abstract-only evidence can support its reported broad result, not detailed unobserved methods or precise implementation parameters.

## B. Evidence map

Arrows describe plausible supported mechanisms, not a claim that WFL can identify each link in a particular event.

| Pathway | Mechanistic chain | Evidence and WFL boundary |
| --- | --- | --- |
| Direct reproductive heat | Organ heat → impaired pollen/silk/pollen-tube or fertilization processes → reduced successful kernel set → possible yield effect | Controlled physiology and reproductive review [P2] [R2]; field context [P1]. Air Tmax is not measured pollen temperature or fertility. |
| Atmospheric demand | Temperature and humidity → VPD → evaporative demand/stomatal response → water balance and assimilation → potential growth consequence | APSIM and independent process model [M1] [M2], US field evidence [E2]. Temperature alone does not determine actual VPD. |
| Water supply | Rainfall, stored soil water, roots and irrigation → available water → stage-dependent growth/reproductive limitation | [R3] [E3]. A rainfall deficit alone is not plant water stress; model wetness is not measured available water. |
| Excess moisture | Persistent saturation/submergence → oxygen/nutrient/root limitations; wet fields → restricted operations → establishment/development consequences | US empirical rainfall evidence plus agronomy [E4] [X2]. Rain is a forcing; saturation requires separate evidence. |
| Development | Thermal environment, water and management → development rate and planting opportunities → reported progress | [X1] [M4] [U2]. Delayed progress is observed context, not a diagnosis of its cause. |
| Outcomes | Multiple stresses plus genetics/management/pests → condition and production; sampling/revisions → reported estimates | [U1] [E2] [E6]. Condition and USDA revisions remain separately dated observations, not confirmation of a particular causal chain. |

The same hot episode can act through multiple pathways. Counting heat, VPD, low rain and low wetness as four independent pieces of damage evidence would exaggerate certainty.

## C. Temperature literature and metric definitions

### Four meanings that must never be merged

| Category | What the number means | Appropriate use |
| --- | --- | --- |
| Statistical yield breakpoint | Schlenker & Roberts found a corn response turning downward around 29°C using within-day temperature exposure aggregated over the growing season, county yields and precipitation controls. [E1] | Empirical basis for a thermal-exposure metric, not a tissue-injury threshold or a coefficient to transplant into WFL |
| Physiological reproductive threshold | An experimental combination of organ/environment temperature, duration, stage and genotype associated with a measured response. [P2] [R2] | Context-specific mechanism evidence; no universal air-Tmax threshold established here |
| Crop-model parameter | Thermal development, stress or fertility parameter within a particular version and response function. [M3] [M4] | Model convention requiring its surrounding assumptions; not an independently observed universal threshold |
| WFL screening heuristic | For example, Tmax ≥35°C on three days within seven | Transparent monitoring convention. A plausible agronomic motivation does not upgrade its exact number to scientific fact |

For a concrete physiological contrast, Begcy et al. applied a **35°C light / 25°C dark regime for 48 hours** during pollen tetrad development, followed by recovery conditions. This is a controlled exposure protocol, not two daily maximum readings, nor a demonstrated onset threshold. The tetrad stage precedes visible tasseling; it must not be assigned to the USDA silking milestone. [P2]

### Thermal exposure versus a hot-day count

Define a prospective continuous metric, with time in hours:

`EDD_b = (1/24) × integral over eligible time of max(T_air(t) − b, 0) dt`

Unit: °C·days. Hourly values approximate the integral. A daily Tmin/Tmax reconstruction can estimate it only with a declared diurnal-shape method, day boundary, and uncertainty. Neither `sum(max(Tmax−b,0))` nor `sum(max(Tmean−b,0))` is silently interchangeable with this integral. Aggregating temperature over space before applying the nonlinear function also changes the result. This is a proposed operational definition motivated by [E1] and [M1], not an assertion of exact replication of either study.

Prefer the name **extreme degree days**, not “killing degree days” in public explanations: the metric records exposure, not dead plants. The approximately 29–30°C literature range is an empirical candidate range, not a confidence interval. If both bases are retained, declare both before validation and report both; do not pick whichever performs best afterward.

| Metric | Rationale / evidence strength for this purpose | Required data | WFL suitability and limitation |
| --- | --- | --- | --- |
| Tmax | Simple extreme indicator; MODERATE for a stand-alone hazard, weak for exact damage [P1] [R2] | Quality-controlled daily maximum and location | Secondary descriptive screen; does not measure exposure hours, canopy heat or night recovery |
| Tmin | Night thermal environment; LIMITED in this reviewed corpus for a transferable US stage-specific rule [M3] | Night minimum; preferably nighttime series | Preserve descriptively; a minimum alone poorly measures sustained warm nights; no injury cutoff proposed |
| Mean temperature | Development context; MODERATE [X1] [M4] | Daily means, method specified | Useful context, but averages conceal extremes and day/night differences |
| EDD | Nonlinear field association and cumulative load; STRONG concept, implementation conditional [E1] [M1] | Hourly temperature, or documented Tmin/Tmax approximation | Preferred continuous heat candidate; not a yield-loss conversion |
| Consecutive hot days | Persistence; MODERATE concept [R1] [P1] | Complete ordered daily records | Report run length alongside total count; exact day cutoff remains heuristic |
| Temperature anomaly | Local unusualness; LIMITED as a physiological hazard by itself [E1] [X1] | Comparable fixed climatology, variable and time window | Context only: unusual cool-region warmth need not be absolute heat stress |
| GDD | Developmental thermal accumulation; STRONG operational convention [X1] | Tmin/Tmax, start date and convention; cultivar context for stage estimates | Development, not damage; cannot manufacture precise stage occupancy |
| VPD | Atmospheric moisture demand; STRONG mechanism, MODERATE stage-specific operational transfer [M1] [M2] [E2] | Matched temperature and humidity/dew point, preferably subdaily | Separate axis; not computable reliably from temperature alone |

The common US modified corn GDD convention uses 50°F/86°F limits (10°C/30°C). Those are **development conventions**, not empirical EDD breakpoints or damage boundaries. The exact clipping/floor algorithm and degree-unit conversion must be specified before any calculation; early development also depends on soil rather than simply air temperature. [X1]

## D. Crop-stage sensitivity

Stage sensitivity is not a single ordered numerical ladder. Reproductive organs can be vulnerable during brief intervals, while vegetative stress can influence later source capacity, roots and development. WFL should distinguish mechanisms without pretending its weekly stage inputs resolve those intervals.

| Stage | Agronomic interpretation and evidence | What WFL can responsibly represent |
| --- | --- | --- |
| Planting / emergence | Seedbed moisture, temperature and field access affect establishment [X1] [X2] | Wetness/cold context, planted and emerged progress; no automatic stand-loss estimate |
| Vegetative | Leaf/root development, water demand and pre-flowering reproductive development matter [P1] [P2] | Do not label all pre-silking weather irrelevant; also do not equate transient leaf stress with permanent yield loss |
| Tasseling / silking / pollination | Pollen development and release, silk availability, pollen-tube growth and fertilization are distinct processes [R2] | A broad reproductive-transition context; exact anthesis, pollination and ASI require additional observations |
| Kernel set / blister / milk | Early reproductive water/carbon limitation and heat can affect kernel retention; R1 identifies sensitivity extending into early kernel development [R1] [R3] | Keep early filling distinct from post-maturity; do not call all silking-to-dough acres “currently pollinating” |
| Grain fill | Assimilate supply and development duration influence kernel weight; kernel-weight simulation remains difficult [M2] [M4] | Continuous heat/water evidence during incomplete development, not fixed percentage loss per day |
| Dough / dent | Filling continues within these later stages; they are not synonyms for completed yield formation [X3] | Broad late-development bracket, not zero vulnerability |
| Maturity | Physiological maturity ends kernel dry-matter accumulation; field harvest and grain quality remain separate concerns [X3] | Stop labeling mature crop as pollination exposure; do not infer all post-maturity risks disappear |

ASI means the anthesis–silking interval, not the difference between USDA planted and silking percentages. NASS state tables do not supply observations sufficient to derive ASI, fertilization success, kernel number, or kernel weight.

**Important field qualification:** Siebers et al. used three-day canopy warming at vegetative and reproductive stages in Illinois. Reproductive response was more concerning than the vegetative treatment, but the reported seed-yield decrease was not statistically significant at conventional levels (P = 0.15). Do not describe that particular result as definitive field validation of a three-day loss rule. [P1]

## E. Heat duration

Duration and magnitude both matter, but the reviewed evidence does **not** establish a universal 3-, 5-, or 7-day injury cliff. Niu et al.'s meta-analysis covers 575 observations from 34 studies and reports roles for both heat magnitude and exposure days. Its experimental pooled effects are not transferable US operational loss coefficients. Without full subgroup methods, this review cannot reliably separate its field-only, chamber-only, US-only or genotype-specific estimates. [R1]

Short events cannot automatically be dismissed: controlled pollen-development evidence and the reproductive review identify narrow sensitive intervals. Conversely, a short moderate exposure does not guarantee irreversible injury. [P2] [R2]

Recommended descriptive bundle: cumulative EDD, maximum temperature, count of screened days, longest uninterrupted run, dated event extent and stage-information quality. Keep single-day extremes visible rather than deleting them because an alert run-length rule was unmet. Missing days break an observed run into uncertain segments, not into known cool days. Any lookback window or minimum duration chosen for an alert is Tier C. No duration choice is made from Phase 4A results.

## F. Heat × water / VPD interaction

Lobell et al.'s APSIM analysis reproduced US extreme-heat sensitivity largely through water-demand/VPD pathways, with a smaller direct reproductive-heat contribution under the studied conditions. This is a model-based explanation of a historical regime, not proof that direct heat damage is unimportant everywhere or under future extremes. Hsiao et al.'s independent model experiment also separates atmospheric-demand effects from temperature-driven development. [M1] [M2]

Direct reproductive mechanisms and indirect water limitation can coexist. A heat observation should therefore not be labeled “pollen damage,” and a low-water observation should not be explained exclusively by heat. [P2] [R3]

There is also no fixed “modern hybrids have solved drought” adjustment. US field/county studies found increasing drought sensitivity under their estimands, whereas newer hybrid-trial evidence reports improvements in grain-fill drought resistance. Different populations, management, soil contrasts, stages and genetic comparisons can yield different conclusions. WFL should retain cultivar/management uncertainty rather than import either trend as a universal modifier. [E2] [E3] [E6]

Proposed separate outputs:

- Heat exposure, with stage context.
- Low rainfall and low root-zone wetness, each individually visible.
- High atmospheric demand, when independently calculable.
- Observed same-place/time heat–water-deficit overlap.
- Observed same-place/time heat–VPD overlap; a three-way overlap only if all inputs exist.
- Unknown overlap when one required input is unavailable; never substitute zero or assume high VPD from heat alone.

“Overlap” means co-occurrence under declared screens, **not statistical interaction, synergistic damage or causal attribution**. Separate marginal weather evidence remains visible if stage is missing. Irrigated acreage must be identified or flagged as mixed-management because low rainfall may not imply inadequate crop water.

VPD needs compatible temperature and atmospheric moisture data. FAO documents nonlinear saturation-vapor-pressure calculation and why substituting mean temperature can bias estimates. Prefer contemporaneous subdaily observations; label daily-method estimates explicitly and do not equate mean daily VPD with peak daytime demand. The existing pilot's Tmin/Tmax/rain/wetness bundle alone is insufficient. [U6]

## G. Excess moisture and planting delay

US evidence links excessive rainfall to yield losses conditional on location, drainage and antecedent wetness. Another US study finds benefits from some changes in rainfall intensity. These are not grounds for choosing one story: seasonal excess, hourly intensity, infiltration and persistent ponding are different exposures. [E4] [E5]

Waterlogged roots and restricted operations are credible concerns, especially around establishment, but survival depends on temperature, stage, submergence and drainage. Extension guidance is useful context, not a universal flood-duration/yield equation. [X2]

Independent field work by Kanwar et al. followed fluctuating water tables across growth stages for three years. It supports measuring cumulative excess-water conditions rather than rainfall alone. Its water-table exposure metric is not reproducible from WFL's unitless soil-wetness index, and its site-specific response must not become a national threshold. [P3]

Recommend a separate **wetness and establishment evidence panel** containing available precipitation totals/persistence, root-wetness context, direct flood/saturation evidence if available, official planted/emerged progress, and days suitable for fieldwork. No wetness percentile cutoff is assigned here.

Official planting-progress shortfall relative to its contemporaneously published comparison provides more direct evidence of delayed activity than rainfall alone. It still does not prove rain caused the delay: logistics, planting intentions, management and temperature can contribute. Show progress departure in percentage points, not inferred days of delay unless the conversion is independently specified. Neither progress nor wetness alone measures prevented planting, stand loss or lost production.

## H. USDA phenology/progress framework

### Official meaning

NASS progress describes acreage reaching or passing a milestone; generally, an acre qualifies once at least half its plants reach that milestone. Percentages are not the fraction of individual plants nationwide currently occupying a discrete physiological stage. State interpretation can vary. [U1]

| Reported milestone | Concise official meaning, paraphrased from [U1] |
| --- | --- |
| Planted | Seeds placed in soil |
| Emerged | Plants visible above the soil |
| Silking | Silks appearing from ears |
| Dough | Thickened kernel contents; the guidance also describes partial denting |
| Dented | Dented kernels and a firm ear, with most kernels no longer milky |
| Mature | Crop described as frost-safe and approaching harvest readiness |
| Harvested | Crop removed/gathered from the field |

The NASS wording is an operational reporting definition, not an exact equivalence to every research R-stage definition. Good/excellent condition describes reported prospects; it does not encode a measured loss percentage. [U1]

Crop Progress uses frequent expert observations and a non-probability survey; official estimates are reviewed and aggregated. Preserve observation week, publication vintage and subsequent corrections separately. Weekly reporting is not daily phenology measurement, and later reports cannot fill earlier operational information gaps. [U2] [U4]

### Binary versus percentage-aware representation — proposed interpretation

Prefer cumulative progress plus **broad milestone brackets**, conditional on identical geography, crop universe, denominator, observation date and accepted edition:

- planted minus emerged: planted, not yet reported emerged;
- emerged minus silking: emerged, not yet reported silking;
- silking minus dough: reached silking, not yet reported dough;
- dough minus dented; dented minus mature; mature minus harvested: corresponding broad brackets.

These are differences between cumulative acreage estimates, not direct observations of exact VT, R1, fertilization, R2 or R3 occupancy. The first reproductive bracket includes several processes and durations. Weekly change in cumulative silking measures reported new attainment, **not** the fraction currently pollinating.

Do not subtract reports from different weeks to produce an occupancy fraction. Do not clip negative differences to zero without diagnosing revisions or denominator mismatch. Preserve missing milestones as unknown; a partial valid bracket need not make the entire season unusable, but missing brackets must not be redistributed. Do not add overlapping brackets into a total. Calendar-only or GDD-estimated stages must remain separate from official observations.

Daily exposure assignment from weekly percentages needs an explicit temporal assumption. A newly published endpoint is not evidence that the same fraction occupied that bracket every preceding day. For operational use retain “stage distribution observed on date X” alongside the weather period; withhold a precise daily joint-exposure percentage when stage timing is unresolved. Interpolation using a future report is retrospective, not point-in-time.

### Gridded products

NASS offers synthetic weekly progress/condition surfaces at 9 km, originating from confidential survey data. The corn progress index averages seven cumulative milestones into one 0–1 value. It equally spaces milestones in index space, not time. [U3]

Consequently the scalar index is non-invertible: it cannot uniquely recover seven percentages, pollination area, or a daily stage distribution. Synthetic condition surfaces likewise cannot be treated as directly measured field health or as independent confirmation of the survey used to generate them. These are methodological inferences from the documented construction, not new provider claims.

Use them later for broad within-state context and research on spatial representativeness, with masking, edition history and coverage checked. Do not treat apparent 9-km detail as 9-km observational certainty; inspect actual product vintages and archive availability before historical comparisons. [U4] [U5]

## I. Stage sensitivity matrix

Ratings concern evidence that the hazard can affect the stage or its subsequent outcome, **not a damage probability or a recommended numerical weight**.

- **STRONG:** converging relevant evidence for the broad pathway.
- **MODERATE:** supported mechanism/agronomy, but narrower field transfer or stage specificity.
- **LIMITED:** mostly indirect/general evidence in this review.
- **INSUFFICIENT:** reviewed sources do not support a separate operational stage-specific response; not proof of no effect.

Each cell cites its evidentiary basis. For LIMITED/INSUFFICIENT cells the citation identifies the nearest reviewed evidence and its boundary, not a study proving absence. VPD cells refer to atmospheric demand independent of a known soil deficit; wetness means persistent saturated/submerged conditions, not any above-normal rainfall. Cold/frost cells are principally Extension-level evidence, not a peer-reviewed stage meta-analysis.

| Stage | Heat | Moisture deficit | VPD | Excess rainfall / wetness | Cold / frost |
| --- | --- | --- | --- | --- | --- |
| Planting | LIMITED [X1] | MODERATE [U1] | INSUFFICIENT [M1] | MODERATE [X2] [U1] | MODERATE [X1] |
| Emergence | LIMITED [X1] | MODERATE [U1] | LIMITED [M2] | MODERATE [X2] [P3] | MODERATE [X3] |
| Vegetative | MODERATE [P1] [P2] | STRONG [E2] [M1] | MODERATE [E2] [M2] | STRONG [P3] [X2] [E4] | MODERATE [X3] |
| Tasseling | MODERATE [R2] [M4] | MODERATE [R3] [M4] | MODERATE [M1] [M2] | LIMITED [E4] [X2] | LIMITED [X3] |
| Silking / pollination | STRONG [R2] [P1] | STRONG [R3] [M4] | MODERATE [M1] [E2] | MODERATE [X2] [E4] | LIMITED [X3] |
| Kernel set | STRONG [R1] [R2] | STRONG [R3] | MODERATE [M1] [M2] | LIMITED [X2] [E4] | LIMITED [X3] |
| Grain fill | STRONG [R1] [M4] | STRONG [E6] [M2] | MODERATE [M2] [E6] | MODERATE [E4] [X2] | MODERATE [X3] |
| Dough / dent | MODERATE [M4] [R1] | MODERATE [M2] [X3] | LIMITED [M2] | LIMITED [E4] [X2] | MODERATE [X3] |
| Maturity, after physiological maturity | INSUFFICIENT for new kernel dry-matter loss [X3] | INSUFFICIENT for further grain-growth limitation [X3] | INSUFFICIENT for grain-growth response [M2] [X3] | LIMITED for harvest/quality implications [U1] [X2] | INSUFFICIENT for a new grain-fill loss rule [X3] |

Blister/milk sit within early grain development, not a separately observed NASS bracket here. The strongest heat-stage support does not establish which US hybrid has which exact critical temperature. No additional hail, wind, pest, disease or mycotoxin response is parameterized: these need their own review and inputs.

## J. Production-weighting assessment

### What the proposed multiplication would mean

Let `w_s` be a state's fixed, as-of prior production share of national corn-for-grain production, `f_s` a compatible broad stage-bracket fraction, and `h_s` a weather screen at one representative point. Then `sum(w_s × f_s × h_s)` is a **stage-adjusted, production-associated point-screen proxy**.

It is not established exposed acreage, national production at risk, or damage. Calling it “production-equivalent share simultaneously exposed” would require stronger co-location assumptions than the current data justify. Production-weighting acreage fractions also assumes no systematic within-state productivity difference across those fractions.

Even if crop-area-weighted weather later provides a true area fraction `h`, `f × h` equals the joint stage-and-hazard fraction only under an independence/uniformity assumption. With matching acreage universes at the same time, marginal fractions alone imply bounds:

`max(0, f + h − 1) ≤ joint fraction ≤ min(f, h)`.

This is a mathematical bound, not a crop model. A single point flag is **not** an area fraction, so those bounds cannot rescue the current point design. A stage-adjusted EDD sum has thermal-load units, not percent exposure; never append `%` to it merely because weights sum to one.

### Preferred denominators — design recommendation

| Weight | Appropriate meaning | Principal limitation |
| --- | --- | --- |
| Current intended/planted acreage, known as of issue date | Planting/establishment and crop-area weather exposure | Intentions change; planted area excludes prevented planting; maintain distinct denominators and editions |
| Prior-year planted acreage | Pre-season fallback geography | Crop rotations and acreage shifts; label vintage and do not call current area |
| Prior-year harvested-for-grain area | Grain-producing geography context | Excludes prior abandoned/silage area and embeds the previous season's selection |
| Prior published production share | National economic/production importance context | Mixes area and yields; a poor previous season can underweight that geography |
| Current/final harvested area or production | Retrospective consequence/accounting | Outcome-dependent; cannot be used as if known when the weather occurred |

Prefer acreage weighting for weather coverage and a **parallel** prior-production-context view, not one blended number. Match corn-for-grain versus all planted corn, irrigation status and geography before combining them. If planted progress and grain-production universes cannot be reconciled, disclose the mismatch and withhold precise national joint percentages.

Keep the national denominator fixed within a declared vintage. Missing/outside-pilot shares remain unknown; do not renormalize a ten-state pilot into “100% of US corn.” A covered-area percentage can be shown separately only with that denominator explicit. Repeated weekly shares are not unique affected area; their sum is share-time exposure, not cumulative damaged output. These are aggregation safeguards motivated by measurement semantics [U1] [U3], not literature-estimated yield elasticities.

## K. Spatial-resolution assessment

| Representation | Useful for | Scientific limitation / next gate |
| --- | --- | --- |
| One point per state | Local weather example, limited sentinel | Cannot estimate within-state area or spatial stage overlap |
| Multiple points per state | Sampling heterogeneity | Needs crop-geography-based selection and weights; arbitrary extra points are not a representative sample |
| County-level units | Matching production/acreage and reporting geography | A county centroid still misses subcounty extremes; county boundaries are administrative, not weather cells |
| Crop-area-weighted gridded weather | Spatial integration of actual weather fields over crop geography | Must respect native resolution, crop-mask vintage, irrigation and missing pixels; finer resampling does not create information |

Recommended minimum for a credible **regional exposure percentage**: area-referenced sampling or gridded coverage of the material crop footprint within regions, not one unweighted point. County summaries of crop-area-weighted weather are a practical candidate; compute nonlinear weather metrics before aggregation. No reviewed paper establishes a universal minimum number of points or kilometer grid size for WFL, so none is invented. Resolve adequacy by outcome-blind coverage and weather-representation checks, not yield-fit optimization. [E1] [E3]

Stage and weather resolution must remain visible separately. Finer weather with statewide stage fractions still leaves stage–weather joint distribution uncertain. Synthetic NASS grids can add context but do not remove this identification problem. [U3] [U4]

## L. Candidate model comparison — no historical fitting

The letters identify formulations, not fitted models. Ranking is a qualitative design judgment about scientific interpretability, conditional on adequate inputs; it does not promise better Phase 4C results.

| Rank | Candidate | Basis / interpretability | Availability and robustness | Decision |
| --- | --- | --- | --- | --- |
| 1 | C — stage-aware/weighted thermal exposure | Aligns hazard with development; use continuous B inside it rather than arbitrary stage-loss multipliers [R1] [M4] | Weekly stages available only as broad brackets; numerical overlap and spatial coverage unresolved | Primary architecture, initially conditional rather than a precise national percentage |
| 2 | D — stage-aware heat + moisture/VPD overlap | Separates a well-supported water-demand mechanism [M1] [M2] | Most input-intensive; humidity, irrigation and joint coverage gaps | Companion evidence category, not replacement of all heat evidence |
| 3 | B — EDD above empirical breakpoint | Continuous, duration/intensity-sensitive field metric [E1] | Needs intraday integration/approximation and representative weather | Preferred underlying heat metric after method verification |
| 4 | A — absolute Tmax threshold | Easy to explain and audit [P1] [R2] | Daily data readily available; brief crossing vs sustained heat indistinguishable | Secondary screen; ≥35°C remains heuristic |
| 5 | E — local temperature anomaly | Indicates unusualness, not an absolute physiological load | Requires consistent normal; comparability depends on baseline | Context alongside A/B, never the sole injury screen |

C and D are organizational layers, while B is a weather metric; they are not mutually exclusive competitors. The scientifically coherent design is C using B, with D alongside and A/E as context. Near-term implementation feasibility does not justify pretending C/D inputs already exist.

## M. Evidence Basis Registry specification — conceptual only

One versioned record per rule, with separate entries for scientifically supported concepts and their numerical implementations:

| Field | Required meaning |
| --- | --- |
| `ruleId`, `methodologyVersion` | Stable concept identifier and immutable reviewed edition |
| `concept`, `intendedClaim`, `prohibitedClaims` | What the rule measures and what it must not imply |
| `evidenceType` | Empirical field, meta-analysis, controlled physiology, process model, official methodology, Extension, or WFL design |
| `evidenceStrength`, `evidenceTier` | Qualitative strength separately from A/B/C implementation tier |
| `literatureSources` | Verified author/year/title/DOI or official URL, relevant section and access level; distinguish shared datasets |
| `applicableCropStage`, `applicableRegion`, `managementDomain` | Stage definition, US/rainfed transfer and irrigation/genotype caveats |
| `proposedMetric`, `units`, `temporalSupport`, `spatialSupport` | Exact quantity and native/aggregated resolution |
| `proposedRange`, `exactThresholdSupported`, `thresholdCategory` | Range versus exact value, and empirical/physiological/model/WFL category |
| `heuristicComponent`, `limitations` | Explicit unsupported numerical choices and applicability limits |
| `inputRequirements`, `missingnessPolicy` | Required aligned inputs; unavailable is not zero |
| `denominator`, `weightVintage`, `jointExposureAssumption` | Needed whenever a percentage or weighted exposure is reported |
| `sourcePublication`, `observedPeriod`, `revisionIdentity`, `availableAsOf` | Publication and observation chronology, not fetch-time substitution |
| `reviewedAt`, `reviewStatus`, `freezeIdentifier` | Draft/reviewed/frozen/superseded state and audit trail |

Example records (design, not code):

- `heat_extreme_degree_days`: empirical field + model evidence [E1] [M1]; strong concept/Tier A, numerical integration and selected base Tier B; candidate base 29–30°C; no universally exact damage threshold; hourly or declared reconstruction required; units °C·days; prohibits percent-loss claims.
- `five_consecutive_hot_days`: duration concept has support [R1], **exact five-day rule does not**; Tier C; no selected scientific range; daily completeness required; no biological-certainty badge.
- `stage_bracket_fraction`: official milestones [U1], derived WFL bracket Tier B; no numerical sensitivity multiplier; same-date/edition/universe required; limitations include coarse timing and joint-location uncertainty.
- `heat_water_overlap`: literature-supported concept [M1] [M2], operational thresholds Tier C; requires aligned independently measured inputs and stage information; unknown if a component is missing; co-occurrence only.

## N. Recommended Phase 4B architecture

```text
As-of source editions + crop universe + geography/acreage + coverage
             │
             ├── Official cumulative progress → valid broad stage brackets
             ├── Weather → continuous heat / water / atmospheric-demand metrics
             └── Evidence registry → claim limits and missingness rules
                          │
           Spatial + temporal compatibility gate
                          │
        Stage-aware exposure, with explicit joint assumptions
             ├── Stand-alone heat and water evidence
             ├── Independently supported co-exposure
             └── Separate wetness / establishment-delay evidence
                          │
          Side-by-side dated official condition observations
          and later USDA area / yield / production revisions
          (comparison, NOT a causal or predictive conversion)
```

Useful lessons from mature models: separate developmental thermal time from stress; distinguish source growth, reproductive set and filling; represent water supply/demand and stage; acknowledge management and cultivar context. CERES/IXIM comparison shows that explicit reproductive processes can matter while kernel-weight prediction remains difficult; algorithm-ensemble work shows that apparently similar yields can hide different modeled stress pathways. Do not implement APSIM, DSSAT, or a miniature uncalibrated copy. [M3] [M4] [U7]

### Implementation gates, not implementation instructions for this task

1. **Allowed first after approval:** evidence registry, variable definitions, cumulative progress and broad brackets with guards, continuous point-weather diagnostics, separated condition and wetness/progress context. Keep point labels.
2. **EDD gate:** document base(s), integral approximation, units, daily boundaries, missing-hour handling and weather spatial support. Check with analytical/synthetic weather cases, not yield outcomes.
3. **Regional-percentage gate:** establish acreage footprint, denominator, source vintage and within-region weather representation. Otherwise retain associated-point language.
4. **Stage-weighting gate:** define weekly-to-daily assumptions and joint-location uncertainty. No exact-stage percentages from a scalar grid index.
5. **VPD gate:** validate humidity/dew-point source, matching resolution, variable definition and availability history. Missing VPD stays missing.
6. **Wetness gate:** distinguish modeled wetness percentile from saturation; prefer official fieldwork/progress confirmation. No automatically inferred flood loss.
7. **Validation gate:** complete and freeze the protocol in R before holdout evaluation. More plausible agronomy is not evidence of improved predictive skill.

## O. Proposed parameter table

Tier A = strongly supported concept; Tier B = literature-informed implementation; Tier C = WFL heuristic. A strong concept does not make its exact operational cutoff Tier A. “No exact value” is intentional, not an invitation to optimize one against 2012–2019.

| Parameter / rule | Agricultural meaning and evidence | Tier | Exact value / range supported | Category | Uncertainty and recommendation |
| --- | --- | --- | --- | --- | --- |
| Nonlinear heat response | Extreme exposure differs from benign warmth [E1] [M1] | A concept | No portable loss coefficient | Empirical relationship | Represent thermal load, not yield response |
| EDD base | Reference for accumulated supra-breakpoint heat [E1] [M1] | B implementation | Approximately 29–30°C candidate range | Empirical breakpoint | Not a universal damage threshold; predeclare base(s) |
| EDD integration | Magnitude × time | B | Formula in C; no fitted constants | Measurement convention | Validate hourly/reconstructed method; incomplete window explicitly partial |
| Hot-day Tmax | Simple absolute extreme screen [P1] [R2] | C exact cutoff | Existing ≥35°C retained only as labeled heuristic | WFL heuristic | Secondary; no injury claim |
| Hot-day count and longest run | Event persistence [R1] | A concept / B summary | Observed count/run; no injury cutoff | Measurement convention | Report values; retain missing-day uncertainty |
| Alert duration | Notification rule | C | None scientifically established here | WFL heuristic | Do not introduce 3/5/7-day severity boundary as fact |
| GDD development convention | Thermal development [X1] | B | Common 50/86°F convention | Model/agronomic convention | Exact algorithm and planting origin needed; no borrowed cultivar stage totals |
| Stage-bracket fraction | Broad acreage development context [U1] | B | Same-edition cumulative differences | WFL derivation from official measures | No exact pollination, R2/R3 or ASI inference |
| Stage sensitivity multiplier | Relative damage by stage [R1] [R2] | C if assigned | None transferable here | Unsupported WFL heuristic | **Do not implement numeric multipliers** |
| Stage report age / daily mapping | Temporal eligibility | B/C | No biological freshness cutoff | Operational convention | Declare as-of rule; unknown beyond justified support |
| Rainfall deficit | Water-supply context [R3] [M1] | B metric / C cutoff | No universal mm or percentile threshold | WFL screen | Keep quantity, period and baseline visible |
| Root-zone wetness deficit | Modeled water-status context [E3] [M2] | B metric / C cutoff | No universal wetness-index threshold | WFL screen | Product-specific; not plant-available water |
| VPD | Atmospheric demand [M1] [M2] [U6] | A concept / B calculation | Physical calculation; no universal kPa injury boundary | Physical metric; cutoff would be heuristic | Validate humidity source before enabling |
| Heat–water/VPD overlap | Co-occurrence during relevant development [M1] [M2] | B combination / C screens | No damage multiplier | WFL evidence intersection | Same support; no additive independent-risk score |
| Excess wetness / rain persistence | Establishment/root/operations context [E4] [X2] | B metric / C cutoff | No universal duration or percentile | WFL screen | Separate from drought; no saturation diagnosis from percentile alone |
| Planting/progress departure | Reported activity/development lag [U2] | B | Percentage-point departure from declared as-of reference | Official comparison / WFL presentation | Not causal delay or lost hectares; no fitted warning boundary |
| Fieldwork days | Operational access context [U1] | B integration | Official reported unit, days | Official measure | Not an inferred yield response |
| Area weights | Crop geography, J [U1] [U3] | B | Published vintage-specific shares | Aggregation convention | Consistent crop universe; no outcome-dependent future weights |
| Production-context weights | National importance, J | B | Prior published production shares | Aggregation convention | Context, not exposed or damaged production |
| Baseline normal | Local unusualness | B/C | No unique agronomic baseline period | Statistical convention | Document climatology/version; future years invalidate historical as-of claims |
| Analysis window | Comparable summaries | C choice | No universal seven-day biological window | WFL convention | Weekly reporting cadence ≠ physiological event length |
| Spatial grid / sample size | Representativeness | B design | No universal kilometer/point minimum | Sampling convention | Outcome-blind weather/coverage audit required |
| Coverage threshold / color bands | Eligibility and communication | C | Not assigned | WFL heuristic | Missing/outside coverage explicit; no automatic low-risk rating |
| Condition comparison lag / decline threshold | Validation target, not physiology [U1] | C | None selected by literature here | Research convention | Preregister; use continuous changes primarily; not damage ground truth |

This table covers all numerical or categorical choices proposed here. Any later added parameter needs its own registry entry before the methodology can be frozen.

## P. Parameters that must remain explicitly heuristic

Exact hot-day cutoffs; required counts/runs; weekly/monthly/event window lengths; precipitation/wetness/VPD percentile screens; a minimum overlap share; stage-report expiry and forward mapping; baseline selection; coverage gates; color/alert levels; escalation/de-escalation rules; notification persistence; selected condition-change lags and warning success criteria.

A UI must not convert “screen triggered” into “damage confirmed.” Example acceptable wording: “Heat and low modeled root-zone wetness overlapped at monitored locations; reported crop progress places part of the state's acreage between silking and dough. Joint exposed acreage is not established.” An untriggered screen is not “crop safe.”

## Q. What should NOT be implemented

- Yield-loss percentages, lost tonnes, field mortality, or calibrated loss probabilities from weather screens.
- Pollen sterility, exact fertilization failure or kernel abortion from daily air Tmax.
- Fixed stage damage multipliers, universal ASI estimates, or pooled experimental losses used as US commercial-field coefficients.
- Precise pollination hectares from statewide milestones, calendar templates, or inversion of the NASS gridded index.
- A national affected-area/production percentage inferred from representative state points.
- A VPD field synthesized from temperature without moisture data; a drought diagnosis from rain alone; a saturation diagnosis from high wetness percentile alone.
- Causal attribution of USDA revisions or crop-condition changes to a specific weather event.
- Automatic summation of correlated hazards, repeated weekly shares, or overlapping stage brackets into a loss/risk score.
- Full process-model implementation or speculative cultivar/soil/management parameters to make the dashboard appear mechanistic.
- Hail, wind, disease, toxins, adaptation factors, or night-heat injury rules without their own adequate evidence and inputs.
- Production warning upgrades justified by better fit to the already examined seasons.

## R. Methodology freeze and holdout protocol

**No freeze is claimed by this document.** It leaves unresolved measurement choices; they must be resolved without holdout performance feedback.

1. Complete this literature review and record source access limitations. Obtain agronomic review of disputed stage mappings before freezing.
2. Complete a precise methodology specification: source universe, native resolution, versioned crop masks, weights, normal periods, weather transforms, stage brackets, time assignment, missingness, overlap assumptions and permitted claims.
3. Classify every parameter A/B/C and distinguish threshold category. Predeclare both 29°C and 30°C EDD outputs if both are retained; no later winner selection disguised as prior methodology.
4. Inventory **all** previously accessed outcome information. 2012–2019 is development-only. Existing live examples, fixture years and earlier case studies may also contaminate candidate years; do not automatically call every other year untouched.
5. Conduct an outcome-blind availability audit, ideally using source metadata only. Declare year inclusion by archive completeness and prespecified chronology, not drought severity, known dramatic outcomes, or preliminary correlations. If candidate outcome data must be staged, keep them sealed until freeze.
6. Freeze a dated immutable methodology/version manifest, configuration and source identities. Record all decisions and their rationale, including those informed by Phase 4A's known limitations. User approval and the identifier precede access to holdout performance. No commit is performed in this task.
7. Separate retrospective agronomic assessment from point-in-time alert validation. Revised weather, hindsight climatologies, later crop masks or corrected archives cannot demonstrate historical live availability. For genuine as-of evaluation use only evidence available by each issue time; otherwise label retrospective.
8. Preregister outcomes and analysis before unsealing: continuous official condition changes; yield revisions distinct from production and area revisions; any detrended final-yield target requires a separately declared trend procedure trained without holdout outcomes. The first available forecast may already contain event damage; a later revision alone is an incomplete crop-loss target.
9. Predeclare lags, weather/condition alignment, event grouping, comparator and multiplicity handling. Compare added stage/compound structure with prespecified simpler descriptors on identical coverage. No retrospective definition changes to turn quiet-screen cases into successes.
10. Evaluate all eligible holdout seasons once, including quiet and adverse years. Report exclusions, missing denominators and results unfavorable to the hypothesis. State-weeks are correlated; use season/event-aware uncertainty, and do not present hundreds of overlapping windows as hundreds of independent seasons.
11. Report descriptive agronomic agreement separately from forecast skill and actionable lead time. If outcomes are too sparse or noisy, retain **inconclusive**. Do not label condition declines as proven weather losses.
12. Any material change after seeing holdout results creates a new version; those years become examined/development data. Reserve additional untouched/prospective seasons. Numerical warning calibration, if ever authorized, is a separate study rather than this Phase 4B specification.

No holdout years are selected here, no new yield/condition outcome dataset is collected, and no optimization or model replay is run.

## S. Verified bibliography

Identifiers below link to original publications or official/institutional sources. Access limitations refer to this review, not the inherent quality of the publication. Articles are cited once here even when they inform multiple evidence families.

### Empirical weather–yield studies

- **E1.** Schlenker, W.; Roberts, M. J. (2009). *Nonlinear temperature effects indicate severe damages to U.S. crop yields under climate change.* Proceedings of the National Academy of Sciences, 106, 15594–15598. [DOI 10.1073/pnas.0906865106][E1]. [Accessible manuscript](https://matthewturner.org/ec1340/readings/Schlenker_Roberts_PNAS_2009.pdf). US county analysis; article methods reviewed.
- **E2.** Lobell, D. B.; Roberts, M. J.; Schlenker, W.; Braun, N.; Little, B. B.; Rejesus, R. M.; Hammer, G. L. (2014). *Greater sensitivity to drought accompanies maize yield increase in the U.S. Midwest.* Science, 344, 516–519. [DOI 10.1126/science.1251423][E2]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/24786079/).
- **E3.** Lobell, D. B.; Deines, J. M.; Di Tommaso, S. (2020). *Changes in the drought sensitivity of US maize yields.* Nature Food, 1, 729–735. [DOI 10.1038/s43016-020-00165-w][E3]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/37128028/).
- **E4.** Li, Y.; Guan, K.; Schnitkey, G. D.; DeLucia, E.; Peng, B. (2019). *Excessive rainfall leads to maize yield loss of a comparable magnitude to extreme drought in the United States.* Global Change Biology, 25, 2325–2337. [DOI 10.1111/gcb.14628][E4]. [Author manuscript](https://publish.illinois.edu/delucia-lab/files/2021/10/Li_et_al-2019-Global_Change_Biology.pdf).
- **E5.** Lesk, C.; Coffel, E.; Horton, R. (2020). *Net benefits to US soy and maize yields from intensifying hourly rainfall.* Nature Climate Change, 10, 819–822. [DOI 10.1038/s41558-020-0830-0][E5]. Publisher material reviewed; not a replication of its estimates.
- **E6.** Zhao, H.; Tack, J. B.; Kluitenberg, G. J.; Kirkham, M. B.; Sassenrath, G. F.; Zhang, L.; Wan, N.; Liu, Z.; Zhao, J.; Ashworth, A.; Gowda, P. H.; Lin, X. (2025). *Concurrent improvements in maize yield and drought resistance through breeding advances in the U.S. Corn Belt.* Nature Communications, 16, 9389. [DOI 10.1038/s41467-025-64454-3][E6]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/41130997/). Hybrid-trial finding retained as a transferability counterpoint, not an imported adaptation coefficient.

### Physiology and field experiments

- **P1.** Siebers, M. H.; Slattery, R. A.; Yendrek, C. R.; Locke, A. M.; Drag, D.; Ainsworth, E. A.; Bernacchi, C. J.; Ort, D. R. (2017). *Simulated heat waves during maize reproductive stages alter reproductive growth but have no lasting effect when applied during vegetative stages.* Agriculture, Ecosystems & Environment, 240, 162–170. [DOI 10.1016/j.agee.2016.11.008][P1]. [Author laboratory record](https://lab.igb.illinois.edu/ort/publications/simulated-heat-waves-during-maize-reproductive-stages-alter-reproductive-growth-have).
- **P2.** Begcy, K.; Nosenko, T.; Zhou, L.-Z.; Fragner, L.; Weckwerth, W.; Dresselhaus, T. (2019). *Male Sterility in Maize after Transient Heat Stress during the Tetrad Stage of Pollen Development.* Plant Physiology, 181, 683–700. [DOI 10.1104/pp.19.00707][P2]. [PubMed and full-text links](https://pubmed.ncbi.nlm.nih.gov/31378720/). Controlled experiment; no field threshold transfer.
- **P3.** Kanwar, R. S.; Baker, J. L.; Mukhtar, S. (1988). *Excessive Soil Water Effects at Various Stages of Development on the Growth and Yield of Corn.* Transactions of the ASAE, 31, 133–141. [DOI 10.13031/2013.30678][P3]. [Verified publisher abstract](https://elibrary.asabe.org/abstract.asp?aid=30678&redir=&redirType=&t=2). Field water-table evidence; older genetics and specific soil/site limit transfer.

### Process-based crop models

- **M1.** Lobell, D. B.; Hammer, G. L.; McLean, G.; Messina, C.; Roberts, M. J.; Schlenker, W. (2013). *The critical role of extreme heat for maize production in the United States.* Nature Climate Change, 3, 497–501. [DOI 10.1038/nclimate1832][M1]. [Institutional abstract](https://era.dpi.qld.gov.au/id/eprint/3842/). APSIM mechanism evidence; full parameter audit not performed.
- **M2.** Hsiao, J.; Swann, A. L. S.; Kim, S.-H. (2019). *Maize yield under a changing climate: The hidden role of vapor pressure deficit.* Agricultural and Forest Meteorology, 279, 107692. [DOI 10.1016/j.agrformet.2019.107692][M2]. [Institutional manuscript](https://www.osti.gov/servlets/purl/1799097). MAIZSIM/2DSOIL scenario evidence, not observed loss calibration.
- **M3.** Jin, Z.; Zhuang, Q.; Tan, Z.; Dukes, J. S.; Zheng, B.; Melillo, J. M. (2016). *Do maize models capture the impacts of heat and drought stresses on yield? Using algorithm ensembles to identify successful approaches.* Global Change Biology, 22, 3112–3126. [DOI 10.1111/gcb.13376][M3]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/27251794/).
- **M4.** Lizaso, J. I.; Ruiz-Ramos, M.; Rodríguez, L.; Gabaldon-Leal, C.; Oliveira, J. A.; Lorite, I. J.; Rodríguez, A.; Maddonni, G. A.; Otegui, M. E. (2017). *Modeling the response of maize phenology, kernel set, and yield components to heat stress and heat shock with CSM-IXIM.* Field Crops Research, 214. [DOI 10.1016/j.fcr.2017.09.019][M4]. [Publisher abstract/method context](https://www.sciencedirect.com/science/article/pii/S0378429017310171). Spain field/greenhouse comparison; geographic and cultivar limits, not US validation.

### Meta-analyses and reviews

- **R1.** Niu, S.; Yu, L.; Li, J.; Qu, L.; Wang, Z.; Li, G.; Guo, J.; Lu, D. (2024). *Effect of high temperature on maize yield and grain components: A meta-analysis.* Science of the Total Environment, 952, 175898. [DOI 10.1016/j.scitotenv.2024.175898][R1]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/39222820/). Full methods/supplements not obtained; no pooled effect imported.
- **R2.** Lv, X.; Yao, Q.; Mao, F.; Liu, M.; Wang, Y.; Wang, X.; Gao, Y.; Wang, Y.; Liao, S.; Wang, P.; Huang, S. (2024). *Heat stress and sexual reproduction in maize: unveiling the most pivotal factors and the greatest opportunities.* Journal of Experimental Botany, 75, 4219–4243. [DOI 10.1093/jxb/erad506][R2]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/38183327/). Mechanistic review, not a US field-response meta-analysis.
- **R3.** Boyer, J. S.; Westgate, M. E. (2004). *Grain yields with limited water.* Journal of Experimental Botany, 55, 2385–2394. [DOI 10.1093/jxb/erh219][R3]. [Verified abstract](https://pubmed.ncbi.nlm.nih.gov/15286147/). Reproductive water/carbon physiology review; maize findings distinguished from small-grain discussion.

### USDA and other official methodology

- **U1.** USDA NASS (2016, page last modified October 19). *Crop Progress/Crop Weather Terms and Definitions.* [Official definitions][U1]. Operational definitions, not yield-response estimates.
- **U2.** USDA NASS (undated, accessed 2026-10-04). *Surveys: Crop Progress and Conditions.* [Official survey guide][U2].
- **U3.** USDA NASS (2021 metadata; accessed 2026-10-04). *Crop Progress Data Layer.* [Official metadata][U3]. Synthetic index formula, geography and limitations.
- **U4.** USDA NASS (undated, accessed 2026-10-04). *Crop Progress and Condition Layers Description.* [Official technical description][U4]. Synthetic-surface methodology; not field observations.
- **U5.** USDA NASS (accessed 2026-10-04). *Crop Progress Gridded Layers.* [Official product entry][U5]. Dataset access/coverage; no crop-outcome files downloaded for this review.
- **U6.** Allen, R. G.; Pereira, L. S.; Raes, D.; Smith, M. (1998). *Crop evapotranspiration: Guidelines for computing crop water requirements.* FAO Irrigation and Drainage Paper 56, Chapter 3. [Meteorological data and vapor-pressure calculations][U6]. Physical calculation guidance, not a maize injury threshold.
- **U7.** DSSAT Foundation (undated, accessed 2026-10-04). *Model Components* and *Plant Module.* [Model structure][U7]; [CERES-Maize and IXIM modules](https://dssat.net/plant-module/). Official software documentation, separate from peer-reviewed model evaluation.

### University Extension — operational guidance, separate evidence class

- **X1.** Nielsen, R. L. (2020, updated April). *Heat Unit Concepts Related to Corn Development.* Purdue University Agronomy. [Official Extension article][X1].
- **X2.** Coulter, J.; Naeve, S.; Malvick, D.; Fernandez, F. (reviewed 2021). *Flooded corn.* University of Minnesota Extension. [Official guidance][X2]. Conditional agronomy, not a nationwide dose–response function.
- **X3.** Coulter, J.; Hicks, D. R.; Naeve, S. L.; Nicolai, D. (reviewed 2021). *Corn growth and development.* University of Minnesota Extension. [Official guidance][X3]. Stage interpretation and maturity context, not calibrated hazard weights.

### Delivery / non-action record

This review adds only this Markdown specification. Application code, configuration, tests, source caches and historical artifacts are not changed. No test/replay is needed to validate a code change because none is made; no new test-pass claim is asserted. No commit, push, deployment, email, threshold optimization, holdout evaluation or yield model is performed.

[E1]: https://doi.org/10.1073/pnas.0906865106
[E2]: https://doi.org/10.1126/science.1251423
[E3]: https://doi.org/10.1038/s43016-020-00165-w
[E4]: https://doi.org/10.1111/gcb.14628
[E5]: https://doi.org/10.1038/s41558-020-0830-0
[E6]: https://doi.org/10.1038/s41467-025-64454-3
[P1]: https://doi.org/10.1016/j.agee.2016.11.008
[P2]: https://doi.org/10.1104/pp.19.00707
[P3]: https://doi.org/10.13031/2013.30678
[M1]: https://doi.org/10.1038/nclimate1832
[M2]: https://doi.org/10.1016/j.agrformet.2019.107692
[M3]: https://doi.org/10.1111/gcb.13376
[M4]: https://doi.org/10.1016/j.fcr.2017.09.019
[R1]: https://doi.org/10.1016/j.scitotenv.2024.175898
[R2]: https://doi.org/10.1093/jxb/erad506
[R3]: https://doi.org/10.1093/jxb/erh219
[U1]: https://www.nass.usda.gov/Publications/National_Crop_Progress/terms_definitions.php
[U2]: https://data.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Crop_Progress_and_Condition/index.php
[U3]: https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/metadata/metadata_CropProgress.htm
[U4]: https://data.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/CropProgressandConditionLayersDescription.pdf
[U5]: https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/
[U6]: https://www.fao.org/4/X0490E/x0490e07.htm
[U7]: https://dssat.net/models-overview/components/
[X1]: https://www.agry.purdue.edu/ext/corn/news/timeless/HeatUnits.html
[X2]: https://extension.umn.edu/agriculture/crop-production/corn/flooded-corn
[X3]: https://extension.umn.edu/agriculture/crop-production/corn/growth-and-development
