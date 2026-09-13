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
