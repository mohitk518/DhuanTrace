// Places of the active region pack (regions/<REGION>.json, default Madhya Pradesh): district headquarters
// (approximate coordinates) used to name fire clusters, the cities in the picker, the fire search box, reference
// towns across the border and the big cities there.
const { R, isHome } = require('./region');

const HOME0 = R.home_states[0];
const DISTRICTS = R.districts.map(([name, hi, lat, lon, state]) => {
  const h = R.home_states.find((x) => x.state === state) || HOME0;
  return { name, hi, lat, lon, state: h.state, state_hi: h.state_hi };
});

// Approximate urban population, Census 2011 (urban agglomeration where one exists)
const POP = R.pop;

// Cities offered in the city picker (all are CPCB-monitored or district headquarters)
const CITIES = R.cities
  .map((n) => DISTRICTS.find((d) => d.name === n))
  .map((d) => ({ id: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: d.name, hi: d.hi, lat: d.lat, lon: d.lon, pop: POP[d.name] }));

// Fire search box: the home region plus a band of the neighbouring states whose smoke can reach it
const BBOX = R.bbox;

// Reference towns just across the border. A point belongs to the state of its nearest reference town among these
// and the home district headquarters: an approximate border, good to a few tens of kilometres, clearly not a legal line.
const NEIGHBOUR_TOWNS = R.neighbour_towns.flatMap(([state, state_hi, towns]) => towns.map(([name, lat, lon]) => ({ name, state, state_hi, lat, lon })));

// Big cities across the border that the home region's smoke can reach (approximate population)
const NEIGHBOUR_CITIES = R.neighbour_cities.map(([id, name, state, lat, lon, pop]) => ({ id, name, hi: name, state, lat, lon, pop }));

function km(a, b) {
  const dy = (a.lat - b.lat) * 111.2;
  const dx = (a.lon - b.lon) * 111.2 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

// Which state a point is in, by the nearest reference town (approximate border)
function stateOf(p) {
  let best = null, bd = Infinity;
  for (const d of DISTRICTS) { const x = km(p, d); if (x < bd) { bd = x; best = { state: d.state, state_hi: d.state_hi, town: d }; } }
  for (const t of NEIGHBOUR_TOWNS) { const x = km(p, t); if (x < bd) { bd = x; best = { state: t.state, state_hi: t.state_hi, town: t }; } }
  return bd <= 150 ? best : { state: 'Other', state_hi: 'अन्य', town: null };
}

// Home district for points in the region; for points across the border, the nearest reference town and its state
function nearestDistrict(p) {
  const s = stateOf(p);
  if (isHome(s.state)) return s.town;
  if (s.town) return { name: `${s.town.name} (${s.state})`, hi: `${s.town.name} (${s.state_hi})`, lat: s.town.lat, lon: s.town.lon, outside: true };
  return { name: `Outside ${R.short}`, hi: `${R.name_hi} के बाहर`, lat: p.lat, lon: p.lon, outside: true };
}

module.exports = { DISTRICTS, CITIES, BBOX, NEIGHBOUR_TOWNS, NEIGHBOUR_CITIES, POP, km, nearestDistrict, stateOf, isHome, REGION: R };
