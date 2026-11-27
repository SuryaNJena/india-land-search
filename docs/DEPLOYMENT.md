# Deploy India Land Search

## GitHub Pages

GitHub Pages is the primary public app. Set the Pages publishing source to
GitHub Actions. The Pages workflow publishes app changes merged into main
and also supports manual runs. It serves the installable browser app from
the repository subpath.

The build uses the HTTPS relay origin in `LANDREVIEW_API_BASE` for live Odisha
queries. See the relay in the [developer guide](DEVELOPER-GUIDE.md#runtime-and-data-boundaries).
Direct official RoR previews, BhuNaksha imagery, and visible OpenStreetMap tiles
use their own origin. Confirm Pages loads the assets and that a signed-out
lookup works for a known village after a source or API change.

## ChatGPT Sites

Build the Worker with `node build.mjs`. Publish the reviewed source as a version
of the existing Site and verify its public URL. The Worker serves the same
browser interface and a same-origin Odisha adapter. Statewide live ownership
search requires a populated, verified dataset. See the [data coverage](DATA-SOURCES.md).

## OCI relay

The Pages relay runs as a Node 24 container behind Caddy. Keep the public Pages
origin on the relay's allowlist. The locality index volume stores official
directory menus. The health route is `GET /healthz`. Deploy only the reviewed
revision, keep the previous image and service configuration available, and
recheck the known-locality request if you roll back.
[OCI configuration and commands](https://github.com/SuryaNJena/india-land-search/tree/main/backend/deploy/oci)

## Portable downloads

Build the offline app with no `LANDREVIEW_API_BASE`. Tag releases through GitHub
and use the archive produced by the tag workflow. The workflow verifies the
extracted ZIP and attaches it to the corresponding GitHub release. The ZIP
contains the guides, sample records, and local server after the documentation update.
See [local build commands](DEVELOPER-GUIDE.md#build-run-and-verify).

## Browser data during a migration

Use **Back up workspace** on the old site and **Import records** on the new
one to move an imported workspace. Saved standalone lookups and name lists
belong to the browser origin where they were created. Export any documents
you want to retain independently. [User manual](USER-MANUAL.md#manage-records-on-this-browser)
