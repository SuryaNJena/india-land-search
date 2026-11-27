# Changelog

## v0.1.3

- Search villages in English, Odia, Hindi, and other supported local scripts. The shared picker keeps selected villages across tools and asks you to confirm approximate matches to official cadastral directories.
- The atlas includes district reference outlines for all 36 states and union territories. Odisha and Chhattisgarh also offer district-to-village outlines. Low-zoom labels and the closer India view make regions easier to select.
- Chhattisgarh and Bihar have pilot vector cadastral maps and Plot Info. Uttar Pradesh has pilot raster cadastral maps and exact plot highlighting. Jharkhand and Rajasthan offer village suggestions and official portal links.
- Plot Records uses the Field Panorama theme and shades the selected parcel. Odisha shows holders, holding details, and plot schedules when Bhulekh returns the linked RoR.
- Odisha Village Maps opens the selected village without starting a name scan. Copy or enter names and explicitly scan the current sheet to colour matches.
- The Land revenue tab and links from Odisha plot and RoR details open e-Pauti for demand, applicable water tax, payments, and receipts.
- The sidebar wraps at narrower widths and the coordinate pin and plot lookup controls align with their inputs.
- The user manual, developer guide, and state coverage table describe the supported flows. The OCI relay can be deployed through GitHub Actions.

Odisha live name search is village-scoped. Statewide name-only search requires an authorised production dataset. The portable ZIP includes the fictional offline demo and bundled reference data.

[Release and portable ZIP](https://github.com/SuryaNJena/india-land-search/releases/tag/v0.1.3) · [State coverage](README.md#state-and-territory-coverage) · [User manual](docs/USER-MANUAL.md)

## v0.1.2

- A dedicated **Name Matching** editor saves approved spellings locally, provides an Odia keypad, and transfers names to Home.
- Home includes saved Plot Info in its search. Imported workspaces retain their own matching rules.
- The sidebar explains its destinations. The standalone demo has a prominent exit and a brand link back to Home.

[Release and portable ZIP](https://github.com/SuryaNJena/india-land-search/releases/tag/v0.1.2)

## v0.1.1

- Field Panorama updates the layout, guided tour, and name-first search.
- The shared village picker and OpenStreetMap atlas support multiple villages, geographic overlays, and reference pins.
- The paced scan checks individual Plot Info, expands matched khata schedules, and uses separate visual marks for direct and schedule matches. The progress bar supports pause and resume.
- Live Odisha village and plot lookups use the official sources through the hosted adapters. The portable archive includes the offline fictional demo.

[Release and portable ZIP](https://github.com/SuryaNJena/india-land-search/releases/tag/v0.1.1)

## v0.1.0

The first portable release includes fictional examples, local search and
imports, plot and map review, and RoR exports.

[Release and portable ZIP](https://github.com/SuryaNJena/india-land-search/releases/tag/v0.1.0)
