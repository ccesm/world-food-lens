# Drought and soil-moisture data

## Scope

The crop-window module now adds two independent official evidence layers to the
existing 16 representative points. This is an extension of the existing
React/Vite application, not a new risk score or a replacement for the seasonal
calendar.

## Copernicus Global Drought Observatory

`scripts/refresh_drought.py` first reads public Copernicus/JRC Global Drought
Observatory WMS time metadata, with service-page examples as an explicitly
unverified reference-map fallback, and retrieves
three global raster layers:

- short-term precipitation anomaly: one-month SPI (`spaST`);
- long-term precipitation anomaly: six-month SPI (`spaLT`);
- Risk of Drought Impact for Agriculture (`rdria`).

The script samples each representative latitude/longitude from the official
indexed-colour raster and stores the resulting class, exact source period and
WMS URL in `public/data/drought-monitor.json`. The browser shows both the cached
point classifications and the provider-hosted global map. It does not download
or republish a full raster in this repository.

Example request dates are not an authoritative latest-publication listing.
The refresher checks exact membership in WMS GetCapabilities time dimensions,
not merely containment between two dates. It accepts explicit date lists and
aligned day/month/year intervals; it does not reinterpret `P10D` as calendar
dekads. Unsupported or contradictory metadata fails closed. On 2026-10-04 the
advertised short-term interval did not align with its timestep, and the service
provided no trustworthy response observation date. Even exact membership alone
does not establish that an unlabelled PNG represents that date. Consequently the
current adapter never sets `periodVerified: true`; automatic drought screening
remains disabled. Download, image parsing, available-date membership and product
date association are recorded separately. Future/regressed periods and failed
refreshes retain previous values without inheriting eligibility. Reference maps
remain labelled with requested dates, not confirmed observation dates.

See [Phase 0 Batch 2](PHASE0_BATCH2.md) for the live endpoint investigation and
source-health semantics.

SPI describes how precipitation at a grid cell compares with its historical
distribution. RDrI-Agri combines hazard, exposure and vulnerability for hotspot
screening. A blank/uncoloured RDrI cell is therefore labelled “no coloured
hotspot / unclassified”, not “safe”, and neither layer proves field damage or
yield loss. See the official [GDO introduction](https://joint-research-centre.ec.europa.eu/european-and-global-drought-observatories_en),
[WMS documentation](https://drought.emergency.copernicus.eu/data/wms-service),
[indicator catalogue](https://joint-research-centre.ec.europa.eu/european-and-global-drought-observatories/drought-indicators_en)
and [data-availability notes](https://joint-research-centre.ec.europa.eu/european-and-global-drought-observatories/when-data-becomes-available-archive_en).

## NASA POWER soil wetness

The existing weather refresh now requests two additional daily NASA POWER
parameters:

- `GWETROOT`: root-zone soil wetness;
- `GWETTOP`: surface soil wetness.

Both are unitless modelled wetness values on a 0–1 scale, not field volumetric
water content or a direct irrigation measurement. A second POWER request stores
1991–2020 monthly climatology for the same point. The refresh calculates p10,
p25, median, p75 and p90 across the 30 same-month monthly means. The selected
historical month is compared only with its own calendar-month distribution;
current partial months are explicitly provisional. See the official
[POWER Daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/).

Complete historical months remain visible even if the latest refresh is stale.
Future or incomplete historical months never fall back to current values.

## Freshness and failure behaviour

Each refresh uses atomic JSON replacement and last-good retention. The GDO
bundle is marked non-current when its fetch is older than three days or a source
attempt fails. Individual source periods also have conservative age guards:
35 days for short-term SPI, 75 days for long-term SPI and 45 days for RDrI-Agri.
NASA current-month interpretation is suppressed when the cache is stale or its
last daily value is too old. Missing and invalid data produce an unavailable
state, never an invented normal or low-risk value. At the start of a month,
the collector's deliberate four-day lag may leave only prior-month observations:
this is normal publication waiting, not a source outage. The current-month
context remains insufficient; it is not filled with last month's data.

The daily GitHub Pages workflow runs both `scripts/refresh_weather.py` and
`scripts/refresh_drought.py`, retests the generated caches and commits changed
official data back to the source-of-truth repository before deployment. No API
key or user account is required.

## Interpretation boundary

The 16 points are editorial sampling locations. They are not country averages,
official production centroids or crop-area-weighted regional measurements. The
interface deliberately keeps historical ENSO tendency, current seasonal
forecast, observed point weather, drought classifications, soil wetness and crop
stage separate. It does not calculate affected hectares, global production loss,
yield probability, synchronized crop failure or a contribution to the Global
Food Stress score.

## Verification

Tests cover WMS period discovery, indexed-PNG decoding, palette classification,
last-good retention, schema and age validation, daily soil ranges, same-month
climatology, historical completeness and mobile live navigation. Run:

```bash
python3 scripts/refresh_weather.py
python3 scripts/refresh_drought.py
npm test
npm run build
```
