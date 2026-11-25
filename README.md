# India Land Search

Search names in land records, review English and local-script variants, inspect
cadastral parcels, and assemble Excel, map, and Record of Rights (RoR) exports.
[Open India Land Search on GitHub Pages](https://suryanjena.github.io/india-land-search/).

## Search and review your records

1. Import a LandReview workspace ZIP, compatible JSON, or an Excel workbook with
   a **Plots** tab. Existing v1 backups are supported.
2. On **Home**, choose a state, enter names and review spelling suggestions.
   Leave location blank to search all loaded records for that state.
3. Choose **Show matches on map** where parcel shapes are available. Click a
   parcel or enter its exact number to inspect the saved Plot Info and RoR links.
4. Use **Village maps** for matched sheet PDFs, **Plot records** for Excel, and
   **Records of Rights** to combine saved PDFs from selected khatas.

The Odisha village directory and dated geometry for selected sheets are bundled.
A geometry snapshot joins by exact sheet, parcel ID, and plot number. A
compatible workspace may supply its own parcel geometry or WGS84 GeoJSON for
the geographic view. Plot details and ownership searches use your imported
records. Use the official portal directory to obtain current records.

The app runs in the browser on GitHub Pages. Searches, imported records and PDFs
stay local. A [fictional demo](https://suryanjena.github.io/india-land-search/?demo=1)
has sample plots, a map, and two RoRs ready to export.

## Hosted edition

The separate hosted edition retains signed-out Bhulekh village lookup and BhuNaksha maps. The GitHub Pages build uses local records, snapshots and official portal links. [Data sources](docs/DATA-SOURCES.md)

## Move an existing workspace

On your previous installation, choose **Back up workspace** to download a ZIP.
Open GitHub Pages and choose **Import records** to restore it. Browser storage
is tied to the site address, so repeat this on each device that has a workspace
you want to keep.

## Develop and verify

Use Node.js 24 from the repository root.

```sh
node --test
node verify.mjs
node build-pages.mjs
node scripts/smoke-pages.mjs
```

See the [deployment guide](docs/DEPLOYMENT.md), [contributor guide](AGENTS.md),
and [Codex evidence pack](docs/CODEX-EVIDENCE.md).

## Attribution

Name suggestions use curated rules and [Sanscript](https://github.com/indic-transliteration/sanscript.js)
v1.3.3 under MIT. India boundary paths are adapted from
[geoBoundaries India ADM1](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/)
under [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/).
