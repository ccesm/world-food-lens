# PROJECT_CONTEXT — World Food Lens

## Product identity

Name: **World Food Lens / 全球粮食观察**

Purpose: help non-specialists understand global food-price movements by connecting prices, energy, fertilizer, harvests, inventories, policy and market exposure.

Old hosted site:
https://world-food-lens.d47cjrv8xg.chatgpt.site/

This Git repository is the durable source-of-truth going forward.

## Core product principles

1. Official sources first.
2. Explain *why* a signal matters, not just the number.
3. Never confuse correlation with causality.
4. Separate observation date, forecast/marketing year and fetch time.
5. Distinguish live, delayed, cached, estimated and recovered data.
6. Maintain Chinese and English UI.
7. Keep mobile support.
8. Do not commit secrets.

## Source direction

- FAO Food Price Index / FAOSTAT
- U.S. EIA for energy / Brent
- World Bank Commodity Price Data ("Pink Sheet") for fertilizer/agriculture/energy
- USDA PSD / WASDE for global production, consumption, trade and ending stocks
- FAO FAPDA for policy events
- Later: a compliant current/historical market-data provider for ETFs/stocks

## Recovered hosted-site snapshot

Recoverable headline values from the old site:
- FAO Food Price Index: 133.3, 2026-08, +1.9% MoM
- Brent: $91.08/bbl, 2026-08, +8.7% MoM
- Urea: $390/mt, 2026-08, -2.5% MoM
- Global wheat stock-to-use: 33.6%, 2026/27, -0.7 percentage point from prior year
- Old-site last successful fetch shown: 2026-09-12 01:08 UTC

These are historical/recovered cache values, not current live quotes.

## Investment Lens

Initial U.S.-listed instruments:
DBA, CORN, WEAT, SOYB, MOS, NTR, DE, ADM.

Additional instruments: MOO, VEGI, CF, AGCO. The instrument selector sits above a full-width chart with an explicit responsive height to prevent the embedded chart from collapsing.

Current chart implementation:
- World Food Lens maintains the bilingual instrument explanations.
- TradingView's public Advanced Chart widget supplies interactive intraday and historical charts.
- No brokerage connection or client-side API key is required.
- TradingView attribution and delayed-data disclosure must remain visible.

Desired future instrument detail:
- current/delayed price with timestamp
- historical chart
- fund/company description
- agricultural exposure
- relationship to the food system
- source/license information

## Development handoff rule

Any ChatGPT/Codex account should:
1. Read this file, `README.md` and `MIGRATION_NOTES.md`.
2. Run `git status`.
3. Inspect recent commits before editing.
4. Preserve working features unless explicitly asked to remove them.
5. Avoid large refactors before understanding current source adapters.
6. Test `npm run build` after changes.
7. Commit in small, meaningful units.

## Near-term roadmap

Implemented in the official-data/climate/policy increment:

- Public FAO, World Bank, EIA and USDA downloads via Python standard-library adapters.
- Generated `public/data/official-data.json`, with per-source validation and last-good fallback.
- NOAA RONI observed climate history, provisional flags and regional interpretation cautions.
- Nine bilingual, searchable policy/conflict historical records with official citations.
- Source health, dates, daily GitHub Actions cache refresh, build and deployment.
- Offline parser/data/filter tests; no changes to the TradingView instrument set.

Boundaries to preserve: policy records are editorial, not automatic FAPDA sync;
NOAA is a global ocean signal, not local crop/weather forecasts; recent USDA
years are forecasts/estimates. Recovered values are fallback only, never live.

Future increments: broaden reviewed policy coverage and authorized FAPDA
integration; add regional rainfall/soil-moisture data and population/demand
context; add release-specific archives and larger-scale end-to-end test coverage.

## September 2026 history / outlook increment

- USDA wheat history since 2000 with range and production/use comparison controls.
- Experimental 12-month FAO price-only model with rolling MAE versus flat prices,
  empirical error bands, and separately labelled user price-shock scenarios.
- Rolling one-year official release calendar: exact verified schedules and
  unconfirmed planning windows are distinct; manually reviewed on 2026-09-12.
- Light/dark theme and fixed bottom navigation remain available.

Forecast limitations are part of the feature: revised historical vintages,
overlapping evaluation windows, no validated causal coefficients for climate
or conflict, and no independently guaranteed interval coverage. Do not label
these model estimates as official predictions or future observations.

## Food-system evidence increment (2026-09-13 UTC)

Added an evidence-gated Global Food Stress Monitor; only stocks (20%), costs
(15%) and FAO price levels (10%) are currently scoreable. Missing factors are
not zero or rescaled; the overall score stays unavailable. No crisis probability
or calibrated historical similarity is claimed. See docs/FOOD_SYSTEM_UPGRADE.md.

USDA retains the original wheat shape plus three-grain histories (wheat, maize,
milled rice), with optional ex-China stocks AND consumption. World Bank monthly
data retain all nine existing commodity fields. No new API credentials.

21 crop-season templates are editorial estimates, not current crop progress.
The calendar and winterkill checklist must never be labelled live weather or
evidence of synchronized crop damage. Existing site features are preserved.

## Homepage orientation (2026-09-13 UTC)

The homepage explains purpose and evidence coverage before detailed charts.
HomeOrientation provides a bilingual clickable ten-step framework and optional
learning examples. DetailModule keeps original section anchors reachable while
mounting charts on demand and preserving filters after closing. The hero and
GlobalFoodStress share one useFoodStress result; model formulas are unchanged.
Investments follow the food-system and historical context, not the introduction.
See docs/HOMEPAGE_GUIDE.md for architecture, changed files and verification.

## Local weather exposure (2026-09-13)

CropCriticalWindow now fetches a separate NASA POWER daily weather cache. Sixteen
editorial representative points map to the 21 existing crop windows. Temperature,
rain and stage overlap are descriptive screening only: no regional area weights,
rainfall normals, snow/irrigation or field damage; the global model is unchanged.
Earlier statements that all local weather is unconnected are superseded only for
this point-based layer, not region-wide crop impact. The deployment refreshes both
caches with independent last-good retention. See docs/LOCAL_CROP_WEATHER.md.

The weather cache now retains history from 2024-01-01. Weather follows the crop
window's selected year/month by default; past months require complete dates and
current months clearly label partial coverage. Future or unavailable months
must never fall back to current weather. Latest 30 days remains a separate view.
Historical weather is compared with estimated seasonal templates, not measured
historical crop progress or validated damage. Existing global scores are unchanged.

The crop-window section now has seven manually reviewed JRC crop-weather report
groups (2026-09-13). WFL red/yellow concern colors are NOT official weather warning
grades. Dates, impact uncertainty, limited coverage and a 30-day review expiry
are visible. This list is independent of historical weather filters and excluded
from all model scores. See docs/CROP_WEATHER_ALERTS.md for source maintenance.
The JRC report groups do not state event-specific affected hectares. Selected
cards show frozen September 2026 USDA 2026/27 same-crop national/EU output shares
as context only, not affected output or estimated global loss. Overlapping EU
groups must never be added together.

## ENSO and seasonal outlook (2026-09-13)

The new top-level ENSO module caches the official NOAA diagnostic, nine
overlapping three-month phase probabilities and RONI forecast percentiles.
Separately reviewed WMO/JRC regional forecasts are compared with estimated
crop windows; historical NOAA teleconnections are teaching context only.
Old forecasts are archived and current crop-watch intersections suppressed.
No regional crop-loss, synchronized shock or global score is fabricated.
The existing observed RONI, NASA point weather and impact watchlist remain
independent. See docs/ENSO_SEASONAL_OUTLOOK.md for sources and maintenance.

The forward agricultural exposure overview now makes that separation visible
for Australia wheat, Southern Africa maize, Central Brazil soybeans and
Southeast Asia/Thailand rice. A typical ENSO tendency never fills the current
forecast column. Direct region/crop matches, adjacent context, point rainfall,
point soil wetness and calendar stages retain distinct labels; without
crop-area-weighted observations and crop-condition confirmation, the
agricultural-risk result remains not rated. The
same 45-day review guard suppresses both direct and adjacent current-outlook
claims when the editorial set is stale.

Phone navigation is capped at five primary entries: Home, Food risk, Crops,
Climate and More. Climate contains ENSO, Seasonal Outlook and Crop Weather;
Drought and Soil Moisture now link to connected official-data sections. Desktop
retains its original full navigation. Do not treat either point layer as a
country-wide drought or yield assessment.
Do not expand the phone bottom bar with future Energy, Trade or Markets links;
place secondary destinations in the appropriate submenu instead.

## Drought and soil moisture (2026-09-13)

Copernicus/JRC GDO one-month SPI, six-month SPI and RDrI-Agri are sampled at the
same 16 representative points. Exact map periods and official WMS URLs are
cached; the global map remains provider-hosted. NASA POWER daily records now
include root-zone and surface model wetness, compared with 1991–2020 same-month
point climatology. Values are unitless 0–1 estimates, not field volumetric water
content. Source-specific age guards, schema checks, atomic writes and last-good
retention prevent missing data from becoming a normal or low-risk result.

These layers remain independent from ENSO tendencies, seasonal outlooks and
crop calendars. They do not estimate affected hectares, production loss or a
Global Food Stress score. See docs/DROUGHT_SOIL_MOISTURE.md.

## Daily automatic monitoring and email (2026-09-22)

The existing daily workflow now evaluates transparent heat/crop-stage, verified
GDO SPI and monthly price/cost thresholds. The compact homepage alert center
shows source health, evidence, new/escalated/resolved transitions and unverified
retained alerts. No new global score or affected-production estimate is added.
Its phone link is under More; desktop and five phone primary entries are intact.

The separate post-publication SMTP job sends a first activation confirmation,
then only new/escalated active alerts or previously good sources going missing.
Credentials and addresses live only in repository Actions Secrets; public
receipts contain identifiers, status and timestamps. Retry reads the latest
delivery ledger, and that status appears on the next site build. SMTP acceptance
is not inbox delivery. GDO service-page example periods now require advertised
availability corroboration; unverified maps remain reference-only. Soil moisture,
ENSO, policy and war do not independently generate automated damage claims.
See docs/AUTOMATIC_MONITORING.md for thresholds, boundaries and operations.
