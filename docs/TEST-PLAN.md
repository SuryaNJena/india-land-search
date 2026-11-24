# LandReview test plan

## Run the suites

Use Node.js 24 from the repository root.

```sh
node --test
node verify.mjs
node build.mjs
```

For the optional import and export parity check, run `node verify.mjs <path-to-Odisha-workspace.zip>` against the separately stored local workspace. The default tests use synthetic or saved public geometry fixtures and make no government portal requests.

## Automated baseline

Characterization tests capture behavior in the current release so changes can be deliberate. Unit tests cover focused logic. The default suite does not certify the future launch scope.

| Tests | Behavior verified | Requirements |
| --- | --- | --- |
| `UT-01`–`UT-02` | Unicode normalization, whole-token matching, and separate surname and full-name flags | BR-03, TR-03 |
| `UT-03` | Source-label evidence and optional local filtering | BR-07, TR-07 |
| `UT-04` | Alternate name orders and multiword middle names | BR-03, TR-03 |
| `UT-05`–`UT-08` | Scoped coverage, jurisdiction attribution, parcel identity, and validated RoR links | BR-04, BR-06, BR-07, TR-03, TR-04, TR-06, TR-07 |
| `CT-01`–`CT-03` | Current sign-in and village rules, matched fields and links, cached source reuse, and unavailable versus zero results | BR-04, BR-06, TR-04, TR-06 |
| `CT-04` | Dated fallback maps stay within the requested village and sheet | BR-05, TR-05 |
| `CT-05`–`CT-07` | Workspace v1 preservation, checksum rejection, and local front-before-back merge | BR-07, TR-07 |
| `CT-08` | The current Bhulekh connector cancels a throttled lookup and suppresses another upstream call during its local cooldown | BR-06, TR-08 |

Keep `CT-01` as the characterization of the signed-in village connector. When anonymous statewide search ships, give its public route its own acceptance test.

## Challenge release acceptance

`tests/demo.test.mjs` checks village-scoped synthetic matching, duplicate khatas, missing and single-sided documents, and map page count. The Actions browser smoke checks location autofill, spelling review, search, and downloaded PDFs under the portable release subpath. It fails on browser errors or outbound traffic. The expected files are one colored map page and four RoR pages for two fictional khatas.

## Pending production acceptance

| ID | Scenario and expected outcome | Requirement |
| --- | --- | --- |
| AT-01 | In a clean signed-out browser, enter a name and select Odisha with no locality. Receive results from a verified statewide index without uploading a file or being redirected to sign in. | BR-01, BR-02 |
| AT-02 | Seed records across multiple districts and simulate a missing or stale district. Report the coverage accurately. An incomplete search must not display a statewide no-match outcome. | BR-02, BR-06 |
| AT-03 | Type a three-part name, review a local-script reversed order, and search. Unchecked suggestions are excluded. Select all and Clear all include and exclude the expected variants. | BR-03 |
| AT-04 | Search a common name with holdings in different villages. Each result shows the approved public fields and the correct plots and official links. An unresolved plot or khata is flagged. | BR-04 |
| AT-05 | Open a matched village map and change sheets. Show a source date for a saved map and an official link if geometry is unavailable. | BR-05 |
| AT-06 | Select two distinct khatas and duplicate a multi-plot selection. Produce one PDF that includes each khata once, with its entire front followed by its entire back. | BR-05 |
| AT-07 | A selected khata has a missing or unmergeable page. Identify the affected khata. Do not present a partial artifact as the complete selected set. | BR-05, BR-06 |
| AT-08 | Repeat public searches under expected peak load. Measure response time, concurrency, debounce/rate-limit behavior, and upstream request volume against agreed targets. | BR-01, BR-06 |
| AT-09 | Simulate a throttled or temporarily unavailable portal with `Retry-After` in seconds and HTTP-date formats. Confirm all acquisition jobs for that portal honor the wait, keep their checkpoints, and resume without duplicating finished villages. Verify an access denial stops acquisition for review. | BR-02, BR-06, TR-08 |
| AT-10 | In a fresh browser, search a village with no person's name or location filters. Verify local-script and known Latin spellings, disambiguate same-name villages, and confirm that selection fills only verified filters. Confirm no land-record portal requests occur during discovery. | BR-08, TR-09 |

## GitHub Pages smoke check

Serve the static build at a repository subpath. Verify that assets load, village lookup and local workspace import work, and official portal links are visible. With no search API configured, confirm that village lookup sends no requests to Site Worker routes. If live search is enabled, verify the Pages origin and run the signed-out search flow against the configured API.
