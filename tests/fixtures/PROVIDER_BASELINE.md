# Frozen provider regression inputs

These three JSON files preserve the public provider bytes from the accepted
Phase 4B-1.10 source baseline, merge `0b0a443872c89f481f2ecba844c901c6e1dafd9c`.
They are **historical test fixtures**, not current official evidence. Their only
consumers are tests; no frontend/service/workflow imports them as live data.

Production refreshes replace and commit `public/data/*.json`. Historical tests
at fixed September/October 2026 evaluation times must not use those moving
inputs. Otherwise a valid refresh can break the next scheduled run before cache
restoration. This was reproduced using the real runner snapshot from run
37394519240, without changing any application calculation.

Only tests requiring fixed historical periods/eligibility/vintages use these
fixtures. Existing current-cache schema and integration tests still inspect
`public/data`. Assertions, fail-closed behavior, alerts, email, scientific
methods and the schedule are unchanged. Never refresh these fixture files in
the production workflow. Adding a new reviewed regression fixture is separate
from updating a production source cache.
