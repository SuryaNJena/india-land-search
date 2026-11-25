# Standalone GitHub Pages release

## CP1 Explain

GitHub Pages is the production host. The app must run without a ChatGPT account,
a Site Worker, D1, an external map service, or a configurable API origin.
Users can search imported ownership records, locate Odisha villages, inspect and
highlight map parcels, and assemble PDFs inside the browser.

Ownership search covers the loaded records. GitHub Pages provides static files,
so obtaining fresh government records and installing a verified statewide
dataset are separate from running the app. The site may show official links
for deliberate navigation. Personal records and saved RoRs stay in IndexedDB
and user-owned workspace ZIPs.

## CP2 Diagram

```mermaid
flowchart LR
  A["GitHub Pages"] --> B["Browser app and public data"]
  C["User workspace ZIP, JSON, Excel or RoR PDF"] --> D["Browser memory and IndexedDB"]
  B --> E["Search names and inspect parcel sheets"]
  D --> E
  E --> F["Download map PDFs, spreadsheets, and RoR bundles"]
  D --> G["Download workspace ZIP"]
```

Existing v1 workspace ZIPs retain geometry, name rules, and RoR documents when
moved between origins. Geography supplied through an uploaded WGS84 file is
drawn locally. The Pages build excludes legacy hosted modules and refuses
cross-origin network resources through a browser content security policy.
