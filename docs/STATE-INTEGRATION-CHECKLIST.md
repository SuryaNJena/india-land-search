# State integration checklist

Use this checklist for every new state or union territory. Track evidence in
the pull request and update the coverage table in the README. A jurisdiction
can ship as a pilot with incomplete items documented.

## CP1 Explain

- [ ] Verify the government records, map, and payment links. Record the source
  owner, reuse terms, date checked, and any restrictions on bulk access.
- [ ] Establish what a public user can do with a village name, holder name,
  holding number, and plot number. Record where the user must verify or sign in.
- [ ] Add state languages, local labels, and supported identifier formats to
  the state configuration.

## CP2 Diagram

- [ ] Document the path from state to district to village to parcel to record.
  Identify the boundary source, the cadastral source, and the records system.
- [ ] Define which identifiers join those systems. Keep state and source in
  each lookup key. Preserve leading zeros and parcel subdivisions.
- [ ] Define how the UI handles missing maps, duplicate locality names, older
  district boundaries, official handoffs, and sources without georeferencing.

## CP3 Test

- [ ] Test an exact match, a duplicate village name, a subdivided plot, a no-data
  response, and an upstream failure with synthetic or recorded fixtures.
- [ ] Verify the workflow in at least two real villages in different districts.
  Validate links and counts without committing names or private records.
- [ ] Confirm mobile and desktop behavior, Pages and Sites builds, and a
  portable build with no network access.
- [ ] Verify rate-limit behavior, timeouts, fixed upstream hosts, and cache
  scope. Stop automated checks at a source's security challenge.

## CP4 Implement and verify

- [ ] Show district polygons with labels in the state atlas. A district click
  and the district dropdown both zoom into that district.
- [ ] Load that district's village outlines on demand. Show village labels and
  allow selection by map or name. Explain coverage gaps and date the source.
- [ ] Carry the chosen state and village into official lookup views. Show
  choices when the official locality match is ambiguous.
- [ ] Load actual cadastral geometry or an official map image. Verify the
  map's reported coordinates before overlaying it on OpenStreetMap.
- [ ] Open exact Plot Info and show the source plot number, available area and
  holder details, and the associated official record link.
- [ ] Where supported, search holder names within selected villages and join
  exact parcels from verified plot schedules. Highlight all matched parcels
  before a parcel click. Report coverage if a search ends early.
- [ ] Verify official record links and document formats. Expose exports and
  revenue handoffs only for capabilities verified in that state.

## CP5 Pull request and release

- [ ] Link the tests, source attribution, known gaps, and representative
  walkthrough. Update the coverage table and release notes.
- [ ] After deployment, check the production UI and a live map and plot lookup
  from each configured runtime. Record the results and the rollback revision.
