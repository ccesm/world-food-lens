# World Food Lens — Git Migration

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

The local app currently labels those values as recovered cache.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Data layer

See:

- `public/data/recovered-snapshot.json`
- `src/services/officialSources.js`
- `MIGRATION_NOTES.md`
- `PROJECT_CONTEXT.md`

The next development milestone is to replace the adapter stubs with durable server-side/serverless connectors for FAO, EIA, World Bank, USDA and FAPDA.

## Investment market charts

The Investment Lens keeps its instrument descriptions in this repository and embeds TradingView's public Advanced Chart widget for price history. The widget does not require an API key or a connected brokerage account.

Market quotes and charts may be delayed under exchange and data-provider rules. TradingView attribution and direct fallback links must remain visible.

## Safety / data integrity rules

- Never commit API keys or tokens.
- Never label recovered/static data as real-time.
- Show observation period separately from fetch time.
- Label forecasts and estimates.
- Prefer official sources.
- Preserve original units and methodology notes.
