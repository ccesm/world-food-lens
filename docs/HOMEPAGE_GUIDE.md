# Homepage orientation upgrade

## Scope and current state

This is an information-architecture update to the existing React/Vite site,
not a rebuild or a new risk model. Before edits, the local checkout was clean
and aligned with GitHub at `136f441`; PROJECT_CONTEXT, MIGRATION_NOTES and
README were reviewed. The old homepage opened with four numerical headlines
and many expanded dashboards, leaving new readers to infer their relationship.

## New reading order

1. Purpose, shared current evidence summary and two navigation CTAs.
2. Core question and ten clickable transmission steps, visible by default.
   Five questions, reading instructions and additional examples are expandable.
3. Existing Global Food Stress summary, with factor evidence collapsed.
4. Current-month crop-stage priorities and the existing seasonal calendar.
5. Three-grain inventory comparisons, then optional detailed supply history.
6. Optional policy, transmission, prices, climate, forecast and release modules.
7. Two compact historical cases; the longer 1972–1974 timeline is expandable.
8. Optional cost experiment and investments, followed by the existing Data Desk.

The hero and evidence section share `useFoodStress`; its one timer and memoized
call use the unchanged `buildFoodStress` service. There is no second score,
normalization rule or data source. Missing evidence remains unscored.

## Disclosure and compatibility

`DetailModule` owns each old public section ID. Charts mount on first expansion
and remain mounted thereafter so selections and search filters survive closing.
Bottom navigation, hash changes and direct section URLs open the corresponding
disclosure. Policy-heading deep links also mount the policy section first.
Inner sections receive distinct IDs to avoid duplicate anchors.

The bottom navigation remains fixed. On desktop it retains the full section
list. At phone widths it is capped at Home, Food risk, Crops, Climate and More;
Climate and More open grouped secondary menus so future modules do not crowd the
bar. Drought and Soil Moisture now open their connected official-data sections. Desktop
flow cards use five columns; iPhone-width cards stack vertically. Both themes
use existing theme state.
New text follows the existing bilingual object convention; document language
also updates for assistive technology.

## Deliberate capability boundaries

- NOAA ocean context is not local weather or measured crop damage.
- Crop calendars are seasonal templates, not current field progress.
- Quantitative regional production/export weights are not connected.
- Importer shocks and current trade restrictions are not live monitors.
- Stocks cover wheat, maize and milled rice; no total-cereal sum is invented.
- Synchronization illustrations and market-response examples are hypothetical.
- The conceptual weather × stage × region framework is not an implemented score.
- Historical analogy is not a calibrated crisis probability or investment signal.

The short China case links to Meng, Qian and Yared's research:
https://www.nber.org/papers/w16361 . Existing USDA ERS historical attribution
and all official data provenance remain available.

## Changed files

- `src/main.jsx`: module order, original IDs on disclosures, shared model, language.
- `src/components/HomeOrientation.jsx`: hero, logic, questions and reading guide.
- `src/data/homeGuide.js`: bilingual explanations and illustrative examples.
- `src/home.css`: responsive layout and light/dark styles.
- `src/components/DetailModule.jsx`: lazy disclosure and hash navigation.
- `src/hooks/useFoodStress.js`: shared clock and existing model calculation.
- `src/components/GlobalFoodStress.jsx`: consume shared result, fold factor detail.
- `src/components/FoodHistory.jsx`: compact cases and optional longer timeline.
- `src/components/ClimateMonitor.jsx`, `PolicyEvents.jsx`, `PriceOutlook.jsx`,
  `ReleaseCalendar.jsx`: optional section IDs; original standalone defaults remain.
- `tests/homeGuide.test.js`: bilingual structure, routes and capability limits.
- `README.md`, `PROJECT_CONTEXT.md`, this report: updated entry-point documentation.

## Verification

- `npm test`: 41 JavaScript + 22 Python tests pass.
- `npm run build`: passes; the existing large-chunk warning remains.
- Browser checks: desktop and 390 × 844; Chinese/dark and English/light hero,
  no horizontal page overflow, purpose + current summary + CTA within first screen.
- Ten-step bilingual selection; five-question and reading disclosures.
- All 13 bottom-navigation destinations resolve; chart modules expand on demand.
- Direct `#s2`, same-hash reopen and two production/use curves verified.
- Policy query survives close/reopen. TradingView iframe reserves usable height.
- No app error/warning logs observed in the local navigation checks.

## Still outside this update

No new upstream feeds, historical vintages, model calibration or trading signals.
Bundle code splitting and real regional weather/production-weight integrations
remain separate work; progressive mounting is not JavaScript code splitting.
