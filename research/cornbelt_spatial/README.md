# Phase 4B-1.8: offline ten-state spatial scaling validation

This is **research, not an operational collector**. No frontend, workflow,
production data refresh, alert or email uses it. It adds no hazard rule. Iowa
Phase 4B-1.7 scripts and artifacts remain unchanged.

The ten states come from the existing `src/data/cornPilot.json`; the crop year
and dates are frozen in `config.json`: class-1 corn, 2015-07-01–2015-07-14.
Do not change the dates, crop definition or geometry based on crop outcomes.
See [the scaling report](../../docs/PHASE4B1_8_CORN_BELT_SCALING.md).

## Reproduce

Use Python 3.12 and the exact dependencies in
`../iowa_spatial/requirements.txt` in an **external isolated environment**.
Create a new cache with `mktemp -d`; raw or annual cache inside this repository
is rejected. Example using an existing external environment/cache:

```sh
/path/to/venv/bin/python research/cornbelt_spatial/acquire.py --cache /path/to/cache --workers 4
/path/to/venv/bin/python research/cornbelt_spatial/audit_boundaries.py --cache /path/to/cache
/path/to/venv/bin/python research/cornbelt_spatial/validate.py --cache /path/to/cache --rebuild --output research/cornbelt-spatial-summary.json
/path/to/venv/bin/python research/cornbelt_spatial/validate.py --cache /path/to/cache --output research/cornbelt-spatial-summary.json
/path/to/venv/bin/python -m unittest discover -s research/cornbelt_spatial -p 'test_*.py'
```

Acquisition accepts `--iowa-cache /path/to/accepted/iowa/cache` to reuse
manifest-verified Iowa bytes via immutable hardlinks. It never edits Iowa raw
data. Do not manually edit hardlinked inputs. Otherwise Iowa is acquired in
the same way as the other states. Acquisition uses bounded classic-NetCDF
subsets, at most four concurrent independent downloads. Analysis is sequential
in separate processes, isolating failures and measuring each state's memory.

Default acquisition reuses URL/hash-verified accepted bytes; it **does not
refresh a live mutable weather URL**. A fresh external cache retrieves a new
edition. Same-input replay requires retaining accepted raw bytes; later
re-downloads are not promised to have identical source hashes.

`audit_boundaries.py` checks all 45 state pairs for duplicate class-1 native
pixels and independently counts crop pixels. A verified audit is required to
claim that the successful state sum is a nonduplicated mapped-area union.
The summary marks `nativeMaskUnionVerified=false` if the audit is absent or
stale; duplicate masks reject combined replacement. Individual state results
remain available.

## Annual versus dynamic cache

Annual files, outside Git:

- `annual-cells.json`: state-partitioned crop area on the fixed shared lattice.
- `annual-overlap.npz`: sparse common-cell × native-weather-cell crop areas.
- `annual-manifest.json`: crop/boundary hashes, weather **coordinate** identity,
  grid parameters, implementation identities, artifact hashes and area checks.

Dynamic files, outside Git:

- Three weather subsets and their decoded/missing-mask identities.
- `state-summary.json` and `distribution.npz` for joint-valid area quantiles.
- `performance.json`; combined `performance-run.json` separates volatile
  measurements from deterministic analytical content.

Changed weather values do not invalidate annual geometry. Changed crop bytes,
boundary, weather coordinates, grid or spatial implementation do. Corrupt
annual files are rejected and rebuilt. No matrix row is normalized to its
target area; uncovered support remains missing.

This replay runner retains raw CDL for hash verification. A future production
package should restore only verified compact annual weights plus its accepted
source manifest, not download/reprocess 2.6 GB of CDL each day. That adapter,
current-year vintage policy, recent-weather revision refresh, cache restoration
and actual GitHub runner benchmark are **not implemented here**.

## Failure and scientific semantics

Each state is `ok` or `unavailable`. Missing input dates do not select a new
period. Partial finite weather leaves partial coverage; zero valid support
gives null weather statistics, not zero rainfall. Failed state summaries are
never reused as successful current weather. A verified annual crop denominator
can remain known when weather fails. Unknown crop geography makes full-domain
coverage null, rather than normalizing surviving states to 100%.

Outputs describe **mapped corn area × gridded weather / 玉米制图面积与网格天气
交叠**. They are neither national US exposure nor production-equivalent
exposure, affected acreage, crop damage or yield loss. Percentiles represent
mapped-area weather distributions, not field measurements. State-level stage
is not distributed over cells; local stage eligibility remains insufficient.

The generalized routine reuses Iowa's categorical/CRS/unit/date validators,
fractional pixel intersections, densified native weather footprints and area
weighted statistics. Other CDL origins are not incorrectly snapped to Iowa:
native pixels are fractionally intersected with the same fixed reporting grid.

Only compact provenance-rich analysis and measured performance JSON enter
`research/`; no raw TIFF, NetCDF, per-cell JSON, sparse matrices or map enter
Git. The retained cache for this experiment is
`/private/tmp/wfl-cornbelt-2015.M11d2r`. It is not a durable archive; OS cleanup
may remove it. Preserve that exact cache if raw replay is needed. When no
longer needed, move **that exact directory** to Trash; no broad cleanup is run
by these scripts. The original Iowa cache is independently preserved.
