# World Food Crisis

A public-facing bilingual web application for understanding global food-price movements and the forces that drive them: crop supply, inventories, fertilizer, energy, climate, policy, and investable market exposure.

## Current v0.1
- Responsive global food dashboard
- English / Chinese toggle
- Historical food-price visualization scaffold
- Commodity monitor
- Climate, energy, fertilizer, policy and stock pressure signals
- U.S.-listed agriculture ETF/stock module
- Clickable investment instruments with historical-chart placeholder
- Policy-monitor scaffold
- Clear separation between placeholder data and future live official feeds

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Data integrations planned
1. FAO / FAOSTAT — food-price and agricultural data
2. World Bank Commodity Price Data ("Pink Sheet") — agriculture, fertilizer, energy
3. USDA PSD / WASDE — production, consumption, trade and ending stocks
4. EIA — energy/oil
5. NOAA and other official climate agencies — ENSO and weather risks
6. Official government sources — export restrictions, tariffs, subsidies and stock releases
7. A suitable market-data provider — current and historical prices for ETFs/stocks

Do not commit API keys or secrets. Put secrets in local environment variables and keep `.env` ignored.

## Important
The v0.1 dashboard contains illustrative/placeholder values where a live source has not yet been connected. Do not present placeholder data as real-time data.
