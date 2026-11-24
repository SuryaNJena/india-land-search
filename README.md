# LandReview

Find an Odisha village, review English and Odia name variants, inspect matched plots, and assemble a map and Record of Rights (RoR) packet. LandReview also reviews records you already have and links to official portals across India.

## Try the challenge demo

1. Download `LandReview-portable.zip` from the [latest release](https://github.com/SuryaNJena/india-land-search/releases/latest) and extract it.
2. Run `node serve.mjs` from the extracted folder using Node.js 24. Open the printed demo URL in a browser.
3. Click **Find sample village**, choose **Anandapur Sample**, and select **Review name variants**. Approve spellings or use **Clear all**, then choose **Search loaded records**.
4. Open the matched map and export its overview. In **Records of Rights**, choose **Download selected RoRs (PDF)** to download both sides of two fictional khatas in one file.

The demo uses fictional records and runs without an account, uploads, or government portal requests. The regular app includes a public Odisha village directory and official links for map-point and plot-ID lookups. Verified RI and land-record portal codes cover selected villages. Statewide live ownership search needs verified production data. [Data-source research](docs/DATA-SOURCES.md)

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

Imported LandReview ZIP, compatible JSON, and Excel workspaces stay in the browser. Workspaces back up to a checksum-validated ZIP. Retain original signed documents and verify records using the official source.

Name suggestions use curated rules and [Sanscript](https://github.com/indic-transliteration/sanscript.js) v1.3.3 under MIT. The reference India map uses simplified [geoBoundaries India ADM1](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/) paths sourced from DataMeet India and the Election Commission of India under [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/).
