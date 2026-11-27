// Hindi mode: the dictionary covers every static label, every tour caption and the key number patterns
const fs = require('fs'), path = require('path'), vm = require('vm');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const root = path.join(__dirname, '..', 'static');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Run i18n.js with a minimal browser stand-in
const sandbox = { window: {}, location: { search: '' }, localStorage: { getItem: () => null, setItem() {} }, URLSearchParams, CustomEvent: class {}, setTimeout,
  MutationObserver: class { observe() {} }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
  document: { readyState: 'complete', getElementById: () => null, body: {}, documentElement: {}, addEventListener() {} } };
sandbox.window.dispatchEvent = () => {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), sandbox);
const { HI, hiFor } = sandbox.window.dtI18n;

// Static labels: text between tags in the page body (skipping code, API paths and brand names)
const body = html.slice(html.indexOf('<body>'), html.indexOf('<script src='));
const texts = [...body.matchAll(/>([^<>]+)</g)].map((m) => m[1].replace(/\s+/g, ' ').trim())
  .filter((t) => /[a-z]{2}/i.test(t) && !/^(\/api\/|node |FED_|dhuantrace\.|Dhuan$|Trace$|aqicn\.org|CPCB$|CAMS$|DhuanTrace$|PM2\.5$|PM10$)/.test(t) && !/^[A-Z0-9_ .·\-]+$/.test(t))
  .filter((t) => !/^NASA FIRMS \(VIIRS|^CPCB real-time AQI|^\) as automatic backup|^, and list their|^\. Protocol:|^on each state's server|^Real deployment: run$/.test(t)); // footer source list and code notes stay in English
const missing = [...new Set(texts)].filter((t) => !hiFor(t));
assert(!missing.length, `every page label has Hindi (${texts.length} checked)${missing.length ? ' — missing: ' + missing.slice(0, 8).join(' | ') : ''}`);

// Tour captions
const tour = [...html.matchAll(/\{ el: [^}]*?t: '((?:[^'\\]|\\.)*)', x: '((?:[^'\\]|\\.)*)'/g)].flatMap((m) => [m[1], m[2]]).map((s) => s.replace(/\\'/g, "'"));
assert(tour.length === 20 && tour.every((t) => HI[t]), `all ${tour.length / 2} tour steps have Hindi captions${tour.filter((t) => !HI[t]).length ? ' — missing: ' + tour.filter((t) => !HI[t]).join(' | ') : ''}`);

// Patterns keep the numbers
assert(hiFor('194 detections shown') === '194 आग दिख रही हैं', 'numbers carried into Hindi text');
assert(hiFor('Unexplained excess: +186 AQI points, 3.3 times the typical spread across 18 measuring points.').includes('+186'), 'hotspot evidence translated with its numbers');
assert(hiFor('Moderate') === 'मध्यम' && hiFor('Very poor') === 'बहुत खराब', 'CPCB categories use the Hindi CPCB terms');
assert(hiFor('Some sentence nobody translated') === null, 'unknown text is left as it is, never guessed');
