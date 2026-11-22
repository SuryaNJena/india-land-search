# LandReview

Static ChatGPT Sites workspace. Files are read and processed in the browser. The published bundle includes a synthetic sample and a portal directory. Real records are imported at runtime from a LandReview ZIP, legacy JSON or an Excel workbook with a Plots tab.

The browser stores the current workspace in IndexedDB. Use **Back up workspace** to keep a portable copy. The workspace ZIP format v1 includes `manifest.json`, `workspace.json` and optional plotwise PDFs. File sizes and SHA-256 checksums are verified before a workspace replaces the current one.

Name candidates use curated variants and local phonetic rules for Odia, Hindi, Marathi, Bengali and Telugu. Other scripts accept manual input. Apply approved rules to update search, map and RoR selections. The app writes a fresh XLSX and draws vector map overviews. A fresh RoR ZIP includes imported documents and source links. The site provides official portal links for fresh records and supports manual file import.

Run `node verify.mjs` for local checks. Optionally pass the separate Odisha workspace ZIP to run the full-snapshot checks. For a local preview, serve `dist/` over loopback HTTP. Deploy with the private static Sites workflow using the project in `.openai/hosting.json`.
