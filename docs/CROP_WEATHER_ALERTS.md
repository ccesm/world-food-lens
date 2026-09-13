# Crop-weather report watchlist

Manually reviewed 2026-09-13. Seven editorial report groups, not seven countries
or independently measured disasters. Data: `src/data/cropWeatherAlerts.js`.

Sources: JRC MARS assessment published 2026-08-24 (updated 2026-08-25), sections
Severe impacts, Moderate impacts and Alerts; JRC ASAP August global overview
published 2026-09-03, findings 2, 3, 5 and 6. Exact official links appear with
each record. The FAO Angola page returned a 2025 assessment despite a newer
search snippet and was excluded. Southern Africa's next-season outlook was
excluded from this current-year impact list.

WFL red means severe agricultural impacts described by the source; yellow means
moderate impacts or a concern requiring follow-up. These are NOT official
meteorological warning levels, calibrated loss estimates, live alerts or a
comprehensive global inventory. Crop damage, forecast yields and final production
are distinct. Regional reports cannot be assigned uniformly to each country or
to existing NASA representative points. No emergency decree is inferred.

The panel is independent of weather month/year/crop controls, explicitly stated
on screen. It is not a historical point-in-time warning archive. Reviews older
than 30 days are marked archive-only; year changes suppress previous-year rows.
Daily cache refresh does not renew review dates. Maintenance requires reading
new reports, revising/removing superseded records and only then updating review
dates. Empty coverage never means safe. No global-stress or price model changes.

Tests cover provenance, bilingual fields, filters, expiry and year rollover.

## Affected area and global production scale

The two JRC summaries above do not publish event-specific affected cropland
hectares for these seven groups. Every card therefore says that hectares are
unavailable. Drought footprint, total cropland or all fields in a named country
must not be substituted for affected crop hectares.

For scale only, some cards show 2026/27 USDA PSD forecast production divided by
the **world production of the same crop** from the September 2026 bulk CSV,
checked 2026-09-13; raw unit is 1000 metric tons. EU maize 50,600 / 1,290,952
= 3.9%; Honduras plus El Salvador maize 690 + 650 / 1,290,952 = 0.10%; Pakistan
milled rice 9,600 / 533,852 = 1.8%. EU is a broader geographic envelope than
the reported damaged subregions, appears on three overlapping report cards and
must never be added three times. The two Central American countries cover only
part of the Dry Corridor. Pakistan national output includes seasons and regions
outside the cited kharif concern. These shares are *not* affected output or loss
shares and cannot establish impact on global production. For East/West Africa the
crop or region cannot be aligned robustly, so no numerical share is shown.

Source: https://apps.fas.usda.gov/psdonline/app/index.html#/app/downloads
(`psd_grains_pulses_csv.zip`, `Production`, 2026 market year; world denominator
cross-checked to `public/data/official-data.json`). Recheck numerator,
denominator and vintage together when USDA revises the forecast.
