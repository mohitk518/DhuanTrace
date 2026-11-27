// Gemini: photo reading and grounded, multilingual alert drafting.
const env = (k) => (process.env[k] || '').trim();
const { R: REGION, homeOf } = require('./region');
const board = (state) => homeOf(state); // the pollution control board of a home state (or the first one)
const MODELS = () => [env('GEMINI_MODEL') || 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'].filter((m, i, a) => a.indexOf(m) === i);

let lastModel = null, lastError = null;

// Tries the last model that worked first, then the others. A busy model (HTTP 429/503) gets one quick retry.
// The whole call has a deadline, so the page falls back to its own summary in seconds, not minutes.
const DEADLINE_MS = () => +env('GEMINI_DEADLINE_MS') || 25000;
async function callGemini(parts, temperature = 0.2) {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const end = Date.now() + DEADLINE_MS();
  const order = lastModel ? [lastModel, ...MODELS().filter((m) => m !== lastModel)] : MODELS();
  let err;
  for (const model of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = end - Date.now();
      if (left < 1500) { err = err || new Error('Gemini took too long'); break; }
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature, responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(Math.min(20000, left)),
        });
        const j = await res.json();
        if (!res.ok) throw Object.assign(new Error(`${model}: HTTP ${res.status} ${(j.error && j.error.message) || ''}`.trim()), { busy: res.status === 429 || res.status === 503 });
        const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        const out = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
        lastModel = model; lastError = null;
        return out;
      } catch (e) {
        err = e;
        if (e.busy && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
        break;
      }
    }
  }
  lastError = err.message;
  throw err;
}

// Why Gemini did not answer, in words for the page
function geminiReason(e) {
  const m = String(e && e.message || '');
  if (/not set/.test(m)) return { en: 'Gemini is not connected', hi: 'Gemini जुड़ा नहीं है' };
  if (/HTTP (429|503)|high demand|too long|timeout|abort/i.test(m)) return { en: 'Gemini is busy right now', hi: 'Gemini अभी व्यस्त है' };
  return { en: 'Gemini could not answer', hi: 'Gemini जवाब नहीं दे सका' };
}

const SOURCE_TYPES = ['crop_residue_burning', 'garbage_burning', 'industrial_emission', 'construction_dust', 'vehicle_exhaust', 'forest_fire', 'not_pollution'];

async function classifyPhoto({ base64, mime, lat, lon, localTime, nearbyFires }) {
  const prompt = `You are an air-pollution field analyst for ${REGION.name}, ${REGION.country}. A citizen sent this photo.
Location: ${lat.toFixed(4)}, ${lon.toFixed(4)}. Local time: ${localTime}. Satellite fire detections within 10 km in the last 24 h: ${nearbyFires}.
Look only at what is visible. Return JSON with exactly these keys:
{"is_pollution_event": boolean,
 "source_type": one of ${JSON.stringify(SOURCE_TYPES)},
 "visible_fire": boolean,
 "smoke_density": "low" | "medium" | "high",
 "confidence": number between 0 and 1,
 "explanation": one plain sentence (max 25 words) naming the visual evidence,
 "explanation_hi": the same sentence in Hindi,
 "authenticity": {
   "photo_of_screen_or_print": boolean (a photo of a monitor, phone screen or printed page),
   "looks_ai_generated_or_stock": boolean (synthetic look, watermark, stock-photo framing),
   "lighting": "day" | "dusk" | "night" | "unclear",
   "scene": "rural" | "urban" | "industrial" | "indoor" | "unclear",
   "notes": short phrase, or "" if nothing looks wrong}}
If the photo is unrelated to smoke, fire or dust, set is_pollution_event false and source_type "not_pollution".
Judge authenticity from the image alone; do not assume a photo is fake without a visible reason.`;
  const out = await callGemini([{ text: prompt }, { inlineData: { mimeType: mime, data: base64 } }], 0.1);
  if (!SOURCE_TYPES.includes(out.source_type)) out.source_type = 'not_pollution';
  out.confidence = Math.max(0, Math.min(1, +out.confidence || 0));
  if (!['low', 'medium', 'high'].includes(out.smoke_density)) out.smoke_density = 'medium';
  const au = out.authenticity && typeof out.authenticity === 'object' ? out.authenticity : {};
  out.authenticity = {
    photo_of_screen_or_print: au.photo_of_screen_or_print === true,
    looks_ai_generated_or_stock: au.looks_ai_generated_or_stock === true,
    lighting: ['day', 'dusk', 'night', 'unclear'].includes(au.lighting) ? au.lighting : 'unclear',
    scene: ['rural', 'urban', 'industrial', 'indoor', 'unclear'].includes(au.scene) ? au.scene : 'unclear',
    notes: String(au.notes || '').slice(0, 120),
  };
  out.model = lastModel;
  return out;
}

const LANGS = { en: 'English', hi: 'Hindi', mr: 'Marathi', ur: 'Urdu', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', gu: 'Gujarati' };

async function draftAlert(facts, lang) {
  const language = LANGS[lang] || 'English';
  const home = board((facts.top_district && facts.top_district.state) || facts.home_state);
  const top_state_text = home.state, board_text = home.board_en;
  const prompt = `Draft an official air-quality action alert in ${language} for Indian district authorities.
Use ONLY the facts in the JSON below. Do not invent numbers, names, places or dates. If a fact is missing, leave it out.
Keep it under 190 words, formal and specific. Ask for 2 or 3 concrete actions (field inspection of the named fire clusters before the 4–7 pm burning window, a public health advisory for children, elderly people and people with asthma, crop-residue machinery for the named villages' farmers).
Address it to the District Collector of top_district (a district in ${top_state_text}). If smoke_from_other_states is not empty, add one sentence naming those states and their shares, and ask the ${board_text} to share it with those states' pollution control boards; never address a Collector outside ${REGION.name}. If forecast_range_24h_peak is given, state the peak as that range.
Return JSON: {"to": string, "cc": string, "subject": string, "body": string}
FACTS: ${JSON.stringify(facts)}`;
  const out = await callGemini([{ text: prompt }], 0.3);
  out.model = lastModel;
  return out;
}

async function askCopilot(facts, question, lang) {
  const language = LANGS[lang] || 'English';
  const prompt = `You are DhuanTrace, an air-quality assistant for officials and citizens in ${REGION.name}.
Answer the question in ${language}, in at most 90 words, plainly and specifically.
Use ONLY the facts in the JSON below. Quote numbers exactly as given. If the facts do not answer the question, say what is known and what is not. Never invent data.
Times are Indian Standard Time. "aqi_points" means AQI added by farm-fire smoke. "share" is the percentage among farm-fire districts.
Return JSON: {"answer": string, "follow_ups": [up to 3 short follow-up questions in ${language}]}
QUESTION: ${JSON.stringify(question)}
FACTS: ${JSON.stringify(facts)}`;
  const out = await callGemini([{ text: prompt }], 0.2);
  out.model = lastModel;
  return out;
}

// Multimodal check: does a real satellite image show smoke drifting the way our wind model says?
async function verifyPlume({ base64, bbox, date, fires, modelBearing, district }) {
  const compass = (b) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((b % 360) + 360) % 360 / 45) % 8];
  const prompt = `You are a remote-sensing analyst. This is a NASA VIIRS true-colour satellite image (north is up) taken around 13:30 local time on ${date}.
It covers latitude ${bbox.s.toFixed(2)} to ${bbox.n.toFixed(2)} and longitude ${bbox.w.toFixed(2)} to ${bbox.e.toFixed(2)} around ${district} district, ${REGION.name}, ${REGION.country}.
Satellite fire detections in this image, as percentage positions from the left and top edges: ${JSON.stringify(fires)}.
Our wind model says smoke from these fires should drift toward bearing ${Math.round(modelBearing)} degrees (${compass(modelBearing)}).
Look only at the image. Thin grey-white smoke streaks usually start at fire points and stretch downwind; clouds are brighter, puffier and not anchored to fires.
Return JSON with exactly these keys:
{"image_usable": boolean (false if mostly cloud, blank or missing data),
 "smoke_visible": boolean,
 "plume_bearing_deg": number or null (direction the smoke drifts toward, 0 = north, 90 = east),
 "cloud_cover": "none" | "some" | "heavy",
 "agrees_with_model": boolean or null (null if no plume is visible),
 "confidence": number between 0 and 1,
 "explanation": one plain sentence (max 30 words) naming the visual evidence,
 "explanation_hi": the same sentence in Hindi}`;
  const out = await callGemini([{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }], 0.1);
  out.confidence = Math.max(0, Math.min(1, +out.confidence || 0));
  out.model = lastModel;
  return out;
}

function templateAnswer(f, lang, reason = { en: 'Gemini is not connected', hi: 'Gemini जुड़ा नहीं है' }) {
  const top = f.top_district;
  if (lang === 'hi') {
    return `${f.city_hi} का वर्तमान AQI ${f.aqi_now} (${f.aqi_now_category || ''}) है।` +
      (top ? ` खेतों की आग के धुएँ का सबसे बड़ा हिस्सा (${top.share}%) ${top.district_hi} से आ रहा है।` : ' अभी खेतों की आग का धुआँ नहीं पहुँच रहा है।') +
      (f.peak_aqi ? ` अगले 24 घंटों में अधिकतम AQI ${f.peak_aqi} अनुमानित है (${f.peak_time})।` : '') + ` (${reason.hi}, इसलिए यह सारांश है।)`;
  }
  return `AQI in ${f.city} is ${f.aqi_now} (${f.aqi_now_category || ''}).` +
    (top ? ` The largest share of farm-fire smoke (${top.share}%) comes from ${top.district} district.` : ' No farm-fire smoke is reaching the city right now.') +
    (f.peak_aqi ? ` The forecast peak in the next 24 hours is ${f.peak_aqi} at ${f.peak_time}.` : '') + ` (${reason.en}, so this is a summary.)`;
}

function templateAlert(f, lang) {
  const top = f.top_district;
  const B = board((top && top.state) || f.home_state);
  const other = (f.smoke_from_other_states || []).filter((x) => x.share_of_fire_smoke_pct >= 5);
  const crossEn = other.length ? `\n\nSmoke from across the border: ${other.map((x) => `${x.share_of_fire_smoke_pct}% from ${x.state}`).join(', ')}. ${B.board_en} is requested to share this with the ${other.map((x) => x.state).join(' and ')} Pollution Control Board${other.length > 1 ? 's' : ''}.` : '';
  const crossHi = other.length ? `\n\nराज्य के बाहर से धुआँ: ${other.map((x) => `${x.state_hi} से ${x.share_of_fire_smoke_pct}%`).join(', ')}। ${B.board_hi} से अनुरोध है कि यह जानकारी संबंधित राज्य बोर्ड के साथ साझा करें।` : '';
  if (!top && other.length) {
    return lang === 'hi'
      ? { to: `सदस्य सचिव, ${B.board_hi}`, cc: `नगर निगम आयुक्त, ${f.city_hi}`, subject: `${f.city_hi} की हवा में दूसरे राज्य की आग का धुआँ: AQI ${f.aqi_now}`, body: `${f.city_hi} का वर्तमान AQI ${f.aqi_now} है।${crossHi}` }
      : { to: `Member Secretary, ${B.board_en}`, cc: `Municipal Commissioner, ${f.city}`, subject: `Smoke from fires in another state in ${f.city}'s air: AQI ${f.aqi_now}`, body: `${f.city}'s current AQI is ${f.aqi_now}.${crossEn}` };
  }
  if (!top) {
    return lang === 'hi'
      ? { to: `नगर निगम आयुक्त, ${f.city_hi}`, cc: '', subject: `${f.city_hi}: अभी खेतों की आग का असर नहीं`, body: `${f.city_hi} की हवा में इस समय खेतों की आग का धुआँ नहीं पहुँच रहा है। वर्तमान AQI ${f.aqi_now ?? 'उपलब्ध नहीं'} है। कोई कार्रवाई आवश्यक नहीं।` }
      : { to: `Municipal Commissioner, ${f.city}`, cc: '', subject: `${f.city}: no farm-fire smoke reaching the city now`, body: `No farm-fire smoke is reaching ${f.city} at present. Current AQI is ${f.aqi_now ?? 'not available'}. No action is needed.` };
  }
  if (lang === 'hi') {
    return {
      to: `ज़िला कलेक्टर, ${top.district_hi}`, cc: `${B.board_hi} क्षेत्रीय कार्यालय; नगर निगम आयुक्त, ${f.city_hi}`,
      subject: f.peak_aqi > f.aqi_now ? `${f.city_hi} में अगले 24 घंटों में AQI ${f.peak_aqi} तक पहुँचने का अनुमान` : `${f.city_hi} की हवा में खेतों की आग का धुआँ: AQI ${f.aqi_now}`,
      body: `${f.city_hi} का वर्तमान AQI ${f.aqi_now} है। हवा के मार्ग के विश्लेषण से पता चलता है कि खेतों की आग के धुएँ का ${top.share}% हिस्सा ${top.district_hi} ज़िले से आ रहा है (${top.satellite_fires} उपग्रह से दर्ज आग, ${top.citizen_reports} नागरिक फ़ोटो रिपोर्ट; धुआँ लगभग ${top.travel_h} घंटे में पहुँचता है)।\n\nअनुरोधित कार्रवाई:\n1. आज शाम 4–7 बजे से पहले चिह्नित स्थानों पर निरीक्षण दल भेजें।\n2. ${f.city_hi} में बच्चों, बुज़ुर्गों और अस्थमा रोगियों के लिए स्वास्थ्य परामर्श जारी करें।\n3. प्रभावित गाँवों के किसानों को पराली प्रबंधन मशीनों की जानकारी दें।${crossHi}`,
    };
  }
  return {
    to: `District Collector, ${top.district}`, cc: `${B.board_en} regional office; Municipal Commissioner, ${f.city}`,
    subject: f.peak_aqi > f.aqi_now ? `${f.city} AQI forecast to reach ${f.peak_aqi} within 24 hours` : `Farm-fire smoke in ${f.city}'s air: AQI ${f.aqi_now}`,
    body: `${f.city}'s current AQI is ${f.aqi_now}. Air-path analysis shows ${top.share}% of the farm-fire smoke reaching the city comes from ${top.district} district (${top.satellite_fires} satellite-detected fires and ${top.citizen_reports} citizen photo reports; smoke takes about ${top.travel_h} hours to arrive).\n\nRequested action:\n1. Send inspection teams to the marked fire clusters before this evening's 4–7 pm burning window.\n2. Issue a health advisory in ${f.city} for children, elderly people and anyone with asthma.\n3. Share crop-residue machinery availability with farmers in the affected villages.${crossEn}`,
  };
}

function geminiStatus() {
  if (!env('GEMINI_API_KEY')) return { mode: 'sample', note: 'Add GEMINI_API_KEY to enable photo reading and alert drafting' };
  if (lastError) return { mode: 'error', note: lastError };
  return { mode: 'live', note: lastModel ? `Using ${lastModel}` : `Ready (${MODELS()[0]})` };
}

module.exports = { geminiReason, classifyPhoto, draftAlert, templateAlert, askCopilot, templateAnswer, verifyPlume, geminiStatus, LANGS };
