// Region packs: everything that ties DhuanTrace to one place lives in regions/<id>.json — districts, cities,
// borders, corridors, industrial areas, federated regions, the station network and the pollution boards.
// Choose one with REGION (default "mp"). A new Indian state, or a region in another country, is a new file;
// the engine, forecast, alerts and API stay the same. See SCALING.md.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'regions');

function validate(r, file) {
  const need = ['id', 'name', 'name_hi', 'short', 'country', 'home_states', 'bbox', 'grid', 'analysis_bounds', 'districts', 'pop', 'cities', 'neighbour_towns', 'neighbour_cities', 'corridors', 'industrial', 'fed_regions', 'sample'];
  const missing = need.filter((k) => r[k] == null);
  if (missing.length) throw new Error(`${file}: missing ${missing.join(', ')}`);
  const names = new Set(r.districts.map((d) => d[0]));
  const lost = r.cities.filter((c) => !names.has(c));
  if (lost.length) throw new Error(`${file}: cities not among the districts: ${lost.join(', ')}`);
  return r;
}

function load(id = process.env.REGION || 'mp') {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error(`REGION must be a pack name like "mp", got "${id}"`);
  const file = path.join(DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`No region pack regions/${id}.json. Available: ${available().join(', ')}`);
  return validate(JSON.parse(fs.readFileSync(file, 'utf8')), `regions/${id}.json`);
}
const available = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

const R = load();
const HOME = new Set(R.home_states.map((h) => h.state));
const isHome = (state) => HOME.has(state);
const homeOf = (state) => R.home_states.find((h) => h.state === state) || R.home_states[0];

// Public summary for the page and the API (no internal lists)
const summary = () => ({
  id: R.id, name: R.name, name_hi: R.name_hi, short: R.short, country: R.country, aqi_scale: R.aqi_scale || 'CPCB NAQI',
  home_states: R.home_states.map(({ state, state_hi, board_en, board_hi }) => ({ state, state_hi, board_en, board_hi })),
  districts: R.districts.length, cities: R.cities.length, corridors: R.corridors.length,
  neighbours: R.neighbour_towns.map((n) => n[0]), bbox: R.bbox, available: available(),
});

module.exports = { R, load, validate, available, isHome, homeOf, summary };
