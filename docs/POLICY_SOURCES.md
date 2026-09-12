# Policy and conflict registry v1

Historical sources reviewed on **2026-09-12 UTC**. The local date in California
was 2026-09-11. These dates mean a source review, not a new official publication,
an automatic fetch or a confirmation of today's legal position.

## Scope and maintenance

`src/data/policyEvents.json` is a durable, manually edited registry bundled with
the website. It is **not an automated FAPDA integration** and makes no claim to
complete global coverage. It contains nine selected events from 2022–2024.
An official FAPDA link is an external research entry point only.

Each event separates `eventDate`, `publishedAt`, optional `effectiveDate` and
`verifiedAt`. For reports, `eventDate` is the report date, not a conflict's onset.
`historical` labels a historical episode, not its current legal force;
`not-reverified` explicitly leaves the present status unresolved. Neither means
"currently in force". Source review and present-status legal review are different.

To add or revise a record, read the official source, write short original Chinese
and English summaries, retain exemptions and scope, and add a stable ID and
source URL. Never update `verifiedAt` just because a build ran. Record event and
publication dates independently. Leave an effective date null if evidence is
ambiguous. Recheck with `node --test tests/policyEvents.test.js`.

Commodity tags describe the relevant transmission channel, not a quantified
impact on every commodity. Expandable transmission text is World Food Lens's
interpretation, not an official forecast or a causal price estimate. No quotes
or article bodies are stored.

## Source trail

| Records | Official source | Dating / scope check |
| --- | --- | --- |
| India wheat restriction | [PIB parliamentary reply](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1843901) | Published 2022-07-20; recalls the 2022-05-13 policy change and exceptions. Effective date left unset because the reply describes exports from 14 May while dating the policy change 13 May. |
| India wheat customs relaxation | [PIB transition announcement](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1825991) | Published 2022-05-17; applies to qualifying consignments registered by 13 May, not a blanket reopening. |
| India non-basmati rice restriction | [PIB rice policy announcement](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1941139) | Published and effective 2023-07-20; this announcement did not change parboiled or basmati policy. No current restriction inferred. |
| Indonesia palm oil ban and reopening | [FAO FPMA policy entry](https://www.fao.org/giews/food-prices/food-policies/detail/en/c/1529567/) | Published 2022-05-27; retrospectively dates the ban to 28 April and conditional reopening to 23 May. The two events intentionally share a source. |
| Black Sea signing | [UN signing remarks](https://www.un.org/sg/en/content/sg/statements/2022-07-22/secretary-generals-remarks-signing-of-black-sea-grain-initiative) | Dated 2022-07-22; describes a framework through three ports, not current route availability. |
| Black Sea termination | [UN press encounter](https://www.un.org/sg/en/content/sg/statement/2023-07-17/secretary-generals-press-encounter-the-black-sea-initiative) | Dated 2023-07-17; describes Russia's termination decision and withdrawal of security guarantees. No unsupported attribution of a measured price effect copied. |
| Philippines tariff announcement | [Presidential Communications Office](https://pco.gov.ph/news_releases/pbbm-orders-modification-of-tariff-rates-on-various-products/) | Official article published Friday 2024-06-21 says the order was issued Thursday (20 June). Rice tariff change was 35% to 15%. Effective date left unset; current tariff not asserted. Direct fetch returned 403 during review, but the official article's indexed full text and official archive were accessible through search. |
| Red Sea disruption assessment | [UNCTAD shipping assessment](https://unctad.org/news/unprecedented-shipping-disruptions-raise-risk-global-trade-unctad-warns) | Published 2024-02-22. This is the assessment date; the record does not date the start of attacks or claim today's route status. |

## UI and filtering

`PolicyEvents({lang})` renders the existing `s3` anchor, localized controls and
search feedback, result cards, provenance and a clear non-live disclosure. Search
normalizes case, whitespace and Unicode width; all search terms and selected
country/type/commodity filters must match. Both languages are searchable
regardless of UI language. Results are sorted by event date, newest first, without
mutating the source. Clear filters restores the entire registry.
