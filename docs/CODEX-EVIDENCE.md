# LandReview Codex evidence pack

**Scope** Public submission draft. This file records the current evidence and separates it from future launch requirements. Review it before publishing.

| Checkpoint | Evidence |
| --- | --- |
| CP1 Explain | The stakeholder interview established anonymous access, statewide Odisha name-only lookup, public result fields, and one combined RoR PDF for every selected khata. See the [BRD](BRD.md). |
| CP2 Diagram | The [TRD](TRD.md) shows the proposed statewide architecture and documents the shipped village-based Worker. The statewide data source is still a launch dependency. |
| CP3 Test | `node --test` exercises 8 focused unit tests, 8 characterization tests, and release tests for village discovery and the SQLite index. `verify.mjs` covers the broader offline build and data workflows. The [test plan](TEST-PLAN.md) links these checks to the requirements and records pending launch acceptance. The [TRD](TRD.md) records the bounded public-portal source check. |
| CP4 Fix | The live-search button now accepts reviewed spelling checkboxes and opens the village picker when a location is missing. The published map viewer reports source availability and dates saved geometry. Browser QA confirmed the search flow with a sample and later displayed the saved Anda sheet 01 on the published Site. |
| CP5 Pull request | The local Site repository has deployment commit history. The public GitHub repository is [SuryaNJena/india-land-search](https://github.com/SuryaNJena/india-land-search). The release branch keeps the original deployment history and adds individually labelled checkpoint commits. |

## Release verification

The GitHub Pages build was tested in the browser under a repository-style subpath. Searching for `ଭରତପଡ଼ା` with the person field empty filled Odisha, Cuttack, Mahanga, Kurujanga, and Bharatpada from the verified directory entry. The anonymous index route is exercised with synthetic holdings. Production statewide coverage and live map and RoR validation still depend on a verified deployed source.

## Capabilities and models

Codex used the shared workspace and shell for repository inspection, implementation, builds, and tests. The Sites connector packaged, published, and checked the Site. Computer Use verified selected browser workflows. Official documentation and scoped source checks informed the portal integration.

This documentation and test pass used Codex on the GPT-6 model family. The exact assistant model variant and historical model identifiers are unverified. The running application's name suggestions use deterministic rules, curated spellings, and Sanscript.

## Reproduction and publication

1. Follow the [contributor guide](../AGENTS.md) to run the offline suite and build. Use the separately stored, authorized workspace only for the optional parity check.
2. The [published Site](https://landreview-odisha.thinwave16.chatgpt.site) is linked to the Sites source history. The baseline release used `08bdc8a`. Its signed-in Odisha village search does not meet the anonymous statewide launch requirements.
3. Include synthetic screenshots, test output, and source and deployment references in the public submission. Keep private workspaces, credentials, and personal search results out of the evidence pack.
