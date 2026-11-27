# Pitch and demo script

Hackathon submission package: GitHub repo · demo video 3–5 min · pitch deck 10–12 slides · 2–3 line description · deployed link.

## 4-minute demo video (hackathon asks for 3–5 minutes)

**Speak in simple English.** Judges may come from any state and from Google, and not all of them follow Hindi. The Hindi alert and the Hindi voice question inside the demo show the multilingual part. (If you prefer Hinglish, add English subtitles.)

Record the deployed link in Chrome, full screen, with a clear microphone. Open the page 2–3 minutes before recording so the satellite checks are ready. Times are a guide.

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

## Numbers to say in the video (from the live app, 29 Sept)

- "Pichhle 48 ghante mein NASA ke 4 satellite feeds ne 300 aag pakdi. Inme se 98% sirf do waqt pe dikhi: raat 1:30 aur dopahar 1:30. Shaam 4 se 8 ke beech, jab kisan jalate hain: **zero**." (App ka "When do the satellites look?" chart dikhao.)
- "12 shehar, lagbhag 88 lakh log; 51 district; seema paar ke 8 shehar, 1 crore log."
- "Indore tak dhuan pahunchne se 2 ghante pehle, Dewas ke liye 5 ghante pehle chetawani."
- "App 200 log ek saath chalayein to bhi 2,500 requests har second, 0 errors."
(Video ke din app mein naye numbers dekh lena; roz badalte hain.)

## Brief description (2–3 lines, for the form)

DhuanTrace finds the evening farm fires that satellites miss, traces whose smoke is reaching each city, and uses Google Gemini to draft the alert for the district that can act, in 8 Indian languages. It combines live NASA fire data, wind, the CAMS forecast and citizen photos into a 48-hour forecast, hidden-hotspot detection and federated learning across states, and runs on Google Cloud Run.

## Longer description (if the form has room)

DhuanTrace finds the farm fires that satellites miss, traces whose smoke is reaching a city, and drafts the alert for the district that can act.

Polar-orbiting fire satellites pass over India around 1:30 p.m., but farmers now burn mostly between 4 and 6 p.m., so many fires are never detected, and air-quality tools stop at showing the AQI without naming the cause. DhuanTrace combines live NASA FIRMS detections (four satellite feeds), CPCB real-time AQI, Open-Meteo hourly wind and the CAMS air-quality forecast. Citizens send photos of evening burning; Gemini 3.7 Flash classifies the source and adds it as a fire the satellites missed. Every fire's smoke is followed on the wind field for 36 hours, which tells each city which districts' fires are in its air and what share each contributes. The forecast adds the smoke from citizen-reported fires that the CAMS model cannot see. Gemini then drafts a grounded alert to the right district collector in eight Indian languages, and answers officials' typed or spoken questions from the same data. A statewide ranking shows which districts' fires put smoke into the most people's air, so teams can be sent before the evening burning window, and a 48-hour replay shows smoke travelling from fields to cities. Each city publishes its forecast and attribution as an open JSON packet, so cities and states can share results. Separate federated nodes for MP regions and Rajasthan train one forecast-correction model together over signed HTTP, exchanging only model weights; every reply is checked so the coordinator receives no data rows. Hidden pollution hotspots are checked against NASA's aerosol and NO₂ satellite layers. Every forecast is written down before its time and scored against CPCB afterwards. A traceability table maps each line of the problem statement to features, tests and a live check; every endpoint is described in OpenAPI 3.1, and 228 offline tests run in CI. Region packs make a new state one JSON file: Madhya Pradesh and Punjab–Haryana are built, including smoke crossing into Pakistan, and SCALING.md shows what a BRICS country needs. It runs on Cloud Run and focuses on central India, where farm fires get little attention.

## Why this is different from other entries (sirf aapke liye)

- Doosri teams "photo + satellite + AQI forecast" bana rahi hain, mostly Delhi-NCR ke liye. Hum **central India** aur **shaam ki aag jo satellite miss karta hai** pe hain.
- Hum sirf AQI nahi dikhate. Hum **district ka naam aur percentage** batate hain, aur **usi district ke Collector** ko alert jaata hai.
- Hamara forecast CAMS model se **aage** jaata hai: citizen reports ka dhuan add karta hai, jo koi aur nahi karta.
- **Open JSON packet** se interoperability requirement asli mein poori hoti hai.

## Judges ke common sawal

- **"Numbers kitne sahi hain?"** Ye screening-level estimates hain. MODEL_CARD.md mein har constant, har assumption, kya check hua aur kya nahi, sab likha hai. Forecast ledger har forecast pehle likhta hai aur baad mein CPCB se milata hai; jab tak live CPCB ke kuch din ka data nahi hota, hum koi accuracy number claim nahi karte. Agle 4 hafte ka validation plan bhi card mein hai (HYSPLIT se comparison, constants ki fitting).
- **"Fake photos ka kya?"** Har photo ko trust score milta hai: photo ke andar ka time aur GPS (EXIF), wahi photo dobara (exact aur resized dono), screen ki photo ya AI image (Gemini), aur paas ki satellite fires. 25% se kam bharose wali report forecast mein nahi jaati. Spam ke liye har address pe rate limit hai.
- **"Federated asli hai ya simulation?"** Network asli hai: alag processes, alag ports, signed HTTP messages, aur test mein data chori karne wala node pakda jata hai. Data abhi simulated hai jab tak live CPCB rows jama nahi hoti; app ye saaf likhta hai.
- **"Google Cloud kaise use kiya?"** Cloud Run pe chalta hai; Cloud Storage mein saara data save hota hai (restart pe kho nahi jaata); Cloud Scheduler har ghante ledger chalata hai; Gemini photo, alert aur sawal-jawab ke liye.
- **"Security?"** SECURITY.md mein threat model hai: rate limit, size/type check, Content Security Policy, signed federated messages, non-root container. Jo abhi nahi hai (login, har node ki alag key) wo bhi likha hai.
- **"Scale kaise karega?"** Har state ek region pack (ek JSON file) hai; MP aur Punjab–Haryana dono bane hain aur test mein poora server Punjab–Haryana pe chalta hai. Har state ka alag node, open packet aur federated model se jude. BRICS: NASA fires, hawa, CAMS global hain; sirf national AQI function aur alert bhasha likhni hai (SCALING.md, imaandaari se likha hai ki ye abhi baaki hai).
