# Interactive Odisha plot map

## CP1 Explain

People can select a parcel today, but the live sheet only outlines it and displays
its number. The official BhuNaksha interface also shows Plot Info and RoR links.

- Zoom and pan the sheet, fit it again, and display readable plot numbers when
  zoomed in. Support looking up an exact plot number, including subdivisions.
- Fill the selected parcel and show its official Plot Info and RoR links when
  BhuNaksha returns them. Keep the selection visible when details are unavailable.
- Apply exact plot-number highlights from matched land records. Compare the Plot
  Info opened in the viewer with the approved search spellings as additional
  evidence. Keep the distinction between selected and matched parcels visible.
- Load parcel details on demand. Use existing official RoR schedules to resolve a
  small set of matching khatas when opening a scoped search map.

## CP2 Diagram

```mermaid
flowchart TD
    A["Open the sheet after a name search"] --> B["Draw cadastral parcels"]
    A --> C["Load matched plot numbers from index or selected RoR khatas"]
    C --> D["Colour exact plot matches on the sheet"]
    B --> E["Zoom, pan, or select a plot number"]
    E --> F["Request Plot Info for the selected parcel"]
    F --> G["Verify village sheet, parcel ID and plot number"]
    G --> H["Display source text and official RoR links"]
    G --> I["Compare source text with approved search spellings"]
    I --> D
```

The browser supplies a parcel ID and plot number. The Worker constructs the GIS
code, contacts the district's official server, and checks all three fields on the
response. The canvas and PDF share the same confirmed match set.
