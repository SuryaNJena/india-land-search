# LandReview business requirements

**Status** Draft for stakeholder review. Launch requirements below reflect the answers given during discovery.

## Purpose and users

LandReview helps individuals and families find Odisha land records when they know a person's name but may not know the district, tehsil, or village. Users should be able to review name variants, identify candidate records, check plot details against official sources, and save an artifact they can use for follow-up.

| Stakeholder | Need |
| --- | --- |
| Public user | Search anonymously, confirm the names being searched, and understand how much of Odisha was checked. |
| Product owner | Decide when source coverage and artifact availability support public launch. |
| Maintainer | Trace matches and exports back to source records and explain outages or incomplete coverage. |

## Launch requirements

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| BR-01 | Anonymous access | A first-time visitor can complete a live Odisha search without a ChatGPT account, prior records, or a file upload. |
| BR-02 | Statewide name-only search | With Odisha selected and all locality fields blank, a verified statewide source is searched across all 30 districts. The interface reports coverage and freshness. Incomplete or unavailable coverage is explicit and never presented as a complete zero-match result. Known locations can narrow the search. |
| BR-03 | Name review | Users can enter a surname or full name in Latin or local script. LandReview proposes local-script and alternate name orders, including last–middle–first. Users choose the suggestions to include. Select all includes reordered variants. Clear all retains typed names only. |
| BR-04 | Evidence on results | Anonymous results show the matched name, locality, khata, plot details, and official links from the source. Identical names in different localities remain distinguishable. Missing fields are marked as unavailable. |
| BR-05 | Map or combined RoR PDF | A successful live lookup supports an in-page map or a combined Record of Rights (RoR) PDF. Map views identify the village, sheet, and capture date for saved maps. When a user chooses PDF, one file contains the front and back of **every selected khata**. A multi-plot khata is included once. |
| BR-06 | Clear outcomes | Show validation guidance, progress, partial coverage, service unavailability, or no matches within checked coverage. Keep official source links visible for follow-up. |
| BR-07 | Preserve existing workspace review | Users can continue importing, classifying, and exporting their own records. Imported workspaces and the optional source-label rules remain browser-local. |
| BR-08 | Find a village by name | A visitor can enter a village name without a person's name, district, tehsil, or RI. Show matching villages with their state, district, and tehsil. Accept verified local-script names and Latin spellings where available. Selecting a result fills the corresponding filters and fills the RI when verified. Same-name villages remain separate choices. |

## Optional distribution

GitHub Pages can host village discovery, name-variant review, browser-local workspace tools, and links to official portals. Live land-record search on Pages requires a separately hosted search API. The Pages site can be published once the public repository is ready. It does not change Odisha's statewide name-only launch requirement.

## Launch gates and coverage

- **Statewide source** Bhulekh and BhuNaksha are verified candidates for complementary parts of the workflow. Bhulekh's public tenant form requires a village, and BhuNaksha supplies map sheets and parcel data. Either a suitable bulk source or an independently verified index assembled from the portals could meet BR-02. Launch depends on proving statewide coverage, acceptable freshness, and a collection and reuse arrangement the portals can support. [Bhulekh user manual](https://bhulekh.ori.nic.in/Bhulekh%20Portal%20User%20Manual.pdf) · [BhuNaksha Odisha](https://app4bhunakshaodisha.nic.in:8443/bhunaksha/#home-pane)
- **Current versus target** The deployed Site supports signed-in, village-based Odisha tenant lookup, official RoR links, and limited map coverage. Anonymous statewide lookup, live plot enrichment, and one PDF for all selected khatas remain launch work.
- **Geographic scope** Odisha is the live launch scope. Other states currently have name-review support, a portal directory, and local workspace search. Live coverage outside Odisha needs a separate release decision.

## Decisions still open

1. What source refresh interval and maximum acceptable data age should the public service use?
2. If some selected khatas have unavailable or unmergeable pages, should the app offer a separately labelled partial download? The current draft requires a complete file and shows the missing khatas before claiming success.
3. What public search response time and peak usage should testing target?
