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
| [USDA PSD](https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads) | Grains/pulses bulk CSV, wheat records | Ten marketing years; calculated world totals, EU counted once and UK separate; includes forecasts/revisions |
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
