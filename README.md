# DhuanTrace

**Build with AI: Code for Communities, Second Edition · Track 02: Clean Air & Climate Resilience (Theme: Sustainability)**

DhuanTrace finds the farm fires satellites miss after 4 p.m., traces whose smoke is reaching a city, and drafts the alert for the district that can act.

**Team Sant:** Mohit Katara and Divyansh Mathur · **Live app:** [add the Cloud Run link here]

## Problem it solves

- Satellites that detect farm fires (VIIRS, MODIS) pass over India around 1:30 p.m. Farmers now burn mostly between 4 and 6 p.m., so a large share of fires is never seen.
- Air-quality tools stop at showing the AQI. They don't say which district's fires are causing it, so nobody knows whom to alert.
- Most projects focus on Delhi-NCR and Punjab. Central India, including Madhya Pradesh, burns heavily too and gets little attention.

## What it does

1. **Live fire map.** It pulls NASA FIRMS fire detections from four satellite feeds for Madhya Pradesh, plus CPCB real-time AQI for every station in the state.
2. **Citizen photo reports fill the evening gap.** Anyone sends a smoke photo. Gemini reads it, names the source (crop burning, garbage, industry, dust) and adds it to the map as a fire the satellite missed.
3. **Smoke tracing.** Each fire's smoke is followed on the hourly wind field (Open-Meteo, 70-point grid, 36 hours). The app tells a city which districts' fires are in its air right now, and what share comes from each.
4. **Forecast that knows about missed fires.** It starts from the CAMS air-quality forecast and adds the smoke from citizen-reported fires, which CAMS cannot know about.
5. **Alert drafting.** Gemini writes an alert to the right district collector in English, Hindi, Marathi, Urdu, Bengali, Tamil, Telugu or Gujarati, using only the computed numbers.
6. **48-hour smoke replay.** Press Replay and watch fires light up, smoke travel along the wind to the city, and the city's AQI change, from two days ago into tomorrow's forecast.
7. **"Stop these fires first" list.** Ranks districts statewide by how many people in 12 cities breathe their smoke, now and in the next 24 hours, so enforcement teams know where to go before the 4 p.m. burning window.
8. **Ask DhuanTrace.** Officials and citizens ask questions by typing or speaking, in Hindi, English or six more Indian languages. Gemini answers only from the computed data.
9. **Real satellite imagery.** A toggle shows NASA's VIIRS true-colour image for today or yesterday, so judges can see the actual smoke plumes under the fire dots.
10. **Satellite verification with Gemini.** For any fire district, the app pulls NASA's real VIIRS true-colour image over the cluster and Gemini judges whether a smoke plume is visible and whether it drifts the way the wind model predicts. The model is checked against what the satellite actually saw, not just trusted.
11. **Live accuracy check.** The model's AQI at every CPCB station is compared with the station's own live reading: average error, bias, and how often both fall in the same CPCB category.
12. **Hidden hotspot detector.** Every CPCB station and citizen sensor is compared with what the model expects (CAMS + traced farm-fire smoke). Places far above the rest on a robust z-score (median and MAD) point to a local source the satellites miss: a factory, burning garbage, dust. Nearby industrial areas, citizen photo reports and neighbouring high readings are listed as evidence, with a confidence score. Clusters of citizen reports where no instrument exists are flagged too.
13. **Economic corridor forecasts.** Six industrial corridors of Madhya Pradesh (Indore–Pithampur, Indore–Dewas–Ujjain, Bhopal–Mandideep, Nagda–Ratlam, Banmore–Gwalior–Malanpur, Jabalpur–Katni) are sampled every ~12 km. The app shows the worst air along each corridor hour by hour for 48 hours and raises an alert when it moves into a worse CPCB category or jumps 50+ points in six hours, naming the fire districts behind it.
14. **Cities learning together (federated learning).** Each city node learns how far the CAMS forecast is off at its own CPCB stations and shares only its model weights, never its data. A coordinator averages them (FedAvg). The app logs one sample per live station every hour and retrains; once trained, the shared model's corrected forecast appears as its own line on the chart. A leave-one-city-out test shows whether sharing helps a city with no history. Other states can post their weights to `/api/federated/update`. A clearly labelled simulation shows the method before enough live data exists.
15. **Citizen sensor readings.** People with a low-cost PM2.5 meter submit readings. Each device is calibrated against the nearest CPCB station using its own earlier readings (median ratio, bounded), and calibrated readings feed the hotspot detector.
16. **Alert log with outcome check.** Drafted alerts are saved and move through sent, acknowledged, action taken and resolved. Six hours after action, the app compares the AQI change with the change the model expected from weather alone (difference-in-differences against the model), so an improvement caused by wind is not credited to the action.
17. **Forecast ledger (out-of-sample accuracy).** Every hour the app writes down its forecast for 3, 6, 12 and 24 hours ahead for each city with a CPCB station, before that hour comes. When the hour arrives it is scored once against the CPCB reading. The ledger compares DhuanTrace, CAMS alone and persistence (the AQI stays as it is, the baseline any forecast must beat): average error, bias, right CPCB category, and how often the reading fell inside the forecast range. It never scores against sample data, and nothing is back-filled.
18. **Forecast range.** Each future hour has a likely range (10th–90th percentile), from an 11-member wind ensemble (the wind field turned ±10–20° and sped up or slowed down) for the citizen-reported smoke, plus the spread of CAMS error. Until 30 forecasts have been scored, a wide default spread is used and labelled; after that the ledger calibrates it, so the range learns from the app's own mistakes.
19. **Photo trust score.** Every citizen photo gets a trust score with its reasons listed: capture time and GPS read from the photo's EXIF (the page sends the start of the original file, since the resized copy loses EXIF), an exact-copy check and a perceptual fingerprint that catches the same photo resized or recompressed, Gemini's check for photos of screens, AI-made or stock images, indoor scenes and daylight that does not match the hour, and nearby satellite fire detections. A report's smoke counts in proportion to its trust; below 25% it is left out. Missing EXIF is neutral, because many apps strip it.
20. **Smoke across state borders.** Each fire is placed in its state by the nearest MP district headquarters or border town (an approximate border). The app shows how much smoke MP's cities receive from Rajasthan, Uttar Pradesh, Chhattisgarh, Maharashtra and Gujarat, and how much MP smoke reaches eight big cities across the border, as an open bulletin (`/api/interstate`, schema `dhuantrace.interstate/1`). Alerts always go to an MP Collector who can act; smoke from another state is named separately and passed to the pollution control boards.
21. **Open data packet.** Every city publishes its forecast and attribution as open JSON (`/api/packet`), so neighbouring cities and states can use each other's results. This covers the brief's interoperability requirement.
22. **Federated network of separate nodes.** Four separate programs (`fednode.js`), one each for MP West, MP Central, MP East and Rajasthan, hold their own air-quality history and train one model together over HTTP (protocol `dhuantrace.fednet/1`). The coordinator sends out the shared weights, each node trains on its own rows and sends back five numbers. Every message is signed with HMAC-SHA256; nodes refuse unsigned, altered or replayed messages; the coordinator refuses any reply carrying fields outside the protocol and reports it; a node that fails is left out and training continues. The page shows each node's process, what it printed, how many messages crossed the network and that zero data rows reached the coordinator. The result is honest: a node that has never trained gets about half the error of CAMS alone from the others' model, while a node with days of its own history does about as well alone as with the shared model plus a short tuning on its own data. Until live CPCB rows exist, the nodes use labelled simulated history.
23. **Satellite evidence for hotspots.** For each hidden hotspot the app reads NASA GIBS data layers pixel by pixel: MODIS MAIAC aerosol optical depth (1 km) and Aura OMI tropospheric NO₂. Each pixel's colour is turned back into its value with the layer's published colour map, and the spot is compared with the ring around it. If the colours do not match the colour map, the reading is refused rather than guessed; a cloudy day falls back to the day before; if NASA cannot be reached nothing is claimed. Satellite support raises the hotspot's confidence, a clear view with no excess lowers it.
24. **Track 02 traceability.** A table on the page (and `/api/requirements`) maps each part of the problem statement to the features, the API, the tests that prove it and a live check against the running app. A test fails if any listed proof disappears.
25. **60-second tour.** One button walks a judge through every requirement on the real page, including a live federated run and a Hindi alert.
26. **System health and API docs.** A panel shows each data source's state and why, request counts and response times per endpoint, uptime and version (`/api/system`). Every endpoint is described in OpenAPI 3.1 (`/api/openapi.json`, readable at `/api-docs.html`); a test fails if a route is undocumented or a documented path does not exist.
27. **Security.** Rate limits per address on every write, size and type checks on every body, a Content Security Policy and other security headers, open CORS for read-only data, internal errors hidden behind a reference code, and a non-root container. See [SECURITY.md](SECURITY.md) for the threat model.
28. **Backup station data (failover).** Station AQI comes from CPCB through data.gov.in. If that fails (it was down during development), the app automatically uses the same CPCB stations through the World Air Quality Index Project (aqicn.org, free `WAQI_TOKEN`). WAQI publishes pollutants on the US EPA scale, so PM2.5 and PM10 are turned back into concentrations and then into CPCB NAQI sub-indices; stale stations are left out, the page says which source is in use, and data.gov.in is tried first again on every refresh. Only if both fail does the app fall back to labelled sample data.
29. **Built for Google Cloud Run.** On Cloud Run the local disk is wiped at every restart and idle instances get no CPU, so two Google Cloud services keep the app honest there: **Cloud Storage** holds every saved file (reports, alerts, sensor readings, the forecast ledger, the federated samples); they are restored at start-up and copied back a few seconds after each save, using the service's own account (no key file). **Cloud Scheduler** calls `POST /api/jobs/hourly` at five past every hour with a secret token, so the ledger is written and scored around the clock even when nobody has the page open. `DEPLOY_CLOUD_RUN.bat` sets up both.
30. **Hindi and English.** One button switches the whole page to Hindi, including the tour, the map legend, the citizen report form and the numbers-with-text lines; the alert and question language follow it. A test fails if any page label or tour step lacks Hindi.
31. **Scales across states and countries (region packs).** Everything tied to a place (districts, cities, borders, corridors, industrial areas, federated regions, pollution boards) lives in one JSON file, `regions/<id>.json`, chosen with `REGION`. Madhya Pradesh and Punjab–Haryana are built; the same server runs either with no code change, and the Punjab–Haryana pack traces smoke across the border into Pakistan. How to add a state, and what a BRICS country needs: [SCALING.md](SCALING.md).

## Google technology used

- **Gemini 3.7 Flash** (multimodal): reads citizen photos and returns structured JSON; drafts grounded multilingual alerts; answers typed or spoken questions from the computed data.
- **Cloud Run**: hosts the app.
- The CAMS forecast and wind come from Open-Meteo. The architecture leaves room for Google Earth Engine layers (Sentinel-5P NO₂) as a next step.

---

## Setup (Hinglish)

### Step 1: Free API keys lo (lagbhag 10 minute)

| Key | Kahan se milegi | Kitna time |
|---|---|---|
| `FIRMS_MAP_KEY` | https://firms.modaps.eosdis.nasa.gov/api/map_key/ par email daalo, key turant mail pe aa jaati hai | 2 min |
| `DATA_GOV_API_KEY` | https://data.gov.in par sign up karo, phir **My Account** mein API key copy karo | 5 min |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey par "Create API key" | 1 min |

Open-Meteo (wind aur CAMS forecast) ko key ki zaroorat nahi hai.

Koi key na ho to bhi app chalega. Us source ke liye sample data dikhega, aur upar wale chip pe "sample" likha aayega.

### Step 2: Apne computer pe chalao

Node.js 22 ya usse naya chahiye (https://nodejs.org). Koi `npm install` ki zaroorat nahi hai.

```bash
cd dhuantrace
cp .env.example .env        # phir .env kholke teeno keys paste karo
node server.js
```

Browser mein http://localhost:8080 kholo. Upar ke chips green ("live") dikhne chahiye.

Test chalane ke liye: `node test/live-paths.test.js` (17 checks, internet ki zaroorat nahi).

### Step 3: Google Cloud Run pe deploy karo (live link ke liye)

**Aasaan tarika (Windows):** Google Cloud SDK install karo (https://cloud.google.com/sdk/docs/install), phir `DEPLOY_CLOUD_RUN.bat` pe double-click karo. Ye login karwayega, project ID poochhega, `.env` ki keys khud le lega aur deploy kar dega. Aakhir mein jo `https://...run.app` link aaye, wahi submission mein daalo.

**Ya command se:**

1. https://console.cloud.google.com par project banao aur billing on karo (hackathon credits chalenge).
2. Google Cloud SDK install karo: https://cloud.google.com/sdk/docs/install, ya console mein **Cloud Shell** kholo (sabse aasaan; usme folder upload kar sakte ho).
3. Folder ke andar ye command chalao (keys apni daalo):

```bash
gcloud run deploy dhuantrace \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars FIRMS_MAP_KEY=xxxx,DATA_GOV_API_KEY=xxxx,GEMINI_API_KEY=xxxx
```

Pehli baar APIs enable karne ka poochhe to `y` dabao. 3–5 minute mein ek `https://dhuantrace-....run.app` link milega. Wahi link submission mein daalo.

`--max-instances 1` isliye hai taaki saari citizen reports ek hi jagah rahein.

### Demo ke din safety

Venue ka Wi-Fi kharab ho to `DEMO_MODE=1` set karo. Saara data sample se aayega aur app kabhi nahi tootega.

```bash
gcloud run services update dhuantrace --region asia-south1 --update-env-vars DEMO_MODE=1
```

---

## API

| Endpoint | What it returns |
|---|---|
| `GET /api/status` | Which sources are live or sample |
| `GET /api/fires?hours=24` | Fire detections with district names |
| `GET /api/stations` | CPCB stations with AQI and category |
| `GET /api/analyze?city=indore` or `?lat=..&lon=..` | AQI now, 24 h peak, attribution by district, back-trajectory, smoke paths, forecast |
| `GET /api/reports` / `POST /api/reports` | Citizen reports; POST takes `{image: dataURL, lat, lon}` and runs Gemini |
| `POST /api/alert` | `{city, lang}` → drafted alert |
| `GET /api/priorities` | Statewide ranking of fire districts by people exposed |
| `POST /api/ask` | `{city, question, lang}` → grounded answer and follow-up questions |
| `GET /api/verify?district=Sehore` | NASA VIIRS image of the latest fire cluster + Gemini plume verdict vs the wind model |
| `GET /api/skill` | Model AQI vs live CPCB readings: MAE, bias, same-category rate |
| `GET /api/hotspots` | Hidden hotspots: unexplained excess, evidence, confidence |
| `GET /api/corridors` | 48 h forecast and spike alerts for 6 industrial corridors |
| `GET /api/federated` (`?simulate=1`) | Federated model: error by round, per-city results, leave-one-city-out test |
| `GET /api/model` | The shared model's weights, for other states to use |
| `POST /api/federated/update` | `{node, weights[5], samples}` → another state's node joins the average |
| `GET /api/sensors` / `POST /api/sensors` | Citizen sensor readings; POST takes `{lat, lon, pm25, pm10?, device}` |
| `GET /api/alerts` / `POST /api/alerts` | Saved alerts with outcome check; POST saves a drafted alert |
| `POST /api/alerts/{id}/status` | `{status, note}`: drafted, sent, acknowledged, action_taken, resolved |
| `GET /api/ledger` | Forecast ledger: errors by lead time vs CAMS and persistence, range coverage |
| `GET /api/interstate` | Inter-state smoke bulletin (`dhuantrace.interstate/1`) |
| `GET /api/packet?city=bhopal` | Open Clean Air Packet (JSON) |
| `POST /api/fednet/run` / `GET /api/fednet` | Train over the network of separate node processes; last run, nodes and their logs |
| `GET /api/requirements` | Track 02 requirements → features, API, tests, live check |
| `GET /api/system` | Source health, request counts and latency per endpoint, uptime, version |
| `GET /api/openapi.json` | OpenAPI 3.1 description of every endpoint (human-readable at `/api-docs.html`) |

Reads are open to other sites (CORS). Writes must be JSON and are rate-limited per address (`429` with `Retry-After`).

### Running federated nodes on other machines

Each state runs a node with its region and the shared secret, then the coordinator lists them:

```bash
# on each state's server
FED_REGION=rajasthan FED_SECRET=<shared secret> PORT=8091 node fednode.js
# in the coordinator's .env
FED_PEERS=http://10.0.0.5:8091,http://10.0.0.6:8091
FED_SECRET=<shared secret>
```

Without `FED_PEERS`, the Start button runs four local node processes for the demo.

## Impact in numbers

Measured from the running app with live NASA, Open-Meteo and CAMS data on 29 September 2026 (early in the burning season), except where marked.

| What | Number | Source |
|---|---|---|
| People covered in the 12 MP cities | about **88 lakh** (8.84 million, Census 2011 urban) | `lib/places.js` |
| Across the border, cities that MP smoke reaches | 8 cities, about **1.04 crore** people | `lib/places.js` |
| Districts watched | **51** MP district headquarters, plus 45 reference towns in 5 neighbouring states | `lib/places.js` |
| Satellite fire detections, last 48 h | **292** from 4 satellite feeds | live FIRMS |
| Share of those seen only at the two overpasses (about 1:30 a.m. and 1:30 p.m. IST) | **98%** (285 of 292); **0** detections between 4 and 8 p.m., when most burning happens | live FIRMS, detection times |
| Warning before smoke reaches a city | Indore 2.1 h, Dewas 5.1 h ahead of the first smoke on 29 Sept | live wind trajectories |
| Forecast horizon | 48 h for every city and 6 industrial corridors | CAMS + traced smoke |
| Time to draft an alert for the right Collector | a few seconds, in 8 languages | Gemini (template if busy) |

The evening gap is the core of the idea: the satellites cannot see the 4–8 p.m. burning window, so citizen photos fill it, and the app turns them into district-level action before the smoke arrives.

## Load test

`node scripts/loadtest.js <url> <users> <seconds>` sends a visitor-like mix of requests (city analysis, fires, stations, priorities, packets, the page). On a 2-vCPU container running the server and the load generator together, with cached sample data:

| Simultaneous users | Requests per second | Median | 95th percentile | Errors |
|---|---|---|---|---|
| 50 | about 2,500 | 15 ms | 55 ms | 0 |
| 200 | about 2,560 | 61 ms | 231 ms | 0 |

A new place that is not cached yet takes 70 ms to 1.2 s (live wind and CAMS calls). Cloud Run adds instances with load; the deploy script caps it at one instance for the hackathon, which is plenty at these numbers.

## Where saved data lives

Citizen reports, sensor readings, saved alerts and federated samples are kept as JSON files in the `data/` folder next to `server.js` (change it with `DATA_DIR`). On Cloud Run that folder is wiped when the service restarts; for a long-running deployment, point `DATA_DIR` at a mounted volume.

## Tests

```bash
node test/live-paths.test.js   # live data paths with mocked NASA, CPCB, Open-Meteo and Gemini
node test/cache.test.js        # shared requests and keeping the last live data when a source is busy
node test/features.test.js     # hidden hotspots, corridors, federated model, sensors, alert log
node test/research.test.js     # forecast ledger, forecast range, photo trust, inter-state smoke
node test/fednet.test.js       # federated network: real HTTP nodes, signatures, data-leak refusal, node failures
node test/satevidence.test.js  # PNG and colour-map decoding of NASA layers, fallbacks (NASA mocked)
node test/openapi.test.js      # every route documented; every requirement's tests, panels and endpoints exist
node test/region.test.js       # every region pack checked, then the whole server run on the Punjab–Haryana pack
node test/server.test.js       # starts the real server on sample data and calls every endpoint, plus security checks
```

Or all at once: `npm test`. None of them needs internet or API keys. `.github/workflows/ci.yml` runs them on Node 22 and 24 on every push, and builds and starts the Docker image.

## Method and limits

The full method, every constant, what has and has not been validated, and the validation plan are in [MODEL_CARD.md](MODEL_CARD.md).

- Trajectories: hourly 10 m wind, bilinear in space and linear in time, RK2 steps, scaled by 1.3 to approximate transport in the mixed layer. A smoke path within 30 km of a place counts toward it.
- Attribution shares are relative among fire districts, weighted by fire power and closest approach.
- AQI uses CPCB NAQI breakpoints on 24-hour means. The citizen-fire correction uses a screening-level constant.
- Results are decision support, not an official forecast.

## Project layout

```
server.js            Start-up: restores saved data from Cloud Storage when GCS_BUCKET is set, then loads app.js
app.js               HTTP server, API routes and the hourly jobs (no dependencies)
fednode.js           One federated node (run one per region or state)
lib/sources.js       NASA FIRMS, CPCB (data.gov.in), Open-Meteo wind and CAMS, with retries, caching and fallback
lib/engine.js        Trajectories, fire clustering, attribution by district and state, forecast and its range
lib/ledger.js        Forecast ledger: forecasts written ahead and scored against CPCB
lib/trust.js         Trust score for citizen photos
lib/exif.js          Reads capture time and GPS from JPEG EXIF
lib/interstate.js    Smoke across state borders
lib/hotspots.js      Hidden hotspot detector
lib/corridors.js     Economic corridor forecasts
lib/federated.js     Federated bias-correction model (FedAvg)
lib/sensors.js       Citizen sensor readings and calibration
lib/alerts.js        Alert log and outcome check
lib/research.js      Satellite plume check with Gemini, live accuracy check
lib/fednet.js        Federated network protocol: nodes, coordinator, signing, whitelist
lib/fedlauncher.js   Starts local node processes or uses FED_PEERS
lib/satevidence.js   Aerosol and NO2 evidence for hotspots from NASA GIBS layers
lib/png.js           Minimal PNG decoder for NASA data layers
lib/requirements.js  Track 02 traceability map and live checks
lib/region.js        Loads and checks the region pack chosen by REGION
regions/*.json       Region packs: mp (default), punjab-haryana. See SCALING.md
lib/openapi.js       OpenAPI 3.1 description
lib/guard.js         Security headers, rate limits, request metrics, structured logs
lib/gcs.js           Cloud Storage persistence (restore at start, upload after saves)
static/i18n.js       Hindi / English switch
lib/reports.js       Citizen photo reports
lib/gemini.js        Photo reading, alerts and questions with Gemini
lib/aqi.js           CPCB NAQI breakpoints
lib/places.js        MP districts, cities, corridors' towns and the approximate state border
lib/sample.js        Sample data used when a source is unavailable
lib/datastore.js     JSON files in data/
static/              The web app (Leaflet map), API docs page and phone-app files
SECURITY.md          Threat model and mitigations
LICENSE, NOTICE.md   MIT licence; data sources and their terms
scripts/loadtest.js  Load test (zero dependencies)
MODEL_CARD.md        What the numbers mean, assumptions, limits, Responsible AI and the validation plan
.github/workflows/   CI: tests on Node 22 and 24, Docker build
test/                Offline tests; test/fixtures holds small sample photos with EXIF
```
