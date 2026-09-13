# ENSO & Seasonal Climate Outlook

This module connects published climate **outlooks**, not crop-loss predictions.
It is separate from the existing NOAA RONI observation chart, NASA POWER point
weather, reported crop impacts and the incomplete Global Food Stress score.

## Data and update path

`scripts/refresh_enso.py` downloads three NOAA CPC documents together: the
[ENSO diagnostic discussion](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml),
[official phase probabilities](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/),
and [RONI percentile outlook](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/outlook/).
It checks that all three have the same issue month, nine contiguous three-month
seasons, valid phase-probability totals, and ordered percentile bands. A format,
network or validation failure retains the last-good `data` and `fetchedAt`,
records the failed attempt, and makes the job step report an error without
blocking the other existing source refreshes. The cache is
`public/data/enso-outlook.json`. It requires no API key; the downloader uses
Python's standard library. The daily GitHub Pages workflow refreshes and
commits it before building the site. Run it manually with:

```bash
python3 scripts/refresh_enso.py
```

The interface marks the NOAA snapshot archival if the last successful fetch is
over seven days old, its issue date is over 45 days old, or the latest refresh
failed. An old snapshot is still readable with a warning but cannot establish
a current forecast. NOAA's overlapping 3-month phase probabilities are **not**
independent events and 100% table entries are rounded. The displayed RONI
percentiles are a **relative ENSO index**, not monthly Niño 3.4 anomalies or
yield-loss intervals. The diagnostic's Niño 3.4 value and observation month
are shown separately from the RONI forecast and all cache timestamps.

## Three deliberately separate evidence layers

1. **Typical historical teleconnections** (`typicalTeleconnections`): a
   schematic, phase/season-selectable teaching map of broad NOAA-described
   historical tendencies. These never populate the current forecast list.
   Missing or unsupported inverse patterns remain absent.
2. **Published regional seasonal outlooks** (`seasonalClimateSignals`): short
   bilingual editorial summaries with source URL, issue date, valid months,
   area and wet/dry direction. These are not automatically inferred from the
   ENSO probability table. A global forecast is never shown as an Indian or
   Australian field-level probability. The four initial records were reviewed
   on 2026-09-13; the list is selective, not comprehensive. Maintainers must
   reread and update these records when providers issue later regional outlooks.
   After 45 days without review, the list becomes archival and the current
   crop watch is suppressed.
3. **Observed weather and crop impacts**: the existing NASA POWER point cache
   and JRC report watchlist have their own dates and coverage. They are linked
   from this module, but the ENSO module does not silently convert them into
   matched regional anomalies or verified yield losses. The present point
   weather lacks climate normals, soil moisture, planted area and field damage.

The initial regional sources are [WMO's August–October 2026 discussion](https://wmo.int/news/media-centre/strong-el-nino-expected-intensify)
for the Indian subcontinent and southern/eastern Australia,
[JRC ASAP's October–December Southern Africa outlook](https://joint-research-centre.ec.europa.eu/jrc-news-and-updates/el-nino-drives-crop-failure-central-america-and-east-africa-and-threatens-next-season-southern-2026-09-03_en),
and [WMO/ICPAC's Greater Horn outlook](https://wmo.int/media/news/el-nino-impacts-greater-horn-of-africa).
The Horn item has no matching crop calendar, so it does not enter the crop
watch. A new WMO global issue does not automatically replace these earlier,
more specific statements; their date and valid period remain visible.

## Crop-window screening, not a risk model

The “what may matter next” list requires both a published regional outlook
and a declared crop-calendar template for the same region/valid months. Past
months are excluded from the forward watch; template flowering/grain-fill
overlaps sort first. This ranking represents only the site's stage sensitivity,
not production exposure, area affected, forecast confidence or global impact.
Three cards also show frozen September 2026 USDA 2026/27 national production
shares of world output for the **same crop**: India milled rice, Australia
wheat, and South Africa maize. They are background scale, not forecast-exposed
or affected production. India/Australia national boundaries exceed the cited
outlook crop areas; the Southern Africa outlook exceeds South Africa. These
shares must never be summed or used as yield-loss probabilities. The source is
the same [USDA PSD bulk release](https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads)
used by the existing supply history; figures were checked against the
September 2026 official data cache and underlying country rows.
No 0–100 yield-risk score, synchronous crop-failure rating, or causal price
forecast is created. The 12-month timeline shows three illustrative crop
templates, with NOAA probabilities only in their published start months.
Blank months are missing, not zero-probability forecasts.

## Maintenance and verification

- When the NOAA page format changes, adjust the parser against the published
  headings and tables and add a regression fixture before updating the cache.
- Review each editorial regional entry against its newer official successor,
  or let the 45-day archive guard remove it from the active watch. Do not copy
  an old valid period into the next year or infer a local forecast from ENSO.
- Add crop calendars only with a suitable official agronomic source and mark
  their stage timing as approximate until local crop-progress observations exist.
- Revisit the forecast-to-reality evidence chain only when same-period,
  appropriately regional observations and crop-condition reports are available.
- Run `npm test` and `npm run build`; verify Chinese/English, light/dark and
  mobile navigation before deployment. Source failures should leave the
  existing site usable with honest warning labels.

No credentials, hidden endpoints or market-data entitlements are added.
