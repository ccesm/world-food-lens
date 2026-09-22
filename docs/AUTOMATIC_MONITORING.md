# Daily monitoring and email alerts

This extends the existing React/Vite/GitHub Pages application. GitHub is still
the source of truth. No brokerage account, paid market feed or client-side
credential is used. The homepage has a compact bilingual alert center at
`#automatic-alerts`; phone navigation puts its link under More, keeping five
primary entries and the original desktop menu.

## Daily lifecycle

The existing GitHub Actions workflow runs on main pushes, manual dispatch and
daily at **06:23 UTC**. It refreshes official prices, NASA weather/soil, GDO and
NOAA outlook caches, evaluates rules against the prior alert state, runs tests,
builds the site, saves caches to main and publishes the website. Only successful
publication allows the email job to run. The page checks the published feed
every five minutes; its refresh button does not start an upstream download.

Schedules are best effort, not real-time delivery guarantees. GitHub can delay
scheduled jobs; scheduled workflows in an inactive public repository can be
disabled after 60 days. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
If the feed is older than 72 hours or cannot be read, the UI labels retained
records historical and does not show reassuring current zero counts.

## Transparent screening rules, version 1

| Evidence | Yellow attention | Red attention |
| --- | --- | --- |
| NASA POWER representative-point maximum temperature | At least 3 of the latest 7 consecutive observed days at or above 35°C, each overlapping template flowering or grain fill | At least 5 qualifying days |
| GDO one-month SPI, with independently corroborated source dates | Severe/extreme dry class overlapping template planting, vegetative growth, flowering or grain fill | Not implemented |
| FAO monthly food-price index | At least 5% rise from the preceding completed month | At least 10% rise |
| World Bank monthly Brent, urea, DAP, TSP and potassium chloride | At least 10% rise from the preceding completed month | At least 20% rise |

These are editorial attention thresholds, not official weather-warning levels,
investment signals, causal estimates or confirmed production loss. Weather
observations can lag; the latest observation must be no more than ten days old
and the successful fetch no more than 72 hours old. Each card includes the
exact evidence period, source link and rule. Point measurements cannot represent
a whole country. Template crop dates are not observations of field progress.

Source-specific validation checks schema, official URLs, units, dates, month
adjacency and freshness. Missing data never become a normal value. Soil wetness
and ENSO are separate health/context checks, not stand-alone alert triggers.
Partial-month soil values are not used to trigger alerts against full-month
historical normals. Typical ENSO effects never substitute for a current regional
forecast. Policy, war, trade restrictions, affected hectares, regional yield
damage and national/global production shares still require editorial verification.

GDO's service-page example dates are not an authoritative latest-date API.
Requested dates must also fall within each official WMS layer's advertised
availability. Failed, missing or contradictory metadata disables GDO automatic
alerts while keeping reference maps visible with an unverified-date notice.
This corroborates availability, not proof of the latest publication. See
[drought and soil methods](DROUGHT_SOIL_MOISTURE.md).

## State, history and notification policy

`public/data/monitor-alerts.json` retains active episodes, the latest 200 state
changes and source-health explanations. New and escalated episodes may notify;
unchanged data do not create new events. Fresh evidence below a threshold
resolves a signal. Missing, failed or stale evidence instead preserves it as
unverified, never silently resolved. Recovery with renewed evidence is recorded.

Email is a single change digest, not one message per source. The first successful
email run sends an activation/connection confirmation, even with no new alerts.
Later runs send only new/escalated active signals or a previously available
check becoming unavailable. Unchanged alerts and persistent source gaps are
silent. Resolutions remain visible on the website. Notification state is stored
separately from the bounded display history so active unsent episodes can retry.

`public/data/alert-delivery.json` records notification identifiers, source-health
state, attempt/check times, SMTP acceptance and generic error categories. It
contains no sender/recipient address, password or raw provider error. The email
job reads the latest ledger on main before a retry and commits its updated
receipt afterward. The website shows that receipt on the **next successful site
publication**, not immediately after the SMTP job. An accepted message means
the mail server accepted it, not that it reached the inbox.

The workflow also saves an Actions receipt artifact
for 14 days. SMTP and Git cannot provide a single atomic transaction: a crash
after SMTP acceptance but before receipt persistence can still cause a duplicate.
If a receipt push fails, inspect/restore that artifact before retrying. Failed
SMTP sends do not mark alerts as delivered. Failures are flagged in Actions;
the published website remains available. A completely failed build cannot use
this email channel to report its own failure; retain GitHub failure notifications.

## Configuration

Configure these **repository Actions Secrets**, never plaintext code or public
environment files:

- `WFL_ALERT_TO`: one recipient email address.
- `WFL_SMTP_USER`: the Gmail sender address.
- `WFL_SMTP_PASSWORD`: that sender's Google app password, not the normal password.

The deployed workflow defaults to Gmail over certificate-verified SSL on port
465. Google app passwords require two-step verification and may be unavailable
for some account policies; see [Google's app-password instructions](https://support.google.com/accounts/answer/185833?hl=en).
The standalone sender also supports a configured SMTP host and STARTTLS on port
587, but changing provider requires explicitly wiring those non-secret settings
into the workflow. Removing `WFL_ALERT_TO` disables email without stopping data
updates. No credential values are readable by the browser or written to logs.

After saving Secrets, run the existing deployment workflow once. Check its
email job and the inbox/spam folder for the activation message. Another ordinary
run publishes the receipt without sending a duplicate activation message.

## Verification

Run `npm test` and `npm run build`. Deterministic tests cover thresholds, crop
date overlap, data validation, stale/unverified transitions, deduplication,
retries, email failure, address injection, source gaps and GDO date contradictions.
`npm run evaluate-alerts` regenerates the feed from local caches without sending
email. The SMTP tests use injected fake senders and never deliver real messages.
