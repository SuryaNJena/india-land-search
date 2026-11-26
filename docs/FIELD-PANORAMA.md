# Field Panorama

## CP1 · Explain

Families should be able to select a village once, recognise it on a map, and use that selection for name, map, plot and RoR searches. A plot's own name evidence and a related khata carry different meanings. Each must remain identifiable during scanning and export.

## CP2 · Diagram

    Home / Village Maps → shared village selection → official locality resolver
                                            ↓
    Name / reviewed variants → sheet inventory → individual Plot Info
                                                 ├─ direct text match → solid fill
                                                 └─ khata schedule → outline until verified
    Plot records / Records of Rights ← same selected village identifiers

The public host serves location discovery independently of personal searches. The tour uses fictional records in an isolated browser context. Site publication and Pages share the tracked frontend.


## CP3 and CP4 · Verification and release

Use the local Chromium smoke to exercise the modal tour, all seven mobile destinations, the family-search steps, and shared selections across Home, Maps, Plot Records, and RoR. The sheet fixture checks that all four numbered parcels receive their own request, including the two referenced by a khata. Browser evidence is available in the verification workflow artifact.

Location selectors on OCI use a bounded-age SQLite index in the named Docker volume. Entries refresh on first use after 30 days. Only official directory labels and identifiers go to disk. The parcel reader coalesces requests for the same parcel and keeps up to 256 responses in memory for five minutes. The packaged LGD and Survey of India snapshots retain their source dates; refreshing a portal menu does not update those upstream releases.
