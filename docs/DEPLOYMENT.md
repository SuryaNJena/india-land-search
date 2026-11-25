# India Land Search deployment

## Portable challenge release

Download `LandReview-portable.zip` from [GitHub Releases](https://github.com/SuryaNJena/india-land-search/releases), extract it, and run `node serve.mjs` with Node.js 24. The server prints a loopback URL to the signed-out demo. To rebuild, run `node build-pages.mjs` followed by `node scripts/package-release.mjs <output.zip>`. Push a new version tag to run verification and attach the archive. The weekly smoke workflow uses fictional records and performs no government portal requests.

Run `node scripts/smoke-pages.mjs` against `pages-out/` or an extracted release's `site` directory. For the full browser check, provide `LANDREVIEW_PLAYWRIGHT` as the absolute path to Playwright's `index.mjs`, install its Chromium browser, and run `node scripts/smoke-browser.mjs`. Set `LANDREVIEW_SMOKE_EVIDENCE` to collect screenshots and downloaded PDFs.

## GitHub Pages

1. Merge the release in GitHub. In the repository's Pages settings, select GitHub Actions as the source.
2. Run **Publish optional GitHub Pages build** from Actions.
3. The static build supports the Odisha village directory, name review, local workspaces, and official portal links. Preview locally with `node build-pages.mjs` and `python -m http.server 8000 --directory pages-out`.
4. The repository workflow publishes the static build after relevant changes merge to main. It also supports manual publication. It builds without an index origin. An optional local build can still specify `LANDREVIEW_INDEX_ORIGIN` and a matching Worker Pages origin when testing a separately authorized index.

## ChatGPT Sites or a standalone Worker

Run `node build.mjs`. The build entry point is `dist/server/index.js`, with D1 bound as `DB`. Apply the SQL in `drizzle/` through Sites migration packaging or the database migration tooling for a standalone Worker. Load a verified production index before enabling public statewide search. For a standalone Worker, configure D1 through the hosting account, keep the binding name `DB`, and point the Worker entry at the built file.

For operators with direct D1 administration, `node scripts/prepare-index.mjs <coverage.json> <holdings.ndjson> <index.sql>` validates a source export and generates a staged import. Use a private, access-controlled location for the input and SQL.

The coverage manifest supplies `version`, `source`, `captured` (YYYY-MM-DD), `catalogue` (verified Bhulekh village IDs for the intended geography), and `villages` (successfully covered places with `code`, `district`, `tehsil`, `village`, and optionally `ri`). A holding line supplies `village` as a verified Bhulekh code, `tenant`, `khata` as a string, and optionally `plots` as exact plot-number strings. Provide the name field rather than a full RoR narrative. The final SQL statement switches active versions. Use a fresh version ID on every import and measure storage before keeping multiple versions. Verify import and query behavior in a staging D1 database. The bundled SQL is exercised against SQLite in the release suite.

The offline village directory is based on the 23 November 2026 LGD snapshot. `scripts/build-villages.py` regenerates the Odisha catalogue from the matching Parquet file and provenance manifest. The data identifies places, districts, and tehsils. Verified RI and land-portal identifiers cover selected villages. [Official LGD catalogue](https://data.gov.in/catalog/local-government-directory-lgd) · [Source snapshot mirror](https://ramseraph.github.io/opendata/lgd/)

## Launch verification

- Verify that the record source covers the official Odisha village catalogue, that the refresh cadence is acceptable, and that collection and reuse are supported.
- For permitted acquisition, use the private, sequential `scripts/collect-bhulekh.mjs` workflow with verified portal IDs and a shared output directory. Each completed village is checkpointed, rate limits persist across sequential runs, and access denial stops collection. Treat the raw tenant captures as private inputs. Verify and transform only the approved fields before indexing.
- Test a signed-out production search, plotting by village and sheet, and printing front and back for multiple selected khatas. Keep source links and coverage details in the UI.
- Keep a private data export independent of the hosting provider and confirm that the refresh writer can publish an index version and read it back before scheduling production refresh.
