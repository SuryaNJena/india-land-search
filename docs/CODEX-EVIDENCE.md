# India Land Search Codex evidence pack

**Submitted build** India Land Search v0.1.3, commit `1ecd97e`. [Live app](https://suryanjena.github.io/india-land-search/) · [Release and portable ZIP](https://github.com/SuryaNJena/india-land-search/releases/tag/v0.1.3) · [Tagged CI run](https://github.com/SuryaNJena/india-land-search/actions/runs/46073636271)

## Problem and scope

An Odisha family may know a name in English or Odia and only part of the location. Bhulekh's tenant lookup starts with the district, tahasil, and village. India Land Search can start with a village name, display candidates with their jurisdictions, and help the user review spellings, find parcels, and save map and Record of Rights (RoR) evidence. Live Odisha name lookup is village-scoped. Statewide name-only lookup depends on an authorised production dataset, and live record coverage varies by state. [Bhulekh manual](https://bhulekh.ori.nic.in/Bhulekh%20Portal%20User%20Manual.pdf) · [State coverage](../README.md#state-and-territory-coverage)

## Lifecycle evidence

The headings below map the project from Understand to Automate. The organizer's exact stage labels and workshop date remain unverified. The original five-checkpoint implementation trail is in [PR #1](https://github.com/SuryaNJena/india-land-search/pull/1).

| Stage | Decision and verified outcome |
| --- | --- |
| Understand | Requirements discussions prioritized signed-out family search, local-script spelling review, and official evidence exports. The BRD records the statewide name-only goal separately from the verified village flow. [BRD](BRD.md) |
| Plan and design | Keep workspaces and exports in the browser. Use the Pages relay and Sites Worker for live queries. Share one village selection across tools, retaining exact official identifiers and asking the user to confirm approximate directory matches. [Architecture](../README.md#architecture) · [PR #23](https://github.com/SuryaNJena/india-land-search/pull/23) · [PR #24](https://github.com/SuryaNJena/india-land-search/pull/24) |
| Build | Separated the name library from Home, added state-aware atlas and village discovery, and ranked English and local-script village spellings. The release includes district reference layers for all 36 jurisdictions and six searchable village directories, with cadastral capabilities listed by state. [Name review PR](https://github.com/SuryaNJena/india-land-search/pull/17) · [State discovery PR](https://github.com/SuryaNJena/india-land-search/pull/22) · [Changelog](../CHANGELOG.md#v013) |
| Test | Characterization tests pin exact official ID matching, ambiguous choices, and Chhattisgarh and Odisha spelling variants. All 93 tests passed for v0.1.3. The signed-out Chromium smoke checked the extracted ZIP, a one-page map PDF, and a four-page combined RoR PDF for two fictional khatas. [Matching tests](../tests/state-map-location.test.mjs) · [Browser test](../scripts/smoke-browser.mjs) · [Tagged CI run](https://github.com/SuryaNJena/india-land-search/actions/runs/46073636271) |
| Debug | A reference village could be selected while its cadastral viewer still waited for manual directory choices. The verified Tangarghat crosswalk now opens its official map. PR #24 also made Odisha sheet scans explicit. Copy or enter names and start a scan when you want parcel colouring. [Crosswalk and deployment PR](https://github.com/SuryaNJena/india-land-search/pull/23) · [Scan and matching PR](https://github.com/SuryaNJena/india-land-search/pull/24) |
| Review | The first independent review flagged missing sample PDFs and incomplete model evidence. The release added fictional RoRs and verified session metadata. The v0.1.3 notes went through a separate PR after the 93-test baseline passed. [Initial review trail](https://github.com/SuryaNJena/india-land-search/pull/1) · [Release-notes PR](https://github.com/SuryaNJena/india-land-search/pull/25) |
| Deploy | Published Pages, ChatGPT Sites, and the tagged ZIP. Release smoke checks found Tangarghat using English and Hindi spellings on both hosted builds and the local preview. A separate OCI relay check returned 1,365 Tangarghat parcels with Pages CORS enabled. [Pages run](https://github.com/SuryaNJena/india-land-search/actions/runs/46073635771) · [ChatGPT Sites](https://landreview-odisha.thinwave16.chatgpt.site/) · [OCI run](https://github.com/SuryaNJena/india-land-search/actions/runs/46073636068) |
| Automate | Tagged builds test the extracted ZIP in Chromium and attach the verified archive to the release. The OCI workflow builds and checks the container, then deploys the reviewed revision through the restricted production environment. A weekly offline verification is scheduled. [Quality workflow](../.github/workflows/quality.yml) · [OCI workflow](../.github/workflows/oci.yml) |

## Where Codex changed the work

| Capability | Decision or result |
| --- | --- |
| Workspace, shell, and test runner | Turned the English and local-script matching examples into fixtures. Exact identifiers still win, and a plausible transliteration requires confirmation. [Matching tests](../tests/state-map-location.test.mjs) |
| Computer Use and browser automation | Checked whether a user could pick a village, carry it into Village Maps, and export evidence. The resulting smoke tests cover the selection and run the fictional export path on every tagged build. [Browser test](../scripts/smoke-browser.mjs) |
| Subagents and web research | Independent review identified the missing sample PDFs and model evidence gaps. Source research distinguished public place references from the data needed to support statewide ownership search. The release uses a fictional demo and describes where the live flow is available. [Initial review trail](https://github.com/SuryaNJena/india-land-search/pull/1) · [Data sources](DATA-SOURCES.md) |
| GitHub and Sites tools | Traced reviewed commits through merge, hosting, and packaging. The submitted ZIP was downloaded and checked against the release asset digest. [Tagged CI run](https://github.com/SuryaNJena/india-land-search/actions/runs/46073636271) · [Release](https://github.com/SuryaNJena/india-land-search/releases/tag/v0.1.3) |

## Models and reasoning effort

The three settings below were verified in Codex turn metadata. The task-fit explanations are retrospective where the initial choice was undocumented.

| Work | Model | Effort | Why that effort fit the work |
| --- | --- | --- | --- |
| Bounded Odisha plot, map, and PDF exploration, 1–2 November | `gpt-6-astra` | Medium | The task was limited to source checks and rendered outputs with a bounded verification path. |
| Requirements, characterization, architecture, and PR, 22–24 November | `gpt-6.2-sol` | High | The change connected business requirements, module boundaries, test fixtures, and reviewed implementation. [CP1–CP5 trail](https://github.com/SuryaNJena/india-land-search/pull/1) |
| Challenge release, independent audit, automation, and source research, 24 November | `gpt-6.2-sol` | Ultra | Acceptance required separate checks for data scope, release packaging, browser behavior, and submission evidence. The evidence subagent inherited the setting. [Quality workflow](../.github/workflows/quality.yml) |

The v0.1.3 PRs and deployment runs verify outcomes. Their later model and effort settings remain unverified. Runtime name suggestions use curated rules and Sanscript.

## Quick judge walkthrough

1. Open the [fictional demo](https://suryanjena.github.io/india-land-search/?demo=1). Choose **Find sample village**, then **Anandapur Sample** in Cuttack. The location fields fill from that selection.
2. Enter `Jena` under **Names or surnames**. Open **Review name variants**, select the spellings you want to include, and choose **Search loaded records**.
3. Choose **Open matched map** to see the coloured parcels, then **Export map PDF**. Back on **Home**, choose **Open sample RoRs** and **Download selected RoRs (PDF)** for the combined front and back pages.

The demo uses fictional records that are bundled with the release. The tagged CI run publishes `LandReview-browser-evidence` with screenshots and the sample PDFs while the artifact is retained. [Tagged CI run](https://github.com/SuryaNJena/india-land-search/actions/runs/46073636271) · [User manual](USER-MANUAL.md)
