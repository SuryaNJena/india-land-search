# Deploy India Land Search

## GitHub Pages

Use GitHub Actions as the repository's Pages source. Merge changes through a PR.
The **Publish India Land Search on GitHub Pages** workflow builds and deploys
relevant changes from `main`. Use **Run workflow** to republish manually.

The build publishes `pages-out/` with the app, vendored JavaScript, the village
catalogue, and dated public cadastral geometry. The browser connects only to
its own origin for app resources. Official record links open on demand. A
backend service, account, API origin, map tiles, and a database are unnecessary.

## Browser data

Records, saved PDF copies, and name rules are stored in the current browser.
Choose **Back up workspace** on the previous installation. Then open
[GitHub Pages](https://suryanjena.github.io/india-land-search/), choose **Import records**,
and select the ZIP. Data stored under another site address must be transferred
this way.

Search coverage comes from the loaded records. Geometry from the bundled
BhuNaksha snapshots is available for selected Odisha sheets. Imports can supply
other sheets and saved Plot Info. To obtain a fresh RoR, open its official link
or find it through **State portals**, then import the records or add the PDFs.

## Local preview and portable release

Run `node build-pages.mjs` and serve `pages-out/` over HTTP. Run
`node scripts/smoke-pages.mjs` to test the repository subpath. Set
`LANDREVIEW_PLAYWRIGHT` to Playwright's absolute `index.mjs` path and run
`node scripts/smoke-browser.mjs` for browser verification.
`LANDREVIEW_SMOKE_EVIDENCE` saves screenshots and downloaded PDFs.

Run `node scripts/package-release.mjs <output.zip>` to package the build.
Extract the ZIP and run `node serve.mjs` with Node.js 24 for a local demo.

## Historical hosting

The previous Sites Worker, database schema, and verification fixtures are kept
in the repository for project history. The Pages release does not package them.
See [the migration decision](GITHUB-PAGES-MIGRATION.md).
