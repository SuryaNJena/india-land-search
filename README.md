# India Land Search

Find an Odisha village, review English and Odia name variants, inspect matched plots, and assemble a map and Record of Rights (RoR) packet. India Land Search also reviews records you already have and links to official portals across India.

## Try the challenge demo

1. Download `LandReview-portable.zip` from the [latest release](https://github.com/SuryaNJena/india-land-search/releases/latest) and extract it.
2. Run `node serve.mjs` from the extracted folder using Node.js 24. Open the printed demo URL in a browser.
3. Click **Find sample village**, choose **Anandapur Sample**, and select **Review name variants**. Approve spellings or use **Clear all**, then choose **Search loaded records**.
4. Open the matched map and export its overview. In **Records of Rights**, choose **Download selected RoRs (PDF)** to download both sides of two fictional khatas in one file.

The demo uses fictional records and runs without an account, uploads, or government portal requests. The regular app includes a public Odisha village directory and official links for map-point and plot-ID lookups. Verified RI and land-record portal codes cover selected villages. Live Odisha village searches on the hosted site work without a ChatGPT account. Statewide name search needs verified production data. [Data-source research](docs/DATA-SOURCES.md)

## Use the app without an imported workspace

Open **Village maps**, **Plot records**, or **Records of Rights** and choose an Odisha locality. **Name matching** can also review spellings and search plot text already saved in this browser. Successful standalone lookups appear in **Workspace**, where you can reopen them and remove selected items. Your browser can install the app and reopen its interface offline.

GitHub Pages loads BhuNaksha sheet images from the official WMS and opens the official Plot Info response when the source blocks browser reads. Add its saved JSON to use the content in the app. Bhulekh’s report pages can be read directly with a known khata. In Home, **Pick a location on the map** includes labelled Odisha village boundaries that can be viewed over OpenStreetMap. [Browser support and source checks](docs/STANDALONE-ODISHA-LOOKUPS.md)

## Odisha cadastral maps

After a live Bhulekh search, open **BhuNaksha village map**, select the matched khatas, and choose **Highlight plots from Bhulekh RoR**. Download the current vector sheet or the village PDF containing only sheets with matched plots. The app uses BhuNaksha’s sheet directory and parcel geometry and joins the official back schedule by exact plot number. A dated geometry-only fallback covers Kapaleswar sheets 01–03 if the map host is unavailable.

The **Geographic map and location pins** panel accepts a manual or device location. OpenStreetMap tiles load only when enabled. For a parcel overlay, add WGS84 GeoJSON with the current sheet's `giscode` and matching parcel `id` or plot `kide`. Coordinates remain in the browser unless you enable map tiles or open a provider link. BhuNaksha returned no usable WGS84 extent for Kapaleswar sheets 01–03. Keep its cadastral PDF in local sheet coordinates or consult [ORSAC’s georeferenced viewer](https://www.odishakyl.in/mapview.php).

## Develop and verify

Use Node.js 24 from the repository root.

```sh
node --test
node verify.mjs
node build.mjs
node build-pages.mjs
node scripts/smoke-pages.mjs
```

The static build works under a repository subpath. See the [deployment guide](docs/DEPLOYMENT.md), [contributor guide](AGENTS.md), [release checklist](docs/RELEASE-CHECKLIST.md), and [Codex evidence pack](docs/CODEX-EVIDENCE.md).

## Records and attribution

Imported India Land Search ZIP, compatible JSON, and Excel workspaces stay in the browser. Workspaces back up to a checksum-validated ZIP. Retain original signed documents and verify records using the official source.

Odia spelling review uses an offline dictionary of 83,664 English-to-Odia pairs drawn from AI4Bharat Aksharantar’s public-domain sources. The app looks up entries locally and marks spelling evidence separately from occurrences in loaded plot text. [Spelling data and attribution](docs/DATA-SOURCES.md#odia-spellings)

Name suggestions also use curated rules and [Sanscript](https://github.com/indic-transliteration/sanscript.js) v1.3.3 under MIT. The reference India map uses simplified [geoBoundaries India ADM1](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/) paths sourced from DataMeet India and the Election Commission of India under [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/).
