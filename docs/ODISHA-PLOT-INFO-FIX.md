# Odisha Plot Info retrieval

## CP1 Explain

The hosted map showed a generic Plot Info error for plot 1228. For the matching
Kapaleswar parcel on sheet 01, the district's assigned server returned verified
details from both its REST route and the lookup used by the official map viewer.
The same routes on standard HTTPS returned empty responses during the probe.

The details panel should try the viewer lookup when REST supplies no usable
record, keep exact parcel validation, and offer the district's official viewer
when both lookups fail. The host-side cause of the original failure is unverified.

## CP2 Diagram

```mermaid
flowchart TD
  A["Select a parcel"] --> B["Request Plot Info from the district's REST route"]
  B -->|"No usable response"| C["Try the official viewer's exact-number lookup"]
  C -->|"No usable response"| G["Try the existing standard HTTPS REST route"]
  B -->|"Record"| D["Verify sheet, parcel ID, and exact plot number"]
  C -->|"Record"| D
  G -->|"Record"| D
  D -->|"Verified"| E["Show text, area, and validated RoR links"]
  D -->|"Mismatch"| F["Show the official viewer link"]
  G -->|"Still unavailable"| F
  B -->|"Portal asks us to wait"| F
  C -->|"Portal asks us to wait"| F
```
