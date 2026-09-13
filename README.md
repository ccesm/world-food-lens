# World Food Lens — Official Data, Climate & Policy

Published site: https://ccesm.github.io/world-food-lens/

The existing React/Vite application now reads verified official-source caches,
monitors NOAA climate observations and offers a searchable historical policy
registry. GitHub remains the source of truth. No brokerage connection or private
API key is required.

This repository is a source-controlled migration of the previously published World Food Lens site:

https://world-food-lens.d47cjrv8xg.chatgpt.site/

## What this migration restores

- Bilingual Chinese / English interface
- Headline cards for FAO Food Price Index, Brent, urea and global wheat stock-to-use
- Recovered 36-month FAO vs Brent comparison from the hosted-site snapshot
- World Bank fertilizer benchmark table
- World Bank agriculture benchmark table
- USDA stock-to-use explanation and recovered wheat headline
- FAPDA policy-database interface / adapter point
- "Connect the dots" explanatory section
- Input-cost learning lab
- Data Desk with source/period/cache metadata
- New investment-lens extension for U.S.-listed agriculture ETFs/stocks
- TradingView-powered interactive market charts for the investment instruments
- Mobile-responsive design
- GitHub Pages deployment workflow

## Homepage: explain the logic before the data

The homepage now starts with purpose, a shared evidence summary and a clickable
weather → crop stage → production → inventories → trade → energy → markets
guide. Detailed modules are expandable; original navigation links, chart filters,
themes and bilingual support remain available. Investment charts appear after
the food-system explanation. No analytical formulas or upstream feeds changed.

See [the homepage implementation report](docs/HOMEPAGE_GUIDE.md) for the full
reading order, changed files, verification and current capability boundaries.

## Critical migration limitation

The old `chatgpt.site` Site projection exposes the published page and a text snapshot, but not the original server-side/source bundle that performed live synchronization. Therefore this repository intentionally does **not** pretend that the recovered cache is live.

The old site showed a last successful source check at:

`2026-09-12 01:08 UTC`

Those values remain preserved as an explicitly labelled last-resort fallback.
Official downloads never silently mix with the recovered price-history series.

## Run locally

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## Data layer and updates

See:

- `public/data/official-data.json` — generated, verified cache
- `public/data/recovered-snapshot.json` — unchanged migration fallback
- `scripts/macro_sources.py` and `scripts/climate_sources.py` — public downloads
- `scripts/refresh_data.py` — validation and atomic cache replacement
- `src/services/officialSources.js`
- `MIGRATION_NOTES.md`
- `PROJECT_CONTEXT.md`

| Source | Connected data | Notes |
| --- | --- | --- |
| [FAO](https://www.fao.org/worldfoodsituation/foodpricesindex/en/) | Nominal monthly food-price index CSV | 2014–2016 = 100; recent values can be revised |
| [World Bank](https://www.worldbank.org/en/research/commodity-markets) | Pink Sheet monthly workbook | Brent, four fertilizers and four agricultural benchmarks; original units validated |
| [EIA](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RBRTE&f=M) | Published monthly Brent spot-price table | Preferred over World Bank at equal observation dates, not a real-time quote |
| [USDA PSD](https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads) | Grains/pulses bulk CSV, wheat records | Marketing years since 2000; provider's EU aggregate counted once per year and separate UK rows included when supplied; includes forecasts/revisions |
| [NOAA CPC](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/) | Observed RONI ASCII series | Overlapping three-month windows; not an ENSO advisory or a local yield forecast |

The frontend uses `src/data/dashboardMetrics.js` for both wheat cards and the
USDA history. Stock/use is ending stocks divided by domestic consumption, and
year-on-year change is in percentage points. Downloaded 2026/27 wheat totals
were cross-checked against the September 2026 [USDA grain report](https://apps.fas.usda.gov/psdonline/circulars/grain.pdf),
pages 20–21: production 822,432, domestic consumption 822,456 and ending stocks
276,291 (all thousand metric tons).

Use Node 24 and Python 3.12 (Python standard library only):

```bash
npm run refresh-data
npm test
npm run build
```

Each source refreshes independently. Invalid formats, missing required fields,
wrong units, network failures and regressed periods retain the source's previous
data and successful-fetch time. Only the attempt time/error changes. A refresh
with any failure returns a nonzero exit status, but still saves successful
sources and retained-cache status. JSON replacement is atomic.

The page separates observation period, successful fetch and latest attempt.
It flags failed refreshes, checks older than 72 hours, and monthly releases
older than 100 days. A successful download is not a new observation. Price
comparisons use shared official months with visible gaps, never interpolated or
spliced with recovered values. If either official series is unavailable, the
original price chart remains explicitly labelled recovered.

The header's **Check updates** reloads the site's published JSON; it does not
trigger provider requests or GitHub Actions from a visitor's browser.

## Policy and conflict records

`src/data/policyEvents.json` contains nine bilingual, officially sourced historical
events covering trade restrictions, tariff relief, the Black Sea initiative and
shipping disruption. Search and country/type/commodity filters work together.
Event, publication and review dates are separate. This is an editorial registry,
not a complete or automatically synchronized FAPDA database and not a statement
of current legal force. See `docs/POLICY_SOURCES.md` for maintenance and sources.

## Deployment and scheduled refresh

`.github/workflows/deploy-pages.yml` tests, refreshes and deploys on main pushes,
manual dispatch and daily at 06:23 UTC (GitHub schedules can be delayed). The
generated JSON is committed back to main before deployment, retaining GitHub as
the source of truth. The same workflow deploys directly: a bot commit does not
need to trigger another workflow. No personal token is added.

GitHub Pages must use **GitHub Actions** as its source. The build job needs
repository-content write permission to save cache commits; protected-branch
rules must permit the configured workflow or require a future PR-based cache
update design. A rejected push stops deployment instead of publishing untracked
data. Source refresh failures produce visible warnings while valid retained data
can still be deployed. Inspect Actions logs and Data Desk for source health.

Provider formats/URLs may change. In particular, review the World Bank download
URL on annual document rollover if the observed period stops advancing. Do not
change success/review dates manually to conceal a failure.

## Supply history, price outlook and release calendar

Supply history now covers 2000/01 onward (27 marketing years in the September
2026 cache). Select all history, 20 or 10 years, and switch between stock/use
and production versus consumption. Quantities in the chart are million metric
tons; the detailed table retains thousand metric tons. No pre-2000 totals are
constructed because predecessor-state and EU-15 aggregation requires separate
validation. Country/area coverage is taken from the provider in each year.

`src/services/priceForecast.js` implements experimental WFL v1, a price-only
AR(1) model of FAO monthly log returns with fixed ridge penalty 0.01, coefficient
clipped to ±0.95, and up to 120 training months. The official price cache now
retains up to 600 months (FAO starts in 1990). At least 84 consecutive valid
months are required. Missing/invalid history suppresses the forecast.

Forecasts cover 12 months beyond the last published observation. Up to 60
rolling origins are evaluated at each of 12 horizons using origin-only training
windows; displayed MAE is compared to unchanged prices on identical outcomes.
The 10th–90th percentile log-error band is calibrated from those same rolling
errors, expanded if necessary to include the baseline. It is not independently
validated 80% coverage. Historical series are current revised vintages and
origins overlap: this is not a point-in-time trading simulation. An assumed
extra price shock ramps logarithmically to the user's chosen percentage at 12
months; it does not change model fitting or the baseline's error band. It does
not estimate causal weather, supply, war or policy elasticities.

`src/data/releaseSchedule.js` stores manually reviewed 2026 FAO/WASDE dates and
NOAA's explicitly announced next release, with official links and review date.
`src/services/releaseCalendar.js` builds a rolling one-year calendar. Unverified
months use explicitly estimated planning windows, never official-date badges;
2026 dates are not copied into 2027. No future report values are invented.
Recheck official schedules at least monthly and add newly published annual
schedules deliberately. The UI warns when manual verification is over 30 days
old. Daily source downloads do not silently refresh this review date.

## Food-system evidence, crop windows and inventory comparisons

The Global Food Stress Monitor exposes seven proposed weights with raw inputs,
source status and missingness. Only three factors (45% of weight) are connected;
no overall score is published until all factors have eligible data. Percentile
rules are experimental screening heuristics, not crisis probabilities.

USDA now adds maize and milled-rice histories alongside wheat, retaining the
legacy wheat fields. World/ex-China comparisons subtract both stocks and use;
neither is a direct measure of freely exportable stocks. No total-cereal sum
is manufactured. The 21 crop-season templates are explicitly estimated, with
month/crop filters, critical-stage lists and an educational winterkill checklist.
They are not current-year field progress or live weather risk.

Read [the implementation report](docs/FOOD_SYSTEM_UPGRADE.md) for formulas,
sources, modified files, missing integrations and the next validation steps.

## Local weather in crop windows

The 21 seasonal crop windows now link to 16 NASA POWER representative grid points:
daily history since 2024, with year/month-linked maximum/minimum temperatures,
rainfall totals, low-rain runs and the
overlap of hot days with template flowering/grain-fill stages. Daily values,
coordinates, actual dates and source links are exposed. These are gridded
estimates, not country averages, drought diagnoses or yield-loss forecasts.
Missing/failed/stale data do not generate current interpretations or risk scores.
Historical months require a full calendar month. The current month is labelled
partial through its published cutoff; future/missing months show no substitute.
The independent latest-30-days view remains available.

Run `python3 scripts/refresh_weather.py`; the existing daily deployment also
refreshes and commits `public/data/local-weather.json`. See
[local weather methodology](docs/LOCAL_CROP_WEATHER.md) for limitations and checks.

## Crop-weather report watchlist

The crop-window section includes a manually reviewed crop-weather report
watchlist, independent of historical-weather controls. WFL red/yellow levels
are not official meteorological warnings. Sources, dates, coverage gaps and
review expiry are visible; no damage or price score is derived. See
[watchlist methodology](docs/CROP_WEATHER_ALERTS.md).

## Investment market charts

Available instruments: DBA, CORN, WEAT, SOYB, MOS, NTR, DE, ADM, MOO, VEGI, CF and AGCO. Select a card above the full-width chart to switch instruments. The chart frame reserves 640px on desktop, 560px on tablets and 500px on mobile, including attribution.

The Investment Lens keeps its instrument descriptions in this repository and embeds TradingView's public Advanced Chart widget for price history. The widget does not require an API key or a connected brokerage account.

Market quotes and charts may be delayed under exchange and data-provider rules. TradingView attribution and direct fallback links must remain visible.

## Safety / data integrity rules

- Never commit API keys or tokens.
- Never label recovered/static data as real-time.
- Show observation period separately from fetch time.
- Label forecasts and estimates.
- Prefer official sources.
- Preserve original units and methodology notes.
