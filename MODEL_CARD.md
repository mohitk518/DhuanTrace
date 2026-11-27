# Model card: DhuanTrace smoke attribution and AQI forecast

This card says what DhuanTrace's numbers mean and how far they can be trusted. It lists what has been checked, what is assumed, where the numbers can go wrong and how each assumption will be tested. DhuanTrace is a screening tool for deciding where to send teams. It is not an official forecast.

## What the model produces

| Output | Meaning | Used for |
|---|---|---|
| Attribution by district and state | Share of a city's farm-fire smoke that comes from each district (or neighbouring state), now and in the next 24 h | Which Collector gets the alert; the "stop these fires first" ranking |
| Farm-fire AQI points | Estimated AQI added by traced farm-fire smoke | The gap between CAMS and DhuanTrace; hidden-hotspot residuals |
| 48 h AQI forecast | CAMS forecast plus smoke from citizen-reported fires that CAMS cannot see | City and corridor forecasts |
| Likely range (80%) | The band the AQI should fall in 8 times out of 10 | Honest uncertainty in alerts |
| Hidden hotspots | Readings far above what CAMS plus traced smoke explains | Pointing inspectors to a local source |
| Federated bias correction | A shared linear correction to CAMS, learned by city nodes that share only weights | A separate line on the chart; not the main forecast |

## How it works (short)

1. **Fires:** NASA FIRMS detections from VIIRS S-NPP, NOAA-20, NOAA-21 and MODIS (low-confidence detections dropped), plus citizen photo reports read by Gemini. Detections are grouped into cells of about 5 km per hour.
2. **Transport:** each fire cell's smoke is followed forward for 36 hours on the Open-Meteo hourly 10 m wind (a 70-point grid over central India), with second-order Runge–Kutta steps. Wind speed is scaled by **1.3** to approximate transport in the mixed layer.
3. **Link to a city:** a path that passes within **30 km** counts. Its weight falls with the distance of closest approach (Gaussian, 15 km scale).
4. **Size of the effect:** fire radiative power (MW) × **0.45 AQI points per MW**, decaying with an **8-hour** e-folding time after arrival. A citizen report counts as 8, 18 or 30 MW for low, medium or high smoke, multiplied by its trust score. Reports below 25% trust are left out.
5. **Forecast:** CAMS PM2.5/PM10 (Open-Meteo) turned into CPCB NAQI on a trailing 24 h mean, plus the smoke from citizen-only fires.
6. **Range:** an 11-member wind ensemble (direction ±10–20°, speed ×0.8–1.2) for the citizen smoke, combined with CAMS error quantiles. The default CAMS error is −30%/+35%, widening 0.5% per hour of lead time. Once the forecast ledger has 30 or more scored forecasts, the quantiles come from DhuanTrace's own measured errors.
7. **AQI:** CPCB National AQI breakpoints. Station AQI is the highest sub-index, as CPCB reports it. When the WAQI backup is used, US-EPA sub-indices for PM are turned back into concentrations and then into CPCB sub-indices (approximate).

## What has been checked

| Check | How | Result so far |
|---|---|---|
| Code correctness | 228 offline tests on Node 22 and 24: region packs, parsers, time zones, AQI breakpoints, trajectories, attribution sums, trust scoring, federated protocol, security | All pass |
| Live data paths | Each API (FIRMS, CPCB, WAQI, Open-Meteo, CAMS, Gemini, GIBS) tested against replies in its documented format; FIRMS, Open-Meteo, CAMS, Gemini and GIBS also confirmed live on 29 Sept 2026 | Working. data.gov.in's sign-up page was down, so live CPCB is not yet confirmed |
| NASA layer decoding | Each pixel's colour must match the layer's published colour map exactly; checked on live MAIAC AOD and OMI NO₂ images | 100% colour match on live images |
| Forecast accuracy | Forecast ledger: every forecast written before its hour and scored once against CPCB, compared with CAMS alone and with persistence | **Not yet measured.** It needs live CPCB readings and at least a day of hourly runs. No accuracy number is claimed until then. |
| Smoke direction | Gemini compares the NASA true-colour image with the model's smoke bearing for a district | Case by case. Not a statistical test. |
| Federated learning | Four separate node processes train over signed HTTP; a node that never trained is tested on the others' model | On **simulated** history, a new node's error halves compared with CAMS alone. Not yet shown on live data. |

## Assumptions that could be wrong

| Assumption | Why it could be wrong | Effect | How it will be tested |
|---|---|---|---|
| 10 m wind × 1.3 moves the smoke | Smoke rises; winds aloft differ in speed and direction, especially at night | Wrong district shares on some days | Compare with HYSPLIT trajectories at 500 m and 1000 m for sample days |
| 0.45 AQI per MW of fire power | A screening constant, not fitted | Farm-fire AQI points may be too high or too low by a factor | Fit on the ledger: residual (CPCB − CAMS) against traced fire power, by season |
| 30 km reach, 15 km Gaussian | Plumes widen with distance | Far fires under-counted, near fires over-counted | Sensitivity runs (20/30/50 km); satellite plume checks |
| 8 h smoke lifetime | Depends on mixing height and rain | Tail of the forecast | Fit on the ledger |
| Citizen report = 8/18/30 MW | Photos show smoke, not fire power | Citizen-only fires may be mis-sized | Pair photos with the next morning's FIRMS detections at the same place |
| Nearest-town state border | Not a legal boundary; good to a few tens of km | A fire near the border can be given to the wrong state | Replace with official district polygons |
| AQI from CAMS 24 h mean | CPCB also uses NO₂, SO₂, O₃, CO, NH₃ | Under-estimate where gases dominate | Add the gases once CAMS gas fields are used |

## Where the numbers should not be used

- To fine or prosecute anyone. Attribution is a probability-weighted estimate, not proof of who burned what.
- As a health advisory on its own. Use the official CPCB/IMD advisories; DhuanTrace adds the likely cause and the district.
- Outside the area of the active region pack (Madhya Pradesh: 18–30°N, 70–87°E; Punjab–Haryana: 26–34.5°N, 71–80°E). The wind grid and fire search do not cover other areas, and the API refuses such points. A new area needs its own pack (SCALING.md).
- For urban or industrial sources. The model traces farm and forest fires only. Other sources show up only as hidden-hotspot residuals.

## Known biases

- **Cloud and night:** satellites miss fires under cloud and between overpasses. That gap is why citizen reports exist, but it also means quiet nights may be under-counted.
- **Where people report:** reports come from places with phones and signal, so remote areas are under-reported.
- **Station coverage:** most CPCB stations are in big cities, so hidden hotspots can only be found where something measures.
- **Sample and simulated data:** when a source is down, labelled sample data keeps the demo working. Every panel says so, and the ledger never scores against it.

## Validation plan (next 4 weeks)

1. Run the ledger on live CPCB for 14 days during the burning season, and publish error by lead time against CAMS and persistence.
2. Fit AQI-per-MW and smoke lifetime from those 14 days; keep the old constants as the baseline and report both.
3. Compare 20 days of attribution with HYSPLIT back-trajectories for Indore and Bhopal.
4. Replace simulated federated history with live samples from at least three city nodes, and repeat the new-member test.
5. Ask one district (for example Sehore or Raisen) to log where teams went and what they found, then check the outcome against the model's expected change.

## Responsible AI

| Principle | How DhuanTrace applies it |
|---|---|
| **A person decides** | Gemini drafts alerts and answers; it never sends anything. Every alert is a draft that an official checks and sends, and the alert log records who moved it to "sent". |
| **Grounded, not invented** | Gemini is given only the numbers the app computed and is told to use nothing else. Replies are parsed as JSON and checked field by field. If Gemini is busy or unavailable, a plain template is used and the page says why. |
| **Names places, not people** | Attribution goes to districts and states. No farmer, field owner or reporter is identified, and the model card says the numbers must not be used to fine anyone. |
| **Privacy of reporters** | No name, phone number or account. The browser shrinks the photo before sending it, which removes its EXIF; only the capture time, GPS and camera model are read from the first bytes of the original file, to score trust. The public map shows report locations rounded to about 1 km. The form asks people to keep faces and number plates out. |
| **Fake or recycled photos** | A trust score (EXIF time and place, duplicate and near-duplicate checks, Gemini's check for screens and AI images, nearby satellite fires) decides how much a report counts. Below 25% it is left out. Missing EXIF is neutral, because many apps strip it. |
| **Honest about data** | Every panel says whether its source is live or labelled sample data. The ledger never scores against sample data. Sample station values are never labelled CPCB. |
| **Fairness across places** | Places with fewer phones and fewer stations are under-reported (see Known biases). The ranking uses people exposed, so large cities weigh more; the district list is meant to guide patrols, not to rank districts' worth. |
| **Open and checkable** | The code, the constants and the tests are open (MIT). Every endpoint is described in OpenAPI. The forecast ledger publishes its own errors. |

## Contact and versions

Version 1.0.0, 29 September 2026. The method and every constant are in `lib/engine.js`; tests are in `test/`. Numbers on the page always say which sources were live when they were made.
