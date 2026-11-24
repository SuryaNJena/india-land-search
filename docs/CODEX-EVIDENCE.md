# LandReview Codex evidence pack

## Problem

An Odisha family may know a name in English or Odia and only part of the location. Bhulekh's documented path asks for district, tahasil, and village before tenant lookup. LandReview can start with one village name and a jurisdiction-qualified match. The local workspace keeps spellings, colored map evidence, and front/back documents together. This comparison describes the steps and information each workflow requires. [Bhulekh manual](https://bhulekh.ori.nic.in/Bhulekh%20Portal%20User%20Manual.pdf)

## Lifecycle evidence

These eight headings are a working mapping from Understand to Automate. Confirm the organizer's exact labels in the attendee handout. The original CP1–CP5 history remains visible in [PR #1](https://github.com/SuryaNJena/india-land-search/pull/1).

| Stage | Decision, artifact, and verified result |
| --- | --- |
| Understand | Chose language-aware matching, search from partial localities, and a combined evidence packet. Stakeholder answers established signed-out access, official result fields, and a separate statewide ownership requirement. [BRD](BRD.md) · CP1 `43bb7c4` |
| Plan and design | Separated public place data and source links from the versioned ownership index. Planned distinct stale, partial, and unavailable states. [Architecture](TRD.md) · CP2 `6a99dff` |
| Build | Built place discovery and scope autofill, the D1-backed search route, both hosting builds, and a two-khata fictional demo. [Deployment](DEPLOYMENT.md) · CP4 `a68ea4c` |
| Test | Pinned matching, throttling, checksum rejection, and front-before-back export before extending the app. The new tests cover duplicate and incomplete khatas and vector map export. [Test plan](TEST-PLAN.md) · CP3 `19a7d89` |
| Debug | Browser testing exposed a secondary live-search control on the static page and confirmed the fix. The first hosted browser job hit an unsupported Ubuntu 26.04 image, so the workflow now pins the supported Ubuntu 24.04 image. A separate check showed an Odia Bharatpada alias filling all verified locality fields while the person field was blank. [PR evidence](https://github.com/SuryaNJena/india-land-search/pull/1) |
| Review | An independent Codex review flagged the license-only default branch, missing sample PDFs, and incomplete model log. The release adds synthetic RoRs and a verified metadata table. [Release checklist](RELEASE-CHECKLIST.md) |
| Deploy | Site baseline `08bdc8a` served signed-in village lookup. The portable challenge build provides a signed-out demo with a runnable ZIP. [Baseline Site](https://landreview-odisha.thinwave16.chatgpt.site) · [GitHub Releases](https://github.com/SuryaNJena/india-land-search/releases) |
| Automate | Actions checks builds, packages the release, and exercises the demo under a subpath with browser screenshots and PDF downloads. A weekly offline schedule is configured. Separately, the one-village pilot checkpointed 2,549 entries and skipped that village on rerun. [CI](https://github.com/SuryaNJena/india-land-search/actions/workflows/quality.yml) · [Pilot record](https://github.com/SuryaNJena/india-land-search/commit/b98e6c57718b3fbf0f4283d1f953669d8bf8306d) |

## Capability use

- **Codex workspace and shell** established baseline tests and reproduced the build, sample map, and PDFs.
- **Computer Use** verified village-name input, district and tehsil autofill, and that the person field stayed empty. A browser smoke test now also exercises fictional search, map and PDF exports with no external requests.
- **GitHub and Sites tools** preserved commit history, opened the review, and identified exactly which commit the existing live Site serves.
- **Subagents and web research** independently reviewed the submission, verified data-source limits, and built portable packaging and automated smoke. The research distinguishes administrative names, land geometry, and records governed by the source owner. [Data sources](DATA-SOURCES.md)

## Models and reasoning effort

These settings were verified in Codex turn metadata. Explanations of task fit are retrospective where the original choice was undocumented.

| Work | Model | Effort | Task fit and proof |
| --- | --- | --- | --- |
| Bounded Odisha plot, map, and PDF exploration, 1–2 November | `gpt-6-astra` | Medium | Focused source and rendering work. Later verification used official links and a bounded connector check. |
| Requirements, characterization, architecture, and PR, 22–24 November | `gpt-6.2-sol` | High | Cross-file design and implementation with a tested baseline. See CP1–CP5 and linked CI. |
| Challenge release, independent evidence audit, build automation, and source research, 24 November | `gpt-6.2-sol` | Ultra | Cross-cutting acceptance with parallel evidence, source, and packaging work. The evidence subagent inherited the setting. |

Other historical settings remain unverified. Name suggestions in the running application use curated rules and Sanscript. The submitted artifacts contain fictional records and sanitized evidence.
