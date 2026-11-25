# India Land Search

India Land Search is a free browser workspace for finding and reviewing land records.
Start with a village, plot, or khata. Compare names across scripts, highlight parcels,
and assemble a map and Record of Rights (RoR) packet you can keep or share.

[Open India Land Search on GitHub Pages](https://suryanjena.github.io/india-land-search/).

## Work with official Odisha records

Choose **State portals → Odisha maps and RoR lookup**. View a BhuNaksha sheet
and open the official Plot Info for an exact plot. Load both Bhulekh report
pages for a known khata and save them as one PDF. Use ORSAC Know Your Land to
inspect village boundaries and geographic context.

The Pages app needs no sign-in or search server. Fresh lookups use the official
sources where the browser can read them. Saved workspaces and name searches stay
in your browser. [Odisha source interfaces and coverage](docs/ODISHA-OFFICIAL-INTERFACES.md)

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
the geographic view. Workspace searches use your imported records. The Odisha source tools can also show fresh records by exact location and identifier.

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

Odia spelling review uses 83,664 offline English-to-Odia pairs from the public-domain portion of AI4Bharat Aksharantar. [Spelling data and attribution](docs/DATA-SOURCES.md#odia-spellings)

Name suggestions also use curated rules and [Sanscript](https://github.com/indic-transliteration/sanscript.js)
v1.3.3 under MIT. India boundary paths are adapted from
[geoBoundaries India ADM1](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/)
under [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/).
