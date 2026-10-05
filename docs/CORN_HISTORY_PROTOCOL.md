# US corn historical evaluation protocol — frozen before replay

## Availability audit (2026-10-04 local)

| Input | Availability/resolution verified or documented | Revision/vintage boundary |
| --- | --- | --- |
| NASA POWER meteorology | Provider documents daily gridded history from 1981; Phase 3 stores ten 1991–2020 normals and three historical Iowa windows | Today's reanalysis download, not historical delivery snapshots; no defensible point-in-time weather feed in this repository |
| Normals | Ten points, 365 matching-calendar seven-day normals, 30 samples each, 1991–2020 | Retrospective for every pre-2021 season; cannot claim contemporaneous availability |
| NASS state production weights, area, yield | Annual Summary archive; January 2012 report successfully parsed for 2011 and ten states plus US; report also contains prior two years | Dated January estimate vintage, not latest final revised history; choose prior-crop-year report issued before the evaluated growing season |
| NASS crop progress and condition | ESMIS filter lists monthly archives back to April 1995; July 2012 text successfully parsed. Weekly during April–November; selected states; seasonal metrics may be absent | Archived published text, possible corrections; publication day known, exact original clock not assumed. Weekly Weather and Crop Bulletin can contain later revisions |
| NASS monthly yield/production/harvested area | Crop Production archived monthly tables; August 2012 grain table fetched, states/US | Dated monthly forecast/estimate. August–November plus next available annual summary supply an evolution, not a latest-final outcome |
| USDA WASDE | USDA documents published-vintage CSVs from April 2010, consolidated ZIPs for 2010–2020 | Original-publication values, explicitly not later revisions. ZIP download returned HTTP 403 here; do not synthesize vintages from PSD |
| PSD | Existing current bulk history extends to 2000 in this app | Latest revised history, not archived monthly vintages. Current local US contributor coverage unavailable; not used as a vintage substitute |

Source landing pages: https://power.larc.nasa.gov/docs/methodology/meteorology/ ;
https://esmis.nal.usda.gov/publication/crop-progress ;
https://esmis.nal.usda.gov/publication/crop-production-annual-summary ;
https://esmis.nal.usda.gov/publication/crop-production ;
https://www.usda.gov/historical-wasde-report-data-3 .

The collector must record actual start/end dates, gaps, publication days and
hashes. Provider-wide archive availability is not a claim that all records were
downloaded or parsed. Unavailable final history stays unavailable.

## Predeclared evaluation choices

- Eight contiguous seasons, 2012–2019 inclusive; no outcome-based inclusion or
  deletion. This spans the already checked 2012 and 2019 cases with every intervening
  season, rather than selecting only famous droughts. Missing periods stay visible.
- Weekly windows ending Sundays April–November; release-relative evaluation four
  days later, matching Phase 3's four-day collection lag. Raw weather never extends
  beyond the window. Official stage evidence must have publication day strictly
  before evaluation day and observation date no later than the weather window.
- Exact `us-corn-point-exposure/v1`, ten states, same calendars and existing functions.
  January previous-year weights, not final same-year weights or 2025 weights.
- Retrospective results only for the full chain. An independent strict as-of
  official-vintage selector is testable, but there is no full point-in-time replay
  without vintage weather and then-available normals. Do not relabel mixed evidence.
- State-level subsequent condition comparison: exact 1, 2, 4 weeks after the weather
  window, only paired observed weeks, good+excellent change in percentage points.
  A ≥5 point decrease defines deterioration-like cases; this is an evaluation
  convention, not a validated alert. Report denominators and all three windows.
- Positive-like: heat OR moisture screen. False-positive-like: screen with less
  than 5 points subsequent decline. False-negative-like: no screen with ≥5 points
  decline. Missing outcomes are neither positive nor negative. Also report improvement
  after a screened week transitions to no screen. These are not ground-truth losses.
- National supply: report August→post-harvest annual publication deltas in yield,
  production and harvested area. Display intervening published estimates. If a
  January report is absent, retain the actual later date. No “final outcome” label.
- Descriptive season correlation: cumulative heat/moisture share-weeks versus
  published yield revision, Pearson and tied-rank Spearman, complete pairs only.
  Eight seasons are not independent out-of-sample evidence; no p-value or accuracy score.
- Threshold diagnostics only: ≥33/35/37°C on three stage-relevant days; ≥35°C for
  three consecutive stage-relevant days; stage-relevant mean-maximum anomaly ≥3°C.
  Report every alternative, do not optimize, and never change the live method.
- Spatial diagnostic: same-season Iowa central point versus west/east points at
  (42, -94.5) and (42, -92.5), fixed before replay. Compare identical heat screens,
  report discordant weeks and maximum change in national associated-share if the
  center is replaced. Not acreage truth or evidence that either alternative is better.
- Preserve raw/normalized inputs and canonical metadata. Research artifacts remain
  separate from live monitoring, release manifests, emails and daily workflows.

No model tuning, next crop, deployment, SMTP, global score, investment signal or
infrastructure migration is part of this evaluation.
