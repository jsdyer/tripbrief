# Trip Brief

[Open Trip Brief](https://coolcode.ca/tripbrief/) · A private itinerary beside the current Canadian travel advisory index.

<!-- coolcode:guide -->
Search any of the 230 destinations in Global Affairs Canada's current index, including territories. Filter by advice level or regional advisories, then open a destination to read its latest published change and the full official advice.

Add destinations to your trip, set arrival/departure dates and write notes. The tab keeps these in memory until you explicitly save on this device or export a file. Loading a previously saved trip highlights changes from its saved advisory evidence. Export JSON for later editing, or a self-contained HTML brief to open offline and print to PDF. Delete the device copy separately from clearing the current tab.

Advice is checked hourly and every destination links to its official page. The checked time, source edition and individual official update dates mean different things. The summary does not include all regional boundaries, entry rules or health advice. Dates organize your itinerary; they do not predict future conditions or determine visa eligibility. Review full official advice before departure and while travelling. Exported briefs can become outdated.
<!-- /coolcode:guide -->

## Development

No API key, database or paid service is required. Python 3.12+ and Node 24 are used in CI.

    python3 scripts/refresh.py
    node --test tests/*.test.mjs
    python3 -m unittest discover -s tests -v
    python3 scripts/build.py
    python3 -m http.server 8000 --directory dist

For the browser checks, install tests/browser-requirements.txt and provide a working Chrome through CHROMIUM_PATH. CI uses the installed google-chrome on Ubuntu 24.04.

## Data and updates

The complete [official English advisory index](https://data.international.gc.ca/travel-voyage/index-alpha-eng.json) includes French names for search. It is available under the [Open Government Licence–Canada](https://open.canada.ca/en/open-government-licence-canada); see the [dataset listing](https://open.canada.ca/data/en/dataset/bef2ebb3-ca9a-485f-aaff-5dc36eb89426). Trip Brief is independent and is not endorsed by the Government of Canada.

config/source.json declares the reviewed source, minimum record count and observed-change limit. Collection rejects malformed records, future timestamps, unexpectedly missing destinations and HTTP failures. A failed refresh does not overwrite the last good source capture. web/data/index.json contains only public advice; web/data/status.json is a small status probe with the actual successful check time, source edition, destination count and capture hash. Unchanged advice advances the check time, never its official publication time. Observed differences begin with this deployment, are bounded to 100 entries and are not a full history of edits to destination pages.

.github/workflows/pages.yml refreshes at minute 29 every hour, tests, builds, runs real browser interactions, commits validated source captures and deploys Pages. The separate weekly .github/workflows/schedule-guard.yml renews only explicitly allowlisted workflows. The independent CoolCode server scheduler should dispatch pages.yml hourly as a second scheduler; GitHub schedules can be delayed or disabled. A probe older than six hours is shown as stale in the app.

## Expand or customize

Edit config/source.json to change the checked record floor or retained-change limit, then run the refresh, test and build commands above and commit the validated changes to main. Ordinary users can add any available destination using search without editing a preset list.

To extend the app, preserve official country/territory codes (including PT-20), regional flags, timezone-aware timestamps, input validation and the separation between checked and published dates. The collector does not scrape full destination advice.

## Privacy and exports

No itinerary is uploaded. Save/load uses the browser's local storage only when requested. JSON and HTML exports contain your notes and dated advisory evidence; store or share those files deliberately. Source links and the usual CoolCode visit counter make ordinary web requests. Clearing the tab and deleting its saved copy are separate actions. Imports are size limited, schema validated and rendered as text.

## Integration

tool.json declares the homepage card, guide, source and freshness probe. The hub owns its registry, sitemap, audit and Worker routing. Cloudflare needs only the existing /tripbrief/ route; no secret or additional backend is needed.
