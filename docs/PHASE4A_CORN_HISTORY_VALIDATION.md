# Phase 3.5 / 4A — US corn historical assessment

Completed 2026-10-04 Pacific / 2026-10-05 UTC. Research only. No deployment,
email, live-rule tuning, next crop, prediction model, or database migration.

**Decision: Weak/inconclusive overall.** There is descriptive historical
consistency with sustained hot/dry stress, but weak coverage of subsequent
condition declines and no demonstrated negative relationship with later yield
revisions. The framework remains a narrow screening aid, not a general crop-loss
detector. **Brazil replication: Not yet.** First review crop-stage alignment and
the explicitly limited stage coverage, using independent validation before any
production change. No proposed model improvement below is implemented here.

## A. Historical data inventory

The [pre-replay protocol](CORN_HISTORY_PROTOCOL.md) records the availability audit
and fixed choices before running the eight-season evaluation. Provider archive
extent is distinct from the actual downloaded sample.

| Dataset | Documented/verified availability; resolution | Evidence actually collected | Revision and publication boundary |
| --- | --- | --- | --- |
| NASA POWER weather | Daily meteorology from 1981; MERRA-2 meteorology grid approximately 0.5° latitude × 0.625° longitude; not field measurements | 2012-03-25–2019-12-07, ten fixed state points plus two Iowa diagnostic points; maximum/minimum temperature, rain, root/top wetness | Current reanalysis download; no historical delivery snapshots. Model wetness is a 0–1 index, not measured volumetric moisture |
| Weather normals | Existing Phase 3, 1991–2020; ten points, matching-calendar seven-day windows with 30 annual samples | The existing baseline records copied unchanged into frozen research inputs | Revised weather-derived climatology. Includes years later than every evaluated season; availability at historical origin is not established |
| Production weights | NASS Annual Summary; annual corn-for-grain state and US estimates | Nine dated reports, 2012-01-12–2020-01-10, crop years 2011–2019; ten states plus national production, yield and harvested area | Published estimate vintages, not latest final values. Prior-crop-year report published before April 1 determines each season's weights |
| Crop Progress | ESMIS monthly archive selector extends back to April 1995; weekly during growing season; state cumulative milestones | 263 accepted corn reports, publication 2012-04-02–2019-11-25; observation weeks 2012-04-01–2019-11-24 | Dated archived editions. Missing milestones are absent, not zero; report publication day is preserved. Exact original publication clock is not assumed |
| Crop condition | Same weekly NASS reports and geography; good/excellent and other categories when published | Seasonal subset of those 263 reports; comparisons use only exactly paired observed weeks | Survey categories, not measured yield losses. No forward-fill into missing outcome weeks; ambiguous duplicate editions are not ordered by guesswork |
| Yield / production / harvested area | Monthly NASS Crop Production; national corn-for-grain table in this research | 31 August–November releases, 2012-08-10–2019-11-08, plus next post-harvest Annual Summary for each season | Actual publication vintages. October 2013 absent following shutdown; retained as a gap. 2018 annual estimate was published 2019-02-08, not fabricated as a January release |
| Latest final yield / production anomalies | A latest-final series would be a separate revised-history input | Not collected or inferred | Explicitly unavailable; annual published changes are not detrended anomalies or final history |
| WASDE publication vintages | USDA describes as-published CSV history beginning April 2010, with consolidated historical ZIPs | The 2010–2015 ZIP returned HTTP 403 in this environment | Vintages exist at the provider; access failure is not evidence of nonexistence. No synthetic vintages were made from current PSD |
| PSD | Current application bulk history from 2000; marketing-year values, US contributor coverage currently insufficient for the pilot | Not used in this study | Current revised history is not an archive of monthly publication-time values; NASS national corn evidence is used separately |

Official references: [NASA methodology](https://power.larc.nasa.gov/docs/methodology/meteorology/),
[NASS Crop Progress archive](https://esmis.nal.usda.gov/publication/crop-progress),
[Annual Summary archive](https://esmis.nal.usda.gov/publication/crop-production-annual-summary),
[Crop Production archive](https://esmis.nal.usda.gov/publication/crop-production),
[USDA historical WASDE data](https://www.usda.gov/historical-wasde-report-data-3).

There are 25 exclusion/notices records: 14 texts with no corn progress tables and
11 publication/rescheduling/special notices that contain no parseable crop data.
These are **not 25 invented missing observations**. Their exact URLs and reasons
remain in `sourceGaps`; missing scheduled windows and actual condition-pair
denominators are accounted for separately. All 278 weather windows have ten
usable points and baselines; official condition coverage is smaller.

## B. Validation methodology

- Replay `us-corn-point-exposure/v1` directly from the existing `productionWeights`,
  `cropStage` and `weatherWindow` functions. No competing historical model.
- Sunday-ending seven-day weather windows, April–November. Evaluation date is
  four days after the window, not a claim of same-Sunday availability.
- Use no weather day beyond the window. Select official stage reports observed
  no later than the window, at most seven days old, and published strictly before
  evaluation day. A same-day publication is not assumed known with day-only timestamps.
- Match metadata observation period and publication vintage. Conflicting same-day
  editions are unavailable rather than assigned an invented correction order.
- Use previous crop year's published production divided by the US total, never
  current season final weights. Ten-state coverage varies from 78.26% to 83.82%;
  outside/missing shares are not redistributed.
- Heat: at least three stage-relevant days with maximum ≥35°C. Moisture: all
  seven days relevant and both rain and root wetness below their matching-window
  20th percentiles. Retain temperature, rainfall and root-wetness anomalies.
- Preserve calendar stage and official cumulative milestones separately. A
  cumulative milestone is not the fraction of fields currently in that stage.
- Pair official good+excellent (GE) changes at fixed 1, 2 and 4 week observation
  intervals. Decline ≥5 percentage points is a research convention, not ground
  truth of economic injury. These lags are measured from weather-window end, not
  from the later evaluation timestamp.
- Join condition and supply outcomes only after exposure calculation. Record all
  comparisons, not only favorable cases. No interpolation of missing endpoints.
- Describe Pearson and average-tied-rank Spearman over eight complete season
  pairs. No composite accuracy, significance or out-of-sample skill claim.

The deterministic output is `src/data/cornHistory.json`; normalized evidence is
`research/corn-history-inputs.json`. Each season identifies dates, regions, stages,
coverage, conditions, supply editions, outcome limits and canonical input versions.
Original download URLs, fetch timestamps and content hashes are preserved; the
input bundle additionally preserves source-byte hashes. Download cache resides
outside the repository at `/private/tmp/wfl-corn-history-raw` and is not required
for offline replay from the normalized bundle. Raw-byte archival is local here,
not a new durable data platform.

Reproduce offline:

```sh
node scripts/evaluate_corn_history.mjs
npm test
npm run build
```

The generator binds the exact input-file bytes and eight replay/configuration
source files in `replay.sourceFiles`; identical frozen inputs/code produce the
same artifact. Fresh collection is explicit via `collect_corn_history.py`, never
part of daily monitoring. New fetches may reflect provider revisions and are a
different research input, not expected to reproduce identical historical bytes.

## C. Retrospective vs point-in-time boundary

**Full retrospective replay: available. Full point-in-time replay: unavailable.**
Calling point-in-time mode returns structured unavailable reasons and no numeric
timeline. The official-only as-of selector is tested, but it cannot turn revised
weather plus hindsight normals into a true historical trading/alert experiment.

NASS values retain their dated published editions. Later supply outcomes never
feed weights, weather or stage calculations. Condition outcomes are retrospective
comparisons of archived editions; there is no claim that today's archive proves
every original intraday delivery or replacement time. A corrected archive at an
unchanged URL could require deeper provenance than presently available.

The 1991–2020 normal and currently retrieved reanalysis are intentional hindsight
inputs in this agronomic assessment. They prohibit conclusions such as “the live
website would certainly have warned on this date.” No latest-final outcome is
silently relabeled as a contemporaneous estimate.

## D. Seasons evaluated

2012–2019 inclusive: eight consecutive seasons, no dropped unfavorable season,
278 weekly windows / 2,780 potential state-weeks. This adds every intervening year
between the existing 2012 and 2019 case anchors; it is not a random representative
sample of all climatic regimes. Results include a high-exposure season (2012),
intermediate seasons (2013/2017), low-screen seasons (2014–2016/2018), and the
wet/late-progress contrast visible in 2019. These descriptions follow the evidence,
not inclusion thresholds. Low-screen is never a label of agricultural safety.

Planting, emergence, vegetative, silking, grain fill, maturity and harvest windows
are all retained. Calendar timing varies by configured region, with dated official
milestones alongside it. The live reproductive-stage screen is **not** generalized
to planting or flooding just to improve historical scores.

## E. Exposure results

“Associated share” means the national production weights of states whose points
screened, **not affected acres, damaged output or yield loss**. Share-weeks add
fractions across time and repeat the same production; 1.0 share-week is not 100%
of output damaged.

| Season | Complete weeks | Any-screen weeks | Maximum associated share | Heat share-weeks | Moisture share-weeks | Union share-weeks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2012 | 35 | 11 | 75.52% | 3.915 | 3.049 | 4.481 |
| 2013 | 34 | 10 | 52.93% | 0.994 | 1.572 | 2.306 |
| 2014 | 35 | 5 | 15.31% | 0.294 | 0.153 | 0.447 |
| 2015 | 35 | 5 | 3.98% | 0.159 | 0.034 | 0.193 |
| 2016 | 35 | 4 | 20.38% | 0.285 | 0.110 | 0.395 |
| 2017 | 35 | 7 | 37.69% | 0.627 | 0.873 | 1.500 |
| 2018 | 35 | 7 | 8.48% | 0.301 | 0.126 | 0.390 |
| 2019 | 34 | 1 | 4.47% | 0.045 | 0 | 0.045 |

2012's first screened week ends July 1: it does **not** precede all condition
deterioration (see May/June Iowa below). Iowa, Nebraska and Illinois contribute
1.144, 0.994 and 0.788 union share-weeks respectively. In 2017 Iowa contributes
0.905 of 1.500. State contributions are retained for every season; maximum share
alone would conceal these regional and temporal differences.

## F. Crop-condition comparison

These are pooled state-week pairs, not independent weather episodes or independent
statistical samples. Exposure means heat OR moisture.

| Lag weeks | Paired state-weeks | Exposed pairs | Exposed with decline <5 pp (FP-like) | Quiet with decline ≥5 pp (FN-like) | Mean GE change exposed | Mean GE change quiet | Improved after screen ends / available pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,630 | 118 | 98 | 100 | −1.97 pp | −0.32 pp | 20 / 60 |
| 2 | 1,540 | 118 | 86 | 183 | −3.00 pp | −0.81 pp | 29 / 59 |
| 4 | 1,400 | 111 | 68 | 257 | −3.85 pp | −1.88 pp | 21 / 47 |

At two weeks, 32/215 deterioration-like pairs had exposure (14.88% descriptive hit
fraction); 86/118 exposed pairs had less than five-point subsequent decline
(72.88% FP-like fraction). This is not a conventional false-positive rate, which
would use all negative outcomes as denominator. The outcome classification cannot
identify actual damaged fields. More negative average changes after screens offer
some consistency, but do not establish causation, calibration or useful lead time.

## G. Yield / production comparison

Compare the first August national NASS corn forecast with its next post-harvest
annual estimate, preserving every intermediate acquired publication.

| Season | Yield revision bu/acre | Production revision % | Harvested-area revision, thousand acres | Annual yield minus prior-year published estimate, bu/acre |
| --- | ---: | ---: | ---: | ---: |
| 2012 | 0.0 | +0.016 | +14 | −23.8 |
| 2013 | +4.4 | +1.178 | −1,467 | +35.4 |
| 2014 | +3.6 | +1.309 | −703 | +12.2 |
| 2015 | −0.4 | −0.620 | −352 | −2.6 |
| 2016 | −0.5 | −0.036 | +198 | +6.2 |
| 2017 | +7.1 | +3.187 | −793 | +2.0 |
| 2018 | −2.0 | −1.141 | −30 | −0.2 |
| 2019 | −1.5 | −1.504 | −535 | −8.4 |

The final column is neither a detrended yield anomaly nor a latest-final estimate.
Final yield/production anomalies remain unavailable. Production revisions mix area
and yield; they must not be attributed to weather alone.

2012 August yield was already 123.4 bu/acre; the January publication was also
123.4. A zero subsequent revision misses the earlier collapse, not its existence.
2017 has substantial exposure and a **positive** 7.1 bu/acre revision. These two
cases caution against treating August-to-annual change as a complete loss target.

| Cumulative metric vs published yield revision | n seasons | Pearson | Spearman |
| --- | ---: | ---: | ---: |
| Heat share-weeks | 8 | 0.005 | 0.548 |
| Moisture share-weeks | 8 | 0.219 | 0.667 |
| Union share-weeks | 8 | 0.235 | 0.714 |

These are not the hypothesized negative relationships. Rank and linear results
differ materially; small sample, nonlinear responses, timing and multiple tests
preclude selecting whichever coefficient sounds favorable. There is no demonstrated
yield forecasting ability. Earlier WASDE vintages and explicit trend-adjusted
outcomes would be separate future research, not invented in this artifact.

## H. False-positive-like / false-negative-like diagnosis

All cases retain baseline/outcome input IDs and official source URLs.

- **Iowa, 2012-05-20 → June 3:** GE 81% → 75%, quiet screen. The point's week has
  rain 0.44 mm, rain anomaly −18.44 mm and maximum-temperature anomaly +4.32°C.
  Calendar is emergence; no days enter the reproductive gate. This is a clear
  limitation of a reproductive-only screen, not proof that ≥35°C is too high.
  Evidence: [May 21 report](https://esmis.nal.usda.gov/sites/default/release-files/8336h188j/wm117q61n/bg257g81h/CropProg-05-21-2012.txt),
  [June 4 report](https://esmis.nal.usda.gov/sites/default/release-files/8336h188j/zk51vj169/bk128c50r/CropProg-06-04-2012.txt).
- **Indiana, 2012-07-15 → July 29:** moisture screen, GE 8% → 9%, classified FP-like.
  Already-depleted condition has little scope to decline further; this case is
  not evidence that the drought signal was erroneous. It exposes a floor effect
  in the evaluation target.
  [July 16 report](https://esmis.nal.usda.gov/sites/default/release-files/8336h188j/7s75dd896/c821gm31d/CropProg-07-16-2012.txt),
  [July 30 report](https://esmis.nal.usda.gov/sites/default/release-files/8336h188j/w6634509j/x633f235t/CropProg-07-30-2012.txt).
- **Ohio, 2019-06-09 → June 23:** GE 58% → 39%, quiet screen. June 9 official
  progress is only 50% planted / 31% emerged while the calendar says vegetative.
  Root wetness anomaly is +0.132, then +0.142 and +0.191 over the next two weeks
  (rounded); hot/dry rules do not detect excessive wetness or planting delays.
  The evidence supports scope/timing concerns, not a causal flood-loss estimate.
  [June 10 report](https://esmis.nal.usda.gov/sites/default/release-files/8336h188j/v118rq49q/fq978495j/prog2419.txt),
  [June 24 report](https://esmis.nal.usda.gov/sites/default/release-files/8336h188j/j9602b05k/vd66w886v/prog2619.txt).
- **Kansas, 2015-07-05 → July 19:** exposure followed by +3 pp GE, another FP-like
  case. A state-level survey, one grid point, irrigation/heterogeneity and different
  within-state timing can disagree without either being demonstrably wrong.

Two-week FN-like cases by calendar stage: emergence 18, vegetative 95, silking 40,
grain fill 28, maturity 2. Thus 113/183 (61.7%) occur before the principal
reproductive window, and 115/183 outside silking/grain fill. This is a post-replay
diagnostic, not a predeclared hypothesis test or proof of exact stage misassignment.
Remaining in-window misses may involve spatial sampling, moisture thresholds,
irrigation, pests/disease, survey variation or unmodeled hazards; attribution is
unresolved. We did not fabricate pest, irrigation or field-loss evidence.

## I. Heat-threshold assessment

All alternatives use the same live stage gate. Counts below are heat-only; the
main condition table above also includes moisture. Three days need not be
consecutive unless explicitly stated. The anomaly experiment requires all seven
days stage-relevant and mean maximum-temperature anomaly ≥3°C.

| Diagnostic | Any-screen weeks / 278 | Cumulative share-weeks | Two-week exposed pairs | FP-like | FN-like |
| --- | ---: | ---: | ---: | ---: | ---: |
| ≥33°C, three relevant days | 58 | 11.266 | 156 | 120 | 179 |
| ≥35°C, current rule | 36 | 6.620 | 86 | 63 | 192 |
| ≥37°C, three relevant days | 18 | 3.291 | 42 | 23 | 196 |
| ≥35°C, three consecutive relevant days | 30 | 5.752 | 74 | 53 | 194 |
| Mean maximum anomaly ≥3°C | 32 | 8.750 | 101 | 73 | 187 |

Each two-week comparison has 1,540 observed pairs and 215 decline-like outcomes.
Lowering the threshold raises both detected declines and FP-like counts; it does
not resolve the large early-stage/weather-hazard gap. The anomaly screen is not
demonstrated more robust. **Retain ≥35°C only as a clearly labeled heuristic for
now; do not select a replacement from this sample.** All three lags are retained
for every alternative in the artifact to avoid selective reporting.

## J. Spatial-resolution assessment

Iowa center (42, −93.5) is compared with preselected west (42, −94.5) and east
(42, −92.5) points, using identical dates, stages and the absolute-temperature rule.
No central-point normal is interpreted as an east/west local moisture normal.

- West agrees with center in 278/278 heat-screen weeks.
- East differs in 2/278: July 15, 2012 and July 23, 2017; center screens, east does not.
- Replacing the center with east in those weeks changes the **heat-associated**
  national share by Iowa's entire weight: 19.07 and 18.09 percentage points.
  This is not necessarily the union-share change because moisture may also screen.
- The July 2012 agreement at center/west is consistent with the high-exposure
  season, but is not field validation. The east disagreement demonstrates that
  calling the entire state exposed would overstate spatial certainty. None of
  these points proves which acreage was affected or which point was “correct.”

This test quantifies output sensitivity, **not true spatial error**, and cannot
establish missed acreage or adequacy of the current resolution. Sparse Iowa
agreement cannot be extrapolated to Nebraska irrigation or all ten states.

Spatial next-step recommendation: **A, multiple representative points per state**
as an explicitly labeled diagnostic, with local baselines and coverage reporting.
B, crop-area-weighted gridded weather, is the more defensible eventual acreage
representation but requires historical crop masks/irrigation and additional
validation. C, current resolution is sufficient, is not supported. No spatial
model replacement was implemented.

## K. Historical case UI

Added a collapsed bilingual research section immediately below the existing US
corn pilot. Select 2012–2019 and a state for weekly detail. It shows the original
stage template alongside official milestones, weather anomalies/screens, dated
GE conditions, fixed-lag comparison tables and original NASS supply publications.
Threshold and spatial diagnostics plus source/version details remain expandable.

The region filter only affects the weekly detail; aggregate comparisons stay
ten-state and supply stays national, explicitly labeled. The full artifact loads
only on expansion in a separate content-hashed chunk. Research cannot enter live
source-health assessment, alert state, release manifests or email delivery.

Explicit labels: retrospective, full PIT unavailable, association not causation,
published annual estimate not latest final, few screens not proof of safety.
Tables are horizontally scrollable; scoped spacing preserves the existing theme.

## L. Exact files changed for this phase

New:

- `docs/CORN_HISTORY_PROTOCOL.md` — audit and pre-replay choices.
- `docs/PHASE4A_CORN_HISTORY_VALIDATION.md` — this A–O assessment.
- `scripts/collect_corn_history.py` — explicit official archive/reanalysis collector.
- `scripts/corn_history.mjs` — deterministic replay, comparisons and diagnostics.
- `scripts/evaluate_corn_history.mjs` — input/code-bound offline artifact generator.
- `research/corn-history-inputs.json` — frozen normalized evidence and metadata.
- `src/data/cornHistory.json` — deterministic research output.
- `src/services/cornHistory.js` — research artifact validation.
- `src/components/CornHistory.jsx` — bilingual historical case view.
- `tests/cornHistory.test.js` — replay/provenance/UI regression tests.
- `tests/test_corn_history.py` — archive/parser regression tests.

Existing files extended (including files introduced in prior uncommitted phases):

- `scripts/refresh_corn.py` — genuine parsing bug: an unused prior-year/week/average
  `(NA)` previously discarded an otherwise valid current progress row. Allow NA
  only in explicitly unused columns, never current values or condition categories.
  Accept a leading revision marker only when its `* Revised.` footnote is present.
- `src/components/CropCriticalWindow.jsx` — mount the research panel after the pilot.
- `src/food-system.css` — scoped historical-panel/table spacing only.
- `README.md` — research boundaries and reproduction links.

The many preexisting Phase 0–3 working-tree changes remain preserved; they are not
all attributed to this phase. No change to `cornExposure.js`, `cornPilot.json`,
live source caches, monitoring schedules, email behavior or live thresholds here.
No commit/push/deployment was performed.

## M. Tests and build

- Complete JavaScript suite: **184 passed, 0 failed**.
- Complete Python suite: **130 passed, 0 failed**.
- New tests: **20 JavaScript + 9 Python** (29 added to the 285-test prior baseline).
- Production build: **passed**, 712 modules. Bundle-size warnings remain: main
  ~1.086 MB and lazy research ~5.351 MB (~393 KB gzip). Research is not in the
  initial data payload, but expansion still incurs parsing/memory cost. No bundle
  restructuring outside this task was attempted.
- `git diff --check`: passed.
- A second full offline replay to a separate temporary file is byte-identical to
  the saved artifact (SHA-256
  `a398272803338ed257a30d5a334c879ad64307fcb9dfac9d2edbeb58aa44556e`).
- Browser: local production preview; research expansion loaded successfully;
  switching from 2012 overview to 2019 Ohio displayed the corresponding 34 weeks,
  2018 weights and official progression (including GE 58 → 53 → 39 in June).
- Bilingual server rendering verifies retrospective/PIT/noncausal/final-vintage
  labels. English interactive selection is also checked in the local preview.

Coverage includes deterministic non-mutating replay; future weather/report and
weight exclusion; day-only publication boundaries; conflicting same-day editions;
metadata identity/vintage mismatch; exact live stages; synthetic heat/moisture and
quiet cases; partial/all-missing weather and seven-day gaps; unavailable PIT;
input/version binding; exact condition lags; diagnostic isolation; correlation
ties/constant/missing/tiny samples; real eight-season artifact; malformed UI
payloads; six/seven-column supply layouts; optional NA vs forbidden missing current
values; revision footnotes; archive filtering; units/year validation; notices.

## N. Remaining limitations

Eight seasons, selected for continuous coverage rather than random sampling; no
independent holdout. State-week overlap, spatial dependence and multiple lag/heat
comparisons prohibit treating pair counts as independent sample size. Threshold
variants are diagnostics, not model selection. Condition floor effects and ongoing
stress mean “no further decline” is not “false alarm.”

Historical official archives have day precision and may contain corrections. Raw
downloads are local, not guaranteed immutable provider archives. Weather delivery
vintages and then-available normals are missing. No final/detrended national yield
or production anomaly is supplied. August-start supply comparisons omit earlier
damage/revisions. National outcomes dilute regional effects; ten states exclude
16.18–21.74% of national output (rounded). Prior-year production weights avoid
future knowledge but can underweight a region after a prior bad harvest.

One point per state, model rather than field moisture, crude stage calendars,
missing irrigation/cultivar/pest evidence and no excess-water hazard make this an
incomplete agricultural-risk representation. A missing or quiet screen must never
be promoted to a low-risk conclusion. The new historical section does not remedy
these live-model limitations.

## O. Final readiness decision — stop here

1. **Historical usefulness: Weak/inconclusive overall.** Stronger descriptive
   contrast for 2012 versus several low-screen seasons, and more negative average
   GE changes after exposure, support limited screening usefulness. Many unmatched
   declines, condition floor effects and nonnegative yield-revision associations
   do not support a general early-warning or yield-prediction claim.
2. **Limitation ranking for screening usefulness:** (1) crop-stage timing and
   narrow stage coverage; (2) weather-variable/hazard coverage, especially excess
   water; (3) spatial resolution; (4) supply-vintage/outcome timing; (5) official
   condition data as a noisy, bounded proxy; (6) production weights; (7) small,
   dependent sample and other unobserved management factors. Separately, lack of
   vintage weather/normals is the decisive blocker for any full PIT claim, regardless
   of this product-oriented ranking. The first two limitations are intertwined,
   not causally decomposed by this study.
3. **Improve first: crop-stage model.** Audit official progress versus calendar
   gates and explicitly define which stages/hazards are in scope. Use independent
   seasons and a frozen protocol to assess any proposed change; do not simply
   broaden every gate or lower temperature until these results improve. The 113
   early-stage FN-like pairs and Ohio timing mismatch justify that investigation,
   not a promise it will resolve them. Then test multiple points and richer moisture
   evidence. None of these future changes is implemented now.
4. **Brazil soybeans: Not yet.** Porting narrow corn calendar/hazard assumptions
   would replicate unresolved limitations. First establish stage/hazard boundaries
   and rerun an independently specified check; soybean calendars, geography and
   official outcome evidence then require their own audit. This assessment stops
   here; no Brazil pilot or Phase 4B architecture was added.
