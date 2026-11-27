# Scaling DhuanTrace: across Indian states and BRICS countries

DhuanTrace ties itself to a place in one file only: a **region pack**, `regions/<id>.json`. The engine, forecast, alerts, hidden-hotspot detector, corridors, federated network and API are the same code everywhere. The pack is chosen with an environment variable:

```bash
REGION=mp npm start               # Madhya Pradesh (default)
REGION=punjab-haryana npm start   # Punjab and Haryana
```

Two packs are built and tested today: **Madhya Pradesh** (51 districts, 12 cities) and **Punjab–Haryana** (45 districts, 12 cities, two state pollution control boards, and a border that runs into Pakistan). `test/region.test.js` checks every pack and then starts the whole server on the Punjab–Haryana pack. For that pack, it checks that alerts go to a Punjab or Haryana Collector with the right board on copy, that no Madhya Pradesh text leaks through, and that the federated network trains four Punjab–Haryana nodes.

## What a region pack contains

| Key | What it is | Example (Punjab–Haryana) |
|---|---|---|
| `id`, `name`, `name_hi`, `short`, `country` | Names shown on the page, in the alert and in Gemini's prompts | `punjab-haryana`, "Punjab and Haryana", "PB-HR", "India" |
| `home_states` | States the node is responsible for: CPCB state key, pollution control board in English and Hindi | Punjab → Punjab Pollution Control Board; Haryana → Haryana State Pollution Control Board |
| `districts` | `[name, name_hi, lat, lon, state]` for each district headquarters. Fires are named after the nearest one. | 45 rows |
| `cities`, `pop` | Cities in the picker and their population, used to rank "stop these fires first" | Ludhiana, Amritsar … Gurugram, Panipat |
| `bbox`, `analysis_bounds`, `grid` | Fire search box, the area the API accepts, and the wind grid (≤ 100 points) | 6 × 6 wind grid, 28–33°N, 73–78°E |
| `neighbour_towns`, `neighbour_cities` | Reference towns across every border, so smoke is given to the right state or country, and big cities the smoke can reach | Rajasthan, Delhi, UP, Himachal, J&K, Chandigarh, **Pakistan (Punjab)**: Lahore, Kasur, Sialkot |
| `corridors`, `industrial` | Economic corridors forecast every 12 km, and industrial areas used as evidence for hidden hotspots | Ludhiana–Mandi Gobindgarh, Panipat–Sonipat, Gurugram–Manesar–Bawal |
| `fed_regions` | The federated nodes of this region and their cities | Punjab Malwa, Punjab Doaba–Majha, Haryana, Haryana NCR |
| `sample` | Labelled sample data for demos when a live source is down | Stubble-burning districts, sample stations |

`lib/region.js` refuses to start with a pack that is missing a key or lists a city that is not a district, and the test adds geometry checks: every district, corridor stop and grid point must be inside the analysis area.

## Adding an Indian state (about half a day)

1. Copy `regions/punjab-haryana.json` to `regions/<state>.json`.
2. Fill the district headquarters (name, Hindi name, latitude, longitude, state). The Census 2011 district list and any gazetteer are enough; coordinates are only used to find the nearest district.
3. Put the state's CPCB name in `home_states[].cpcb` (as data.gov.in spells it) and its pollution control board.
4. Set the bounding box about 2° wider than the state on each side, so smoke from neighbours is seen, and a wind grid of up to 10 × 10 points.
5. Add reference towns in each neighbouring state, the corridors and industrial areas, and 3–4 federated regions.
6. Run `npm test`. Then `REGION=<state> npm start` and open the page.

No code changes are needed for any Indian state: NASA FIRMS, Open-Meteo wind, CAMS, NASA GIBS and CPCB already cover the whole country, and the alerts, Hindi interface and 8 alert languages are shared.

## One node per state, one network for India

Each state runs its own DhuanTrace node with its own pack, on its own Cloud Run service. The nodes then connect in two ways:

- **Open packets.** `GET /api/packet` and `GET /api/interstate` give every node's forecast, attribution and cross-border smoke as open JSON, described in OpenAPI 3.1. When Punjab's node says "38% of Delhi's farm-fire smoke comes from Sangrur", Delhi's node or CAQM can read it without a new agreement.
- **Federated learning.** Nodes train one shared forecast-correction model over signed HTTP (`dhuantrace.fednet/1`). Only model weights move, and the coordinator refuses any reply that carries data rows. A state that joins late gets the shared model on day one.

```bash
# Madhya Pradesh node, Punjab–Haryana node, each on its own server
REGION=mp FED_REGION=mp-west FED_SECRET=<shared> PORT=8091 node fednode.js
REGION=punjab-haryana FED_REGION=haryana FED_SECRET=<shared> PORT=8091 node fednode.js
```

## BRICS countries

Rule 04 asks for applicability across BRICS nations. Crop and forest burning drives seasonal smoke in several of them, for example the Amazon and Cerrado in Brazil, the North China Plain, southern Africa's burning season, and Russia's Siberian fires. The part of DhuanTrace that does the work is global:

| Input | Coverage | Needs for another country |
|---|---|---|
| NASA FIRMS fire detections (VIIRS, MODIS) | Global | Nothing: the pack's bounding box |
| Open-Meteo hourly wind | Global | Nothing: the pack's grid |
| CAMS PM2.5/PM10 forecast (via Open-Meteo) | Global | Nothing |
| NASA GIBS aerosol, NO₂ and true-colour images | Global | Nothing |
| Google Gemini (photo reading, alerts, Q&A) | Global, many languages | The alert languages for that country |
| Ground stations | CPCB is India only. WAQI (aqicn.org), already built in as the backup source, aggregates official stations in many countries, including Brazil, China and South Africa | Set `waqi_bounds` in the pack; or add a national station adapter |
| AQI scale | CPCB NAQI today. A converter from US-EPA sub-indices already exists for WAQI data | One function per national index (for example China's HJ 633-2012 AQI), selected by the pack's `aqi_scale` |
| Borders and districts | Reference towns in the pack | The country's municipalities or districts |

So a Brazilian pack would list Mato Grosso or Pará municipalities, use WAQI stations, add a Brazilian AQI function and Portuguese alert text. The trajectory model, attribution, forecast range, hidden-hotspot test, corridors, trust scoring and federated network carry over unchanged.

**Honest status.** Only Indian packs exist today. For a non-Indian pack, two pieces of code are still to be written: the national AQI function and the alert template in that language. The rest is the pack file. We chose not to ship a half-checked foreign pack for the hackathon.

## Why federated learning matters across borders

Air-quality data often cannot leave a country, or even a state agency. DhuanTrace's federated protocol lets each node keep its station data on its own server and share only model weights. Every reply is checked against a whitelist, so raw rows cannot slip through. That is how states, and later countries, can learn from each other's forecast errors without a data-sharing treaty. The Punjab–Haryana pack already shows smoke crossing a national border: fires near Lahore are attributed to "Pakistan (Punjab)", and Lahore itself appears as a city that Indian smoke reaches.

## Cost of scale

One node is one Cloud Run service with scale-to-zero, one Cloud Storage bucket and one Cloud Scheduler job each hour. The load test (`scripts/loadtest.js`) served 2,500 requests per second with 0 errors on one instance, so a node covers a state's officials and the public page comfortably. Each new state costs a pack file and a deploy, not new code.
