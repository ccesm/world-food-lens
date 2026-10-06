# Phase 0 Batch 2 — source health and evidence availability

Reviewed 2026-10-04. Local implementation only: no commits, pushes, workflow
dispatches, cache replacements or real emails. Batch 1 ENSO parsing and USDA
vintage protections are preserved. No Phase 1 platform is implemented.

## A. Root causes and original semantics

The collectors used `status: ok/error` for the entire retrieval/parse/validation
operation. A successful operation advanced `fetchedAt`, even for an unchanged
publication. Failures already retained prior data, source periods and successful
fetch times, but did not distinguish retrieval from validation failure.

The alert engine's `health.status: ok/unavailable` was actually rule/context
eligibility. It combined source reachability, parse validity, observation age,
units, continuity and rule-specific windows. Soil required the *current* calendar
month despite daily collection deliberately ending four days before today.
There was no expected-publication state. Missing current-month soil at month
start therefore appeared unavailable. Mail converted an `ok → unavailable`
transition into “数据中断”.

Freshness checks existed (three-day cache age; ten-day weather observation age;
GDO layer-specific age guards; ENSO issue age). Macro source health used one
100-day observation-age check, not confirmed publication schedules. Retrieval,
parsing and semantic checks were not independently reported. A missing rule
input correctly retained existing alerts as unverified; that behavior remains.

GDO previously discovered dates in documentation examples and accepted any date
between an advertised interval's endpoints. Neither interval membership nor the
date of the returned raster was established by that check.

FAO used a fixed `default-document-library` CSV path. A retained HTTP 404 was
classified as generic unavailable evidence, although verified cached data still
existed and its observation date had not changed.

## B. Exact Batch 2 files

Paths are repository-relative. Other dirty files are pre-existing Batch 1 work.

Implementation:

- `.github/workflows/deploy-pages.yml` — notification step wording only.
- `scripts/evaluate_alerts.mjs` — report distinct health/evidence states.
- `scripts/macro_sources.py` — FAO official path and restricted link discovery.
- `scripts/refresh_data.py` — typed failure category; retention remains unchanged.
- `scripts/refresh_weather.py` — typed per-point failures.
- `scripts/refresh_drought.py` — exact time metadata and fail-closed association.
- `scripts/send_alert_email.py` — accurate health transition digests.
- `src/services/sourceHealth.js` — small shared health/cadence/label helpers.
- `src/services/automaticAlerts.js` — independent health and eligibility.
- `src/services/alertFeed.js` — compatible validation and gap counts.
- `src/services/officialSources.js` — source-aware status labels.
- `src/services/droughtMonitor.js` — date-verification gate and explanation.
- `src/components/AlertCenter.jsx` — separate source and evidence messages.
- `src/components/SourceDesk.jsx` — source health and USDA publication version.
- `src/components/DroughtSoilMonitor.jsx` — normal lag and unverified-map wording.

Tests:

- `tests/sourceHealth.test.js` (new)
- `tests/test_source_health.py` (new)
- `tests/automaticAlerts.test.js`
- `tests/alertFeed.test.js`
- `tests/droughtMonitor.test.js`
- `tests/test_refresh_drought.py`
- `tests/test_alert_email.py`

Documentation:

- `docs/DROUGHT_SOIL_MOISTURE.md`
- `docs/PHASE0_BATCH2.md` (this report)

## C. Minimal state model and cadence

One status field is insufficient. The old fields remain for compatibility;
existing v1 feeds and delivery ledgers remain readable. New health rows add:

| Dimension | Values | Meaning |
|---|---|---|
| retrieval | ok / failed / unknown | Latest source check, not current evidence completeness |
| validation | passed / failed / unverified / unknown | Retrieved data validation; unverified covers GDO dates |
| freshness | current / awaiting / overdue / stale / unknown | Publication/observation timeliness, with stale indicating a successful-check age over 72h |
| eligibility | eligible / insufficient | Whether this specific screen or context can evaluate |

Collector errors gain `failureKind: retrieval/validation/unknown`. Known network
errors are retrieval failures; parser/validation `ValueError`s are validation
failures. Unexpected errors stay unknown. Legacy explicit `HTTPError` messages
can identify retrieval failure; generic legacy errors are not guessed.

`status: ok/unavailable` in health rows remains the legacy evidence summary,
not a network-health claim. New UI/mail use the dimensions. Last successful
check and last cached observation are shown independently. For mixed weather
points the health row reports the worst dimension and oldest successful check;
working points still evaluate independently. A short but valid history can be
healthy yet insufficient for a 30-day rule window.

| Source | Publication policy in this patch |
|---|---|
| Weather | Daily; collector keeps its existing four-day conservative lag. Existing ten-day observation and three-day cache limits remain. NASA documents roughly 2–3-day meteorological latency; four days is WFL policy, not a guaranteed provider SLA. |
| Soil | Derived from those daily values, not a separate monthly release. Before today's requested endpoint enters the new month, missing current-month context is `awaiting`. Once it should enter the month but has not, it is `overdue`; missing normals/history still makes evidence insufficient. |
| FAO | Monthly prior-month index. Existing confirmed 2026 dates plus two full calendar days of WFL operational grace after release day; no same-month requirement. |
| USDA | Monthly publication vintage, never market year. Existing confirmed 2026 WASDE dates plus the same conservative grace; PSD bulk-file delay is allowed. Batch 1 vintage checks are unchanged. |
| ENSO | Existing explicitly confirmed issue dates, plus grace. For unconfirmed dates retain the conservative 45-day age ceiling and explicit unknown timing rather than invented dates. No semantic parser changes. |
| GDO | Exact available-time metadata, followed by product association; no invented publication deadline. Unknown product date is never current. Existing 35/75/45-day layer age ceilings remain for verified data. |

The grace expires at UTC midnight three days after the listed release date
(release day plus two full days). For unconfirmed schedule years, no exact
calendar date is extrapolated. The existing conservative monthly max-age guard
remains, but unknown timing is labelled unknown, not an outage. World Bank has
no exact release commitment here; its existing price rules are not assigned a
fabricated release day. EIA and NOAA RONI ingestion are unchanged.

Missing evidence, normal lag, source failure and expired observations do not
resolve an alert. They preserve it as unverified when its required evidence is
unavailable. Only fresh, valid below-threshold evidence resolves. An unchanged
old FAO file cannot bypass an overdue publication by advancing `fetchedAt`.

## D. GDO investigation and conclusion

Official endpoints checked in memory on 2026-10-04:

- [WMS documentation](https://drought.emergency.copernicus.eu/data/wms-service)
- [GetCapabilities](https://drought.emergency.copernicus.eu/api/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1)
- Advertised `GetMetadata&layer=spaST` link: HTTP 400.
- [WCS DescribeCoverage](https://drought.emergency.copernicus.eu/api/wcs?map=do_wcs&SERVICE=WCS&VERSION=2.0.0&REQUEST=DescribeCoverage&coverageID=spaST&SELECTED_TIMESCALE=01): spatial grid/range information, no available observation-time index in the returned response.
- [JRC drought catalogue](https://data.jrc.ec.europa.eu/collection/drought): no usable layer timestep index found in the inspected listing.

WMS advertised `spaST` as `1991-01-01/2026-06-21/P10D`, `spaLT` ending
`2026-06-01/P1M`, and `rdria` ending `2026-06-21/P10D`. The ten-day interval
endpoints do not align as literal ISO durations. Reinterpreting them as days
1/11/21 would be an unsupported assumption. Documentation examples used newer
September/August dates outside those advertised endpoints.

At 360×180, short-term requests for June 21 and June 22 returned identical PNG
bytes (SHA256 `2b7f266107e0b36d476ef2b5f64e66ecbf72d2454553569cbe16b5df68f6141c`).
September 11 returned different bytes; 2099-01-01 returned HTTP 400. The PNGs
and response headers contained no observation-date association. These probes
do not establish that *all* dates are ignored, but do show that a successful
TIME request is not proof of an exact observation date.

Discovery now tries authoritative time metadata first: explicit date lists or
fully aligned intervals, selecting the latest non-future member. Unsupported,
malformed or inconsistent metadata falls back only to labelled reference-map
examples. Exact membership is `availablePeriodVerified`; download and image
parsing have their own flags. `productPeriodVerified` remains false because no
reliable returned-product date was found. Therefore `periodVerified` remains
false, **including when an exact candidate date is in the time set**. Automatic
drought remains disabled. No hypothetical response metadata is trusted.

Final live adapter check successfully downloaded/parsed all three reference
maps and returned `availability-metadata-invalid`, with all verification flags
false. No public cache was replaced by this test.

## E. FAO investigation and conclusion

The [official FFPI page](https://www.fao.org/worldfoodsituation/foodpricesindex/en/)
currently links to the CSV under `wfs-library`, including a version query. That
official download parsed successfully as September 2026, 136.0, with its stated
2014–2016 base. The unversioned new path also returned the same data.

The previously failing `default-document-library` path subsequently returned
valid data too. Some initial requests without the application user agent were
403. Thus the recorded 404 is **not reproduced as a permanent removal**; its
original upstream cause remains unknown, consistent with an intermittent/path
delivery problem. The official page's current path is different, but that alone
does not establish the cause of the old 404.

The adapter now uses the current official path. On 404/410 only, it discovers a
unique matching CSV link on the official page, restricted to HTTPS `www.fao.org`
and the World Food Situation media tree. Invalid CSV, 403, timeouts and ambiguous
links do not trigger silent substitution; there is no unofficial fallback.

Failed retrieval and rejected responses retain the old source metadata, values,
observation period and successful timestamp. Only the attempt/error fields
advance. An unchanged *successful* refresh may advance successful-check time,
but not the observation month. The old cache remains readable with an accurate
failure/stale label; it is not silently used to clear an alert.

## F. Verification

- 19 new test cases: 10 JavaScript and 9 Python; existing GDO assertions also
  tightened to reject interval-only proof and contradictory verification flags.
- Full JavaScript suite: **93 passed**.
- Full Python suite: **74 passed**. Total: **167 passed**, including Batch 1.
- Production build: passed. The existing large-bundle warning remains; no
  unrelated bundle refactoring was attempted.
- `git diff --check`: passed.
- Chinese and English server-render smoke checks: soil waiting label, GDO
  exclusion warning, FAO retrieval failure and retained-cache label passed.
- In-memory evaluation of checked-in caches: soil awaiting/insufficient;
  weather usable; GDO unverified; FAO retrieval failed with September cache;
  existing Brent alert remained active.
- Live official FAO/GDO adapter checks as described above; no real email sent.

Regression coverage includes month/year rollover, expected and overdue
publication, unknown schedules, functioning sources with too-short rule history,
network versus semantic failures, existing alerts during missing evidence,
valid low-risk resolution, stale/unchanged FAO data, retained timestamps,
official-only fallback, exact GDO membership/nonmembership, off-step examples,
malformed and unavailable metadata, unlabelled successful PNGs, health-feed
compatibility and quiet expected-lag email transitions.

## G. User-visible changes

Labels now include “正常等待发布”, “观测更新滞后”, “本次获取失败”,
“新资料未通过核验”, “缓存待重新检查”, “资料日期待核实” and
“来源正常 · 判定资料不足”, with English equivalents. Source and eligibility are
displayed separately. Soil shows the actual latest cached date, never last
month relabelled as this month. SourceDesk distinguishes USDA market year from
publication vintage. Emails say “资料状态变化” with specific causes, not generic
“数据中断”. Expected publication waiting and evidence-only insufficiency are
silent. Existing alerts remain unverified rather than green when evidence drops.

## H. Remaining limitations

- GDO lacks a reliable product-date association in inspected responses and has
  contradictory advertised availability. This patch deliberately does not
  restore automatic drought alerts. Other uninspected upstream products might
  eventually support them, but require separate validation.
- Release dates require continued editorial maintenance. Future-year exact
  schedules are not guessed. Grace periods are operational policies, not SLAs.
- Old records with generic untyped errors stay unknown until another refresh.
- Source validation status describes the latest attempted response; retained
  cache validity is represented by retained data/period/fetchedAt, not a full
  separate historical provenance model. Freshness may report an overdue cache
  check ahead of publication age. Rule-specific units/windows still gate each
  rule independently.
- Weather retrieval and soil climatology are still one per-point operation;
  this patch does not split their failure domains or redesign ingestion.
- FAO can revise historical values and still fail intermittently; no network
  success today guarantees future availability. No permanent 404 cause was proven.

## I. Phase 1 implications — not implemented

One status field must not represent all source states. The four small derived
dimensions and typed collector failures are necessary now, without a canonical
metadata migration. Phase 1 should centralize per-attempt download/parse/
validation records, last-good provenance, independently represented observation
and check freshness, versioned cadence policies, per-rule eligibility reasons,
and product-level identity/time association. It should remove the legacy binary
summary after consumers migrate, and unify the small JS/Python health-label
mapping. Databases, generalized signal engines and new external services are
not part of this patch. Batch 1's USDA coverage/revision-order limitations remain
unchanged and belong to that later work.
