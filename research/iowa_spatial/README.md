# Iowa 14-day offline spatial proof (Phase 4B-1.7)

No workflow, live cache, alert, email or frontend imports these scripts. This
does not replace `us-corn-point-exposure/v1` or
`us-corn-spatial-stage-screen/1`. See
[`docs/PHASE4B1_7_IOWA_SPATIAL_POC.md`](../../docs/PHASE4B1_7_IOWA_SPATIAL_POC.md).

## Reproduce

Requires Python 3.12 and the isolated dependencies in `requirements.txt`.
Create a fresh external temporary directory with `mktemp -d`, create a virtual
environment there, and install the pinned requirements. Do not install these
packages into the production collector environment. Example, after creating an
external cache and its environment:

```sh
/path/to/external/cache/venv/bin/python research/iowa_spatial/collect.py --cache /path/to/external/cache
/path/to/external/cache/venv/bin/python -m unittest discover -s research/iowa_spatial -p 'test_*.py' -v
/path/to/external/cache/venv/bin/python research/iowa_spatial/run.py --cache /path/to/external/cache --output research/iowa-spatial-summary.json
```

The date/geography/crop are intentionally frozen in `config.json`. Do not
change them based on outcomes. Default collection reuses manifest-verified
bytes; `--refresh` explicitly retrieves a new edition. Remote mutable URLs
cannot guarantee the same bytes later. Retain the exact external cache for
same-input replay and compare hashes before interpreting a re-download.

`acquisition.json` retains URLs, byte sizes, HTTP headers, retrieval times and
raw hashes. NetCDF contains a volatile server translation timestamp; normalized
weather identities hash decoded values **and missing masks**, coordinates,
packing, dates, units and source edition, not that download clock.
`cells.json`, `overlap.npz`, `performance.json`, raw TIFF/NetCDF and the isolated
environment stay outside Git/Pages. Compact analysis JSON alone enters
`research/`; no production publish path is supported.

The current cache is `/private/tmp/wfl-iowa-2015.wMmAbZ`. It is intentionally
retained for verification, not a durable scientific archive. No automatic
cleanup deletes accepted inputs. Once preservation/replay is no longer
needed, move this **exact directory** to Trash using Finder; macOS temporary
storage may also be cleared by the OS. Removing it loses exact raw replay;
the compact repository summary is not a substitute for retained rasters.

## Scientific boundary

CDL class-1 mapped crop area × native gridMET weather cells, summarized on a
9 km equal-area lattice. Pixel boundary pieces use polygon intersection;
weather-cell edges are densified in geographic coordinates before projection.
No interpolation of crop classes, local stage percentage, soil moisture
substitution, production weight, damage estimate or new hazard threshold.

The demonstration rule is Tmax ≥35°C on ≥3 days in either fixed July 1–7 or
July 8–14 window. It is **temperature-only geometry testing**, not the complete
legacy stage-gated method. Eligibility requires all three weather variables
through all 14 days. X, Y, Z and both Y/X and Z/Y remain explicit. With no
eligible weather, overlap is null, not zero.

State geography comes from the official Iowa-clipped CDL. A Census 2015
generalized boundary only audits zero/padding classification; it is not used
to discard CDL boundary corn or redefine official acreage. Zero within its
footprint is unknown/potential boundary disagreement, not inferred non-corn.
The grid's last row/column retains full nominal cell area with partial native
data coverage; no padding is fabricated as classified land.

## Failure semantics

Uses the existing Phase 1 `DataIssue` vocabulary (`retrieval_failed`, `invalid_format`,
`semantic_validation_failed`) with concrete offline detail codes:
`retrieval_failure`, `invalid_raster`, `missing_date`, `invalid_units`,
`projection_mismatch`, `spatial_eligibility_failure`. Partial weather reduces
the mapped-area denominator coverage; absent dates reject this fixed-period
experiment. The collector records `retrieval_failed` without replacing old
bytes on failed download. The runner writes the compact summary atomically
only after validation, so a failed input leaves the previous summary intact.
This is contract-compatible offline provenance, **not** new production dataset
registration or a replacement Central Data Health service.
