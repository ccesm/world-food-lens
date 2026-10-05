# Phase 1 discovery (before implementation)

Baseline: main 6625cdb, with uncommitted Phase 0 batches 1–3 preserved. No public cache, release, email or deployment is changed by this work.

| Producers | Payload / identity / validation | Consumers |
| --- | --- | --- |
| macro_sources.py, refresh_data.py | official-data.json: FAO CSV/fallback URL, World Bank XLSX, EIA HTML, USDA PSD ZIP; source.period, status, fetchedAt, lastAttemptAt; failed refresh retains accepted data. USDA marketing year, releasePeriod, observationId, revisionId, refreshKind; countryAreaCount but no contributor identity | officialSources, dashboardMetrics, foodStress, priceForecast, main, GrainInventory, GlobalFoodStress, PriceOutlook, SourceDesk, automaticAlerts |
| climate_sources.py via refresh_data.py | NOAA observed RONI, overlapping completed three-month periods, provisional latest observation | ClimateMonitor, main, SourceDesk |
| refresh_weather.py | local-weather.json, per representative point; NASA daily weather/soil and 1991–2020 normals; today minus four days; retained points on failure | localWeather, droughtMonitor, LocalCropWeather, DroughtSoilMonitor, automaticAlerts |
| refresh_drought.py | drought-monitor.json, three GDO images; parse success and advertised candidate periods do not prove product period; periodVerified gate remains false without proof | droughtMonitor, DroughtSoilMonitor, automaticAlerts |
| refresh_enso.py | enso-outlook.json, three same-issue NOAA documents; report availability separate from audited strengthEvidence extraction | ensoOutlook, EnsoSeasonalOutlook, automaticAlerts |
| evaluate_alerts.mjs | monitor-alerts.json + immutable release-manifest; rule windows, retained unverified alerts, events, source-health rows | alertFeed, AlertCenter, send_alert_email.py |
| release_pipeline.py, deploy-pages.yml | source revision, exact input byte hashes, release ID and snapshot checksum; retry/notification monotonicity | releaseIdentity, alertFeed, email ledger; not replaced by Phase 1 |
| send_alert_email.py | mutable delivery ledger with release pointer; uncertain delivery, retries, health transitions | AlertCenter; no live email in this task |
| src/data editorial records | cropCalendars, weatherPoints, cropWeatherAlerts (30-day review), seasonalClimateSignals (45-day review), policyEvents, releaseSchedule; no automatic retrieval claim | crop windows, regional alerts, policy events, release calendar; static source revision supplies version |
| recovered-snapshot.json / TradingView | historical fallback / external public widget; not an accepted current official dataset | dashboard fallback / investment chart |

## Distributed semantics found

- sourceHealth.js: Phase 0 retrieval/validation/publication/eligibility projection and calendar-aware freshness; only partially adopted.
- officialSources.js: additional 72-hour/100-day freshness and status labels; missing source keys in some callers.
- localWeather.js and droughtMonitor.js: 72-hour fetch and 10-day observation limits plus independent window checks. Soil month-start is normal awaiting publication, not source failure.
- ensoOutlook.js: seven-day fetch limit versus three days in automaticAlerts; 45-day report limit. Strength extraction must not determine report health.
- automaticAlerts.js: own fetch gate, per-rule coverage/units/adjacency checks; evidence eligibility separate from availability. GDO unverified periods must never clear alerts.
- foodStress.js: independent fetch/observation checks and minimum history lengths; incomplete factors do not yield a full risk score.
- SourceDesk currently shows only macro feeds. Climate and alert components each interpret status separately.
- Python keeps last good data on errors, but does not consistently encode format versus semantic validation, cache reuse, or canonical content identity. ENSO lacks failureKind.
- Existing release identity already binds all four cache bytes and source code; dataset metadata should live inside these bytes, not introduce a second release system.

## Migration boundary

Keep all legacy payload values and Phase 0 safety gates. Add versioned metadata at ingestion, normalize old records on read, centralize freshness and health projection, and expose release-bound diagnostics in the existing monitor feed. Rule-specific window requirements remain in their owning rule, not in dataset health. Editorial/static data remain explicitly editorial, without fabricated fetch or publication times.
