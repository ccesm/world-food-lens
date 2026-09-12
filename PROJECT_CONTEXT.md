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
