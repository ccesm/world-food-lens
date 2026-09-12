# MIGRATION_NOTES

## Why this migration exists

The original World Food Lens was published as a ChatGPT-hosted Site rather than a normal local Git repository. As a result, the Mac filesystem had no corresponding source folder.

A text projection of the active hosted Site was recoverable, including page structure, visible data, source status, and site metadata. The underlying original server-side synchronization implementation was not directly exportable.

## Recovered faithfully

The migration reproduces the visible product architecture:

1. PRICE PATH
2. WORLD BANK / FERTILIZERS
3. WORLD BANK / AGRICULTURE
4. USDA WORLD TOTAL
5. FAO FAPDA policy database section
6. CONNECT THE DOTS
7. LEARNING LAB
8. DATA DESK
9. Chinese / English interface

It also restores the recoverable 36-month FAO/Brent series and August 2026 benchmark table values from the published Site snapshot.

## Not recoverable as source code

- Original hosted Site server/cache implementation
- Original FAPDA synchronization/storage code
- Exact full USDA production/consumption/stocks historical series
- Any hidden server credentials/configuration
- Original build-system internals used by the hosted Site

These were not recovered from the old site. The official-data increment now
reimplements public macro downloads, climate monitoring and an editorial policy
registry in this repository; it does not claim to recover the old backend.

## Post-migration data increment

The immutable recovered snapshot remains intact. Official downloads are stored
separately in `public/data/official-data.json` and replace only sections with
validated source data. The new USDA historical ratios are calculated from the
official recent country/area records, not invented extensions of the old ratio.
Source failures retain the prior successful cache and timestamp.

NOAA RONI and a nine-event policy/conflict registry are new capabilities. Policy
records are historical, non-exhaustive and manually verified, not a restored
FAPDA synchronization service. Read README.md for operation and current limits.

## New post-migration extension

An INVESTMENT LENS section has been added as a safe scaffold for:
DBA, CORN, WEAT, SOYB, MOS, NTR, DE, ADM.

No fake real-time quotes are included.

## Source-of-truth transition

After validating this migration locally and pushing it to GitHub, GitHub should become the canonical source. The old `chatgpt.site` deployment can remain online as a reference until the Git-hosted replacement reaches feature parity.

## Recommended next commit sequence

1. `Migrate World Food Lens hosted site into Git`
2. `Add World Bank live data adapter`
3. `Add FAO and EIA live data adapters`
4. `Add USDA PSD supply and stocks adapter`
5. `Rebuild FAPDA policy sync`
6. `Add market data adapter for Investment Lens`
