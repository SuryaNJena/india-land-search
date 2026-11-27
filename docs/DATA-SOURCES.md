# Odisha data sources

India Land Search uses the Local Government Directory (LGD) for village discovery and Odisha's official portals for access to records. Administrative names, geometry, and ownership have separate coverage and access terms.

| Source | Verified contribution and use |
| --- | --- |
| [Local Government Directory](https://data.gov.in/catalog/local-government-directory-lgd) | Odisha village and jurisdiction identifiers. The packaged snapshot contains 51,801 entries, including one separately labelled Bhulekh locality. Confirmed mappings fill the RI and portal code. |
| [Bhulekh Odisha manual](https://bhulekh.ori.nic.in/Bhulekh%20Portal%20User%20Manual.pdf) | Official tenancy, khata, plot, and RoR lookup after choosing district, tahasil, and village. The Bharatapada pilot returned 2,549 tenant options. |
| [Odisha Space Applications Centre Know Your Land](https://www.odishakyl.in/) and [citizen map](https://www.odishakyl.in/mapview.php) | The service describes selecting a point to see location, plot, khata, and owner information for reference. India Land Search links to this map for people who know the property's location. |
| [Bhulekh unique plot ID lookup](https://bhulekh.ori.nic.in/SearchYourPlot.aspx) | Direct official access when someone knows a plot ID. Confirm the identifier type before attempting a ULPIN crosswalk. |
| [Survey of India boundary downloads](https://surveyofindia.gov.in/pages/village-boundary-data-base-of-entire-india) and [2025 catalogue](https://surveyofindia.gov.in/UserFiles/files/Vector%20Data%20Catalog%202025%281%29.pdf) | Lists 52,524 Odisha village polygons across 30 districts and 317 subdistricts. A candidate for point-to-village discovery after checking the reuse terms and crosswalk. |
| [NIC DigiLocker RoR integration](https://informatics.nic.in/news/1085) | Owners can retrieve their own Odisha RoR. Holder-supplied PDF copies can be reviewed locally in India Land Search. |

## Odisha village boundary reference

The public National Water Data Portal release lists its Survey of India village boundary dataset as Open. The bundled rendering extract contains 53,320 simplified shapes across 30 Odisha districts, reprojected from EPSG:7755 to WGS84. The generator keeps locality names and geometry for display. It attaches Bhulekh codes only after a verified LGD, village, tehsil, and district match. Village borders are for geographic reference. A cadastral parcel needs its own verified geographic geometry or extent. [National Water Data Portal](https://nwdp.nwic.gov.in/dataset/village-boundary) · [Survey of India catalogue](https://surveyofindia.gov.in/pages/village-boundary-data-base-of-entire-india)

## Odia spellings

The bundled spelling dictionary contains 81,198 normalized English lookup keys and 83,664 Odia spelling pairs. It comes from the Wikidata, Samanantar, and IndicCorp rows in the pinned Aksharantar Odia training and validation files. The authors release mined pairs under CC0. The generator keeps individual words, filters lower-scoring IndicCorp pairs, and caps each lookup at three spellings. The sources contain common words and named entities. Official parcel records remain the source for recorded owner spellings. [Dataset and terms](https://indicnlp.ai4bharat.org/aksharantar/) · [Research paper](https://aclanthology.org/2023.findings-emnlp.4/) · [Bundled source notice](https://github.com/SuryaNJena/india-land-search/blob/main/dist/name-dictionary-or-NOTICE.txt)

## Production acquisition

No verified public statewide ownership feed was found. The [March 2026 parliamentary reply](https://sansad.in/getFile/annex/270/AS364_nW9rgq.pdf?source=pqars) confirms Bhulekh integration with government agriculture schemes and AgriStack. The [2025 Odisha procurement](https://pc.odisha.gov.in/sites/default/files/2025-03/RFP-25026_07.03.2025_Vol-II.pdf) describes a farmer parcel verification API. The [Government Open Data License](https://data.gov.in/Godl) excludes personal information.

Ask the [Director of Land Records and Survey and DILRMP PMU](https://bhulekh.ori.nic.in/contactus.aspx) about a sanctioned query API or limited feed and the village/RI crosswalk. Confirm approved output fields, geographic coverage, freshness, corrections, reuse terms, and request budgets. A query-only partner API that returns official links could avoid the need for India Land Search to maintain a statewide copy. The [Odisha OGD suggestion form](https://odisha.data.gov.in/Suggest_Dataset) is a separate route for requesting the non-personal crosswalk.

### Draft pilot request

India Land Search is a solo, open-source prototype that helps people locate Odisha land records. Could the Department recommend a supported pilot endpoint for matching approved names to the minimal village, khata, and plot identifiers and an official RoR link? We would appreciate documentation on coverage, permitted outputs, data handling, and operating limits. A non-personal village/RI-to-LGD crosswalk would also improve map and village discovery.

## Odisha district navigation and payments

Clickable district outlines use the Odisha extract of the [geoBoundaries India
ADM2 dataset](https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/),
attributed to Pathways Data and LGD under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The derived database is `dist/odisha-district-polygons.json` and is distributed
under that license. Use `scripts/build-odisha-districts.py` with the simplified
GeoJSON from release `1c423398df24ddf6e730b116567d2181c9782778d0459c3f3b76ca2f9f12b6bc`.
India, district, village, and parcel outlines use their respective reference
sources.

[e-Pauti](https://odishalandrevenue.nic.in/OnlineRTrent.aspx) provides the current
land revenue demand, including applicable water tax. Payment confirmation and
[receipt downloads](https://odishalandrevenue.nic.in/KnowTransactionId.aspx)
remain on the official portal.
