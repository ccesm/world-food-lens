# Local crop weather, first connected version

The existing 21 seasonal crop templates now link to 16 illustrative grid points.
Coordinates and mappings are explicit in `src/data/weatherPoints.json`. They are
editorial sampling choices, not national averages, official production centroids,
or crop-area weighted regional exposure. France does not represent all Germany,
nor does one Pampas point represent all Argentina. Nearby crops reuse a request.

## Source and collection

[NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
supplies T2M_MAX, T2M_MIN (°C), PRECTOTCORR (mm/day), requested in UTC for the
agricultural community. Meteorological values are gridded assimilation/model
products, not field observations. Provider lineage is retained per point.
See [NASA's data FAQ](https://power.larc.nasa.gov/docs/faqs/data/).

`python3 scripts/refresh_weather.py` retrieves daily history from 2024-01-01
through four UTC days before the run, allowing for publication lag. It validates units,
response coordinates, complete dates, numeric ranges, missing sentinels and
temperature ordering. Three concurrent requests maximum. Each point retains its
last good data/fetch date independently on failure; JSON replacement is atomic.
GitHub's existing daily deployment workflow refreshes and commits this separate
cache (`public/data/local-weather.json`) before publishing. No API key or browser
provider request is needed. Macro-data adapters are unchanged.

## Interpretation

The default UI follows the selected year and month. Historical months require
every calendar day (including leap days); the current month may be incomplete,
with a prominent notice. Future or missing months never reuse current weather.
An independent latest-30-days view remains selectable; changing year/month
returns to monthly mode. Historical values are latest revised provider data,
not archived as-known-at-the-time vintages.

The UI displays the actual represented period, timestamps, temperature extremes,
days ≥35°C maximum / ≤0°C minimum, rain total and longest run below 1 mm/day.
These are explicit descriptive cutoffs, not calibrated crop injury thresholds.
The maximum dry run is bounded by the selected window; it may have started earlier.

Each weather day is matched to its own month in the crop template. The overlap
count and heat-day count cover flowering/pollination and grain fill only. Monthly
historical comparisons describe the selected year, not current conditions. In the
independent 30-day view, a non-current year/month suppresses stage interpretation.
Failed fetches, checks older than 72 hours, implausibly future fetch times or
weather ending over ten days ago suppress current interpretation; valid complete
historical months remain available for historical template comparisons, with any
refresh warning exposed. Missing/malformed windows yield no summary, never zero risk.

No precipitation anomaly, drought designation, yield loss, winterkill probability,
or global-score change is calculated. Climate normals, soil moisture, snow,
irrigation, cultivars, area weights and field damage remain missing. This is a
first weather-exposure layer, not the completed regional agricultural risk model.

## UI and verification

Click a crop priority card's weather link to select its point, or use the new
region/crop selector. Existing crop filters constrain this list. The daily table
is expandable. Chinese/English and light/dark styles are preserved. The module
provides NASA methodology and the exact raw request for audit.

Tests cover all crop mappings, daily date/stage alignment, missing/invalid data,
stale/error suppression, unit/sentinel validation and independent last-good
fallback. Existing tests remain in the standard `npm test` suite.

Initial retrieval: all 16 points succeeded, representing 2026-08-11–2026-09-09.
Historical expansion on 2026-09-13: all 16 points succeeded from 2024-01-01
through 2026-09-09. These dated checks do not imply continuing source health.
