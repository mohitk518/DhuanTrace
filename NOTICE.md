# Data sources, libraries and credits

DhuanTrace's own code is under the MIT licence (see LICENSE). It has no npm dependencies. It uses the following
services and libraries, each under its own terms:

| What | Used for | Terms |
|---|---|---|
| NASA FIRMS (VIIRS S-NPP, NOAA-20, NOAA-21, MODIS) | Active fire detections | NASA open data; cite "NASA FIRMS" |
| NASA GIBS (VIIRS true colour, MODIS MAIAC AOD, Aura OMI NO₂) | Satellite images and hotspot evidence | NASA open data; cite "NASA GIBS / EOSDIS" |
| CPCB real-time AQI via data.gov.in | Station AQI | Government Open Data License – India |
| World Air Quality Index Project (aqicn.org) | Backup station AQI | Attribution to WAQI and the originating agency is required; not for paid services |
| Open-Meteo (weather and CAMS air-quality API) | Hourly wind, PM2.5/PM10 forecast | CC BY 4.0; Copernicus Atmosphere Monitoring Service data |
| Google Gemini API | Photo reading, alert drafting, questions, plume check | Google API terms |
| Google Cloud Run, Cloud Storage, Cloud Scheduler | Hosting, saved data, hourly jobs | Google Cloud terms |
| Leaflet 1.9.4 (cdnjs) | Map | BSD-2-Clause |
| OpenStreetMap tiles | Base map | © OpenStreetMap contributors, ODbL |
| Google Fonts (Bricolage Grotesque, IBM Plex, Noto Sans Devanagari) | Type | SIL Open Font License |

Census 2011 urban populations are approximate and used only to rank districts by people exposed.

## How it was built

Built by team Sant (Mohit Katara and Divyansh Mathur) during the hackathon, with an AI coding assistant helping to write and review the code. The
team chose the problem and the region and decided what to build. Every result is checked by 228 automated tests that
run on each change, and the method, its constants and its limits are written down in MODEL_CARD.md.
