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

1. Reconnect World Bank Pink Sheet.
2. Reconnect FAO Food Price Index.
3. Reconnect EIA Brent.
4. Reconnect USDA PSD/WASDE.
5. Rebuild FAPDA policy sync/search with durable local storage.
6. Add source health/status metadata.
7. Connect investment current/historical market data.
8. Add scheduled refresh in hosting environment.
9. Add automated tests.
