# PROJECT_CONTEXT — World Food Crisis

## Mission
Build an understandable global food-intelligence application that explains not only *what* food prices are doing, but *why* they are moving.

## Product scope
The app should connect:
- global food and agricultural commodity prices
- long-run historical price trends
- crop production, consumption and ending stocks
- fertilizer prices
- crude oil / energy prices
- climate and ENSO risks (El Niño / La Niña)
- trade and agricultural policy
- investable U.S. securities related to agriculture

## Data-source direction
Prefer authoritative, reproducible sources:
- FAO / FAOSTAT
- World Bank Commodity Price Data / Pink Sheet
- USDA PSD and WASDE
- EIA
- NOAA and other official meteorological agencies
- official national government policy releases

Every displayed data series should eventually expose source, observation date, update date, units, and methodology where practical.

## Investment module
Track U.S.-listed ETFs/stocks with agriculture exposure. Initial examples:
DBA, CORN, WEAT, SOYB, MOS, NTR, DE, ADM.

Clicking an instrument should eventually show:
- latest available market price
- historical price chart
- company/fund description
- agricultural exposure
- relationship to food prices
- source and timestamp

Market data must be clearly distinguished from delayed/illustrative values.

## Policy database
Normalize important policy events such as:
- export bans/restrictions
- import tariffs
- subsidies
- strategic reserve releases/purchases
- biofuel mandates
- fertilizer/export policy
- sanctions affecting food, fertilizer or energy flows

Desired fields:
date, country, commodity, policy_type, direction, summary, source_url, expected_effect, confidence, updated_at.

## Language
Maintain English and Chinese UI. New user-facing strings should be placed in the translation layer rather than hard-coded repeatedly.

## Development rules
- GitHub should be the source of truth.
- Make incremental changes and preserve working functionality.
- Do not commit API keys, passwords, tokens or `.env`.
- Prefer official data over scraped secondary data.
- Clearly label forecasts, estimates, delayed data and placeholders.
- Before a large refactor, inspect current architecture and test existing behavior.
- Keep the interface understandable to non-experts.
- Mobile responsiveness is required.

## Near-term roadmap
1. Connect live World Bank agriculture/fertilizer/energy data.
2. Connect USDA PSD/WASDE production and ending-stock series.
3. Connect FAO food-price data.
4. Build normalized automated policy feed/database.
5. Add climate/ENSO risk panel.
6. Connect current + historical market prices for investment instruments.
7. Add source timestamps and data-health indicators.
8. Add deploy configuration for public hosting.
9. Add tests and automated data refresh jobs.

## Handoff rule for any ChatGPT/Codex account
Before editing:
1. Read this file and README.md.
2. Inspect `git status`, current branch, and recent commits.
3. Inspect existing implementation before replacing anything.
4. Preserve features unless explicitly asked to remove them.
5. After changes, test the app and summarize changed files.
