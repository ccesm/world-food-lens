# PROJECT_CONTEXT — World Food Lens

One-page **current state**. Update this page in place when status changes; do
not append dated entries here. The full dated development log lives in
[`docs/PROJECT_HISTORY.md`](docs/PROJECT_HISTORY.md), and phase-by-phase method
and evidence live in `docs/`.

_Last reviewed: 2026-10-07._

## Product

**World Food Lens / 全球粮食观察** is a global food-market intelligence system
that combines official production, inventory, trade, weather, input-cost,
policy and market evidence to identify emerging global food-supply risks.

**Main development track (from 2026-10-07): Global Macro.** Read
[`docs/GLOBAL_FOOD_INTELLIGENCE_ROADMAP.md`](docs/GLOBAL_FOOD_INTELLIGENCE_ROADMAP.md)
first. Architecture: Global Macro → Crop/Region Supply → Advanced Regional Deep
Dives. Roadmap G1 (global crop supply, highest priority) → G2 weather risk →
G3 input costs → G4 trade & policy → G5 market confirmation. High-resolution
US Corn work is preserved as an Advanced Deep Dive; its further research is
deferred, not abandoned.

- Live site: https://ccesm.github.io/world-food-lens/
- This repository (branch `main`) is the source of truth and the production
  branch. The old `chatgpt.site` deployment survives only as a labelled
  recovered snapshot (see `MIGRATION_NOTES.md`).

## Core principles

1. Official sources first.
2. Explain *why* a signal matters, not just the number.
3. Never confuse correlation with causality.
4. Keep observation date, forecast/marketing year and fetch time separate.
5. Distinguish live, delayed, cached, estimated and recovered data. Recovered
   values are fallback only, never live.
6. Missing evidence stays visibly unavailable; it is never zero, normal or
   rescaled away. Global coverage may lower spatial resolution, never evidence
   quality.
7. No aggregate risk score: weather, supply, stocks, costs, policy and markets
   stay independent evidence dimensions unless independently validated.
   The existing Global Food Stress composite is frozen legacy/experimental,
   outside the primary evidence framework, until G5 replaces it. Direction is
   metric-level only; exports/imports get no automatic tightening/easing label;
   aggregate supply status (tightening/stable/easing/mixed/unknown) must trace
   to metric-level evidence. See roadmap §13.
8. No crop-damage or yield-loss claims unless the source itself publishes an
   official estimate. Official/authoritative sources (Tier 1) outrank news.
9. Chinese and English UI; mobile support.
10. No secrets in the repository.

## What is live on main

- **Official data**: FAO, World Bank, EIA, USDA PSD and NOAA downloads with
  per-source validation and last-good retention; Data Desk shows source health.
- **History and outlook**: USDA grain histories, experimental FAO price-only
  outlook (not an official prediction), official release calendar.
- **Food-system evidence**: Global Food Stress Monitor (only partially
  scoreable; overall score stays unavailable when factors are missing), crop
  windows, inventory comparisons.
- **Climate**: NASA POWER point weather, Copernicus GDO drought and soil
  moisture, NOAA ENSO and seasonal outlooks, reviewed JRC crop-weather reports.
  All are point- or region-level screening, not crop damage or loss estimates.
- **Policy**: editorial, bilingual policy/conflict registry with citations.
- **Investment lens**: TradingView charts for U.S.-listed agriculture ETFs and
  stocks, with attribution and delayed-data disclosure.
- **US Corn — Advanced Spatial Monitor (deep dive)**: Phase 3/4A pilot and
  history, Phase 4B-1 spatial-stage screening, the **Level C** mapped-corn-area
  weather module (`mapped-corn-weather-production/1`), and informational 4B-2
  screens: EDD and hot days (`corn-heat-screen.json`) and VPD distribution
  (`corn-vpd-screen.json`). Level C is informational context; **Level A remains
  the basis for alerts**. The 2023 CDL map is a disclosed older proxy.
- **Automatic monitoring and email**: daily rule evaluation, homepage alert
  center, and a post-publication SMTP job that sends only new/escalated alerts
  or source outages. Intent is recorded before contacting SMTP, so retries do
  not duplicate mail.

## Automation

`.github/workflows/deploy-pages.yml` runs on pushes to `main`, on manual
dispatch, and daily at **06:23 UTC**. GitHub queues scheduled runs, so they
usually start several hours late (observed 5–8 hours); this is expected, not a
failure. Each run tests, refreshes data, commits the generated data release to
`main`, deploys Pages, and then runs the notification job.

- Safe re-validation: run the workflow manually with `validation_only: true`.
  That path runs the full spatial/numerical suites but does not save data,
  deploy or send email.
- Real scheduled production was confirmed on 2026-10-06 (runs 37458902482 and
  37470752760): build, deploy, Level C refresh and cache restores succeeded,
  and the email job recorded `no-notifiable-change` without a duplicate send.

## Phase status

| Phase | Status |
| --- | --- |
| 0–4A (migration, official data, climate, monitoring, corn pilot/history) | Done, live |
| 4B-1 (spatial-stage screening, Level C, operational validation) | Done, merged 2026-10-05, live |
| 4B-2 (US Corn hazard expansion) | 2.0 registry, 2.1 heat screens and 2.2a VPD distribution **live**. Everything else (VPD climatology, 2.2b, 2.3–2.6) is **Deferred — Advanced US Corn Research** (`docs/PHASE4B2_PLAN.md`) |
| **G0** (global architecture + inventory) | Done — `docs/GLOBAL_FOOD_INTELLIGENCE_ROADMAP.md` |
| **G1** (global crop supply) | **Next**: G1.0 data contract (metric-level direction), then G1.1 PSD corn + wheat + rice together with independent per-commodity validation |

The US Corn deep dive keeps its own rules. Phase 4B-2 may expand screening variables only within the limitations and
version guards described in `docs/PHASE4B1_SPATIAL_STAGE_ALIGNMENT.md` and
`docs/PHASE4B1_9_LEVEL_C_PRODUCTION.md`. No yield-loss, affected-acreage or
predictive-accuracy claims. 4B-2 outputs are informational only and do not
feed alerts or email.

Every published Level C metric must belong to a `reviewed` or `frozen` rule in
`src/data/evidenceRegistry.json`; tests fail otherwise. New 4B-2 rules start as
`draft` and are switched to `reviewed` in the PR that ships them.

## Known follow-ups (not blocking)

- Large main bundle: `official-data.json` (3.6 MB) and all modules ship in the
  main JS chunk. New global data must be separate runtime-fetched files.
- Editorial layers expire soon: JRC crop-weather reports (30-day guard from
  2026-09-13) and seasonal signals (45-day guard); policy registry last
  reviewed 2026-09-12.
- `recharts` 2.x is no longer maintained; plan a 3.x upgrade.
- `src/main.jsx` mixes bilingual copy between the `copy` object and inline JSX.
- CI hardening: pin Actions to commit SHAs; limit `contents: write` to the
  data-save step.
- The bot commits several MB of JSON daily; consider a separate data branch if
  repository size becomes a problem.

## Working on this repository

Any ChatGPT, Codex or Claude session should:

1. Read this file, `README.md` and `MIGRATION_NOTES.md`; use
   `docs/PROJECT_HISTORY.md` and the phase reports only for background.
2. Tests must not depend on the live `public/data` release (it changes daily and
   can record source outages). Use `tests/fixtures`; `tests/liveDataOutage.test.js`
   lists the few outage-tolerant live checks.
3. Fetch first and work from the latest `origin/main`: the Actions bot commits
   data and delivery ledgers to `main` every day.
4. Never rewrite or force-push `main`, and never overwrite bot data commits.
5. Preserve working features unless explicitly asked to remove them; avoid
   large refactors before understanding the source adapters.
6. Run `npm test` and `npm run build` after changes (233 JS + 178 Python tests
   locally; the spatial tests (`tests/spatial`, research suites) need the geospatial runtime and run in CI).
7. Work on a branch and open a PR; commit in small, meaningful units.
8. New work follows `docs/GLOBAL_FOOD_INTELLIGENCE_ROADMAP.md`; resumed US Corn
   4B-2 work still meets the nine-item gate in `docs/PHASE4B2_PLAN.md`.
9. When status changes, update this page in place.
