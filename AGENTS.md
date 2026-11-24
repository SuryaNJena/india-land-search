# Repository Guidelines

## Project Structure

- `dist/` contains the tracked browser source. `index.html` and `style.css` define the interface. `app.mjs` coordinates the workspace, while `core.mjs`, `search.mjs`, `files.mjs`, and `maps.mjs` handle matching, search, import/export, and map rendering.
- `worker/odisha.mjs` serves the ChatGPT Site and connects to Bhulekh and BhuNaksha. `worker/odisha-map-snapshots.json` contains dated public map geometry used when live retrieval fails.
- `dist/vendor/` contains bundled libraries and their licenses. `tests/` holds the unit and characterization tests. `.openai/hosting.json` identifies the deployed Site.

## Build, Test, and Preview

Run these commands from the repository root with Node.js 24. To preview the interface, use Python 3.

- `node --test` runs the unit and characterization tests using Node's built-in test runner.
- `node verify.mjs` runs the broader offline checks with synthetic and saved fixtures.
- `node verify.mjs <path-to-Odisha-workspace.zip>` also checks record import, known match counts, and map and RoR exports against the separately stored workspace.
- `node build.mjs` bundles the browser assets and Worker into `dist/server/index.js` and smoke-tests the homepage. Edit the tracked source files and regenerate this output.
- `python -m http.server 8000 --bind 127.0.0.1 --directory dist` previews the browser interface. Live Odisha lookup requires a signed-in request to the hosted Worker.

## Coding and Testing Conventions

Use JavaScript ES modules (`.mjs`), two-space indentation, camelCase functions and variables, and kebab-case module names such as `name-review.mjs`. Follow the surrounding style. Use `git diff --check` for whitespace checks.

Use descriptive test names and keep requirement mappings in `docs/TEST-PLAN.md`. Keep default tests independent of government portals. For portal changes, test recorded or synthetic responses and document any live smoke test separately.

## Commits and Pull Requests

The Sites workflow has generated commits titled `Update Site source`. For manual commits, use a short imperative summary. In pull requests, describe the behavior change and verification, link related issues when available, and include screenshots for visible UI changes. Keep tenant data, workspace ZIPs, credentials, and generated deployment artifacts out of commits.
