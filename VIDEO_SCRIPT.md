# DhuanTrace: final demo video script (4 minutes)

**Before recording:** refresh the page and wait 2–3 minutes. Words in [square brackets] are numbers or names you read off the screen at that moment; they change every hour with the data. The values shown are from 30 Sept, 7:30 p.m.

**Speak in simple English.** Judges may come from any state and from Google, and not all of them follow Hindi. The Hindi alert and the Hindi voice question inside the demo show the multilingual part. (If you prefer Hinglish, add English subtitles.)

Record the app (laptop or deployed link) in Chrome, full screen, with a clear microphone. Open the page 2–3 minutes before recording so the satellite checks are ready. Times are a guide.

**0:00–0:30 · Hook: the blind spot (open straight on the chart, not on a title)**
Screen: "When do the satellites look?" chart.
"This is live NASA fire data for central India from the last 48 hours: [279] fire detections. [95]% of them were seen at just two moments, 1:30 at night and 1:30 in the afternoon, when the satellites pass overhead. Between 4 and 8 in the evening, when most farmers actually burn: zero. Nobody is watching when it matters. We are team Sant, Mohit Katara and Divyansh Mathur, and this is DhuanTrace."

**0:30–1:05 · Whose smoke is this?**
Scroll up to the map. Choose a city whose "Whose fires are in this air" box names a district (on 30 Sept evening: Dewas or Ujjain; Indore had no smoke then). Point at the smoke paths and that box.
"DhuanTrace follows every fire's smoke on the hourly wind for 36 hours. For [Dewas] right now, [92]% of the farm-fire smoke comes from [Dewas] district, and it takes about [X] hours to arrive. Below is a 48-hour forecast: not one number, but an honest range."

**1:05–1:45 · Citizen photo + Gemini (Google AI)**
Click a field on the map → "Report smoke here" → upload a smoke photo.
"The evening fires the satellites miss come from citizens. Google Gemini reads the photo: what is burning, how much smoke, and whether the photo was taken off a screen or made by AI. Each photo gets a trust score, low-trust photos are left out, and the public map rounds the location to about 1 km for privacy."

**1:45–2:20 · Alert to the right officer, in Hindi, and a voice question**
Keep the same city. Choose हिंदी at the top, then "अलर्ट बनाएँ". Then press the mic and ask in Hindi: "आज रात कौन सी आग पहले रोकनी चाहिए?"
"The whole app switches to Hindi, and alerts come in 8 Indian languages. Gemini writes the alert only from our computed numbers, addressed to the Collector of the district that can act. It is a draft; an official sends it. We name districts, never farmers. Officials can also just ask by voice."

**2:20–3:00 · Hidden hotspots, corridors, federated network**
Scroll through the three panels.
"Pollution that the fires and the forecast can't explain is flagged as a hidden hotspot, checked against NASA's aerosol and NO₂ images. Here it is shown with an example sensor near Pithampur. Six industrial corridors get a 48-hour spike alert. And the federated network: four separate programs train one model together over signed messages and share only model weights. The coordinator received zero rows of data."

**3:00–3:35 · Scale across India and BRICS**
Scroll to the top of the map. Point the mouse at the small grey line under the map heading ("Region pack: mp … also ready: punjab-haryana"). You don't need to remember anything: just read that line and say:
"Every state is one small settings file. Madhya Pradesh runs here, and a second state, Punjab–Haryana, is already ready in the same code. The satellites, wind and forecasts we use cover every BRICS country, so the same approach works there too."

**3:35–4:00 · Trust and deployment**
Show the system health panel and the Track 02 table.
"It runs on Google Cloud Run, with Cloud Storage and an hourly Cloud Scheduler job. Every forecast is written down first and checked against CPCB later, and 228 automated tests run on every change. DhuanTrace: where the smoke came from, who to tell, and how much time is left."

If CPCB still shows sample data on the day, add one line: "The government CPCB server was down today, so station values are labelled sample; the rest is live." The app already labels it.

Recording tips: record in 2–3 short takes and join them; keep the mouse slow; zoom the browser to 110% so text is readable; check the audio in the first 10 seconds before recording the rest.
