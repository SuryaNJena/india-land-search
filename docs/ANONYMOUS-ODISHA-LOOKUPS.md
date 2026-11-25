# Anonymous Odisha lookups

## CP1 Explain

The ChatGPT Site home page is public. The app adds an identity check to a live
village search, location selection, map details, and the RoR plot schedule.
This change removes that check so signed-out visitors can use the same official
Odisha lookup workflow.

Keep explicit village and parcel validation, same-origin requests, existing
portal throttles, exact parcel verification, and the indexed check for full
RoR export. The statewide search still depends on coverage in the index.

## CP2 Diagram

```mermaid
flowchart LR
  A["Visitor selects a village or parcel"] --> B["Validate request and scope"]
  B --> C["Check app rate limit and upstream cooldown"]
  C --> D["Use cached data or read the official portal"]
  D --> E["Return locations, name matches, geometry, Plot Info, or plot numbers"]
  C --> F["Show retry status if the portal is busy"]
  B --> G["For full RoR export, verify the indexed khata"]
  G --> C
```
