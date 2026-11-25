# Deploy India Land Search

## GitHub Pages

Use GitHub Actions as the repository's Pages source. Merge changes through a PR.
The **Publish India Land Search on GitHub Pages** workflow builds and deploys
relevant changes from `main`. Use **Run workflow** to republish manually.

The build publishes `pages-out/` with the installable app, vendored JavaScript, the village catalogue, and dated public cadastral geometry. The content security policy permits app resources from the same origin, direct RoR previews from Bhulekh, official BhuNaksha forms and images, and OpenStreetMap tiles when enabled.

## Browser data

Records, saved PDF copies, and name rules are stored in the current browser.
Choose **Back up workspace** on the previous installation. Then open
[GitHub Pages](https://suryanjena.github.io/india-land-search/), choose **Import records**,
and select the ZIP. Data stored under another site address must be transferred
this way.

Search coverage comes from the loaded records. Geometry from the bundled
BhuNaksha snapshots is available for selected Odisha sheets. Imports can supply
other sheets and saved Plot Info. Look up known Odisha khatas directly or follow **State portals** for records from other locations. Successful standalone lookups can also be reviewed in **Workspace**.

## Local preview and portable release

Run `node build-pages.mjs` and serve `pages-out/` over HTTP. Run
`node scripts/smoke-pages.mjs` to test the repository subpath. Set
`LANDREVIEW_PLAYWRIGHT` to Playwright's absolute `index.mjs` path and run
`node scripts/smoke-browser.mjs` for browser verification.
`LANDREVIEW_SMOKE_EVIDENCE` saves screenshots and downloaded PDFs.

Run `node scripts/package-release.mjs <output.zip>` to package the build.
Extract the ZIP and run `node serve.mjs` with Node.js 24 for a local demo.

## Separate hosted edition

The separate hosted build uses the Sites Worker and database schema for signed-out or verified indexed lookups. Build it with `node build.mjs`. See [the migration decision](GITHUB-PAGES-MIGRATION.md) and [browser support and source checks](STANDALONE-ODISHA-LOOKUPS.md).
