// Inter-state smoke ledger: how much farm-fire smoke the home region (Madhya Pradesh by default) receives from each
// neighbouring state, and how much of its smoke reaches big cities across the border. The field names say "mp" for
// the home region whichever region pack is active. Published as an open bulletin
// (dhuantrace.interstate/1) that another state's system can read without sharing any raw data.
const { CITIES, NEIGHBOUR_CITIES } = require('./places');
const { R, isHome } = require('./region');

const round = (x) => Math.round(x);

// analyseAt(place) is the server's cached smoke analysis
async function compute(analyseAt, now = Date.now()) {
  // Into MP: smoke by source state in each MP city
  const inbound = [];
  const intoMp = new Map();
  for (const c of CITIES) {
    const a = await analyseAt(c);
    for (const x of a.by_state || []) {
      if (isHome(x.state)) continue;
      inbound.push({ city: c.name, from_state: x.state, aqi_points_now: x.aqi_points_now, aqi_points_incoming: x.aqi_points_incoming, share_now: x.share_now });
      const t = intoMp.get(x.state) || { state: x.state, state_hi: x.state_hi, cities: new Set(), people: 0, aqi_points_now: 0, aqi_points_incoming: 0 };
      if (!t.cities.has(c.name)) { t.cities.add(c.name); t.people += c.pop || 0; }
      t.aqi_points_now += x.aqi_points_now; t.aqi_points_incoming += x.aqi_points_incoming;
      intoMp.set(x.state, t);
    }
  }

  // Out of MP: smoke from MP fires in big cities across the border
  const outbound = [];
  const fromMp = new Map();
  for (const c of NEIGHBOUR_CITIES) {
    const a = await analyseAt(c);
    const homeRows = (a.by_state || []).filter((x) => isHome(x.state));
    if (!homeRows.length) continue;
    const mp = homeRows.reduce((t, x) => ({ aqi_points_now: t.aqi_points_now + x.aqi_points_now, aqi_points_incoming: t.aqi_points_incoming + x.aqi_points_incoming, share_now: t.share_now + x.share_now }), { aqi_points_now: 0, aqi_points_incoming: 0, share_now: 0 });
    const top = (a.attribution || []).filter((d) => !d.outside_mp).slice(0, 2).map((d) => d.district);
    outbound.push({ city: c.name, state: c.state, aqi_points_now: mp.aqi_points_now, aqi_points_incoming: mp.aqi_points_incoming, share_now: mp.share_now, mp_districts: top });
    const t = fromMp.get(c.state) || { state: c.state, cities: new Set(), people: 0, aqi_points_now: 0, aqi_points_incoming: 0 };
    if (!t.cities.has(c.name)) { t.cities.add(c.name); t.people += c.pop || 0; }
    t.aqi_points_now += mp.aqi_points_now; t.aqi_points_incoming += mp.aqi_points_incoming;
    fromMp.set(c.state, t);
  }

  const states = [...new Set([...intoMp.keys(), ...fromMp.keys()])].filter((s) => s !== 'Other').map((state) => {
    const i = intoMp.get(state), o = fromMp.get(state);
    return {
      state,
      into_mp: i ? { cities: [...i.cities], people_lakh: +(i.people / 1e5).toFixed(1), aqi_points_now: round(i.aqi_points_now), aqi_points_incoming: round(i.aqi_points_incoming) } : null,
      from_mp: o ? { cities: [...o.cities], people_lakh: +(o.people / 1e5).toFixed(1), aqi_points_now: round(o.aqi_points_now), aqi_points_incoming: round(o.aqi_points_incoming) } : null,
    };
  }).sort((a, b) => {
    const w = (x) => (x.into_mp ? x.into_mp.aqi_points_now + x.into_mp.aqi_points_incoming : 0) + (x.from_mp ? x.from_mp.aqi_points_now + x.from_mp.aqi_points_incoming : 0);
    return w(b) - w(a);
  });

  return {
    schema: 'dhuantrace.interstate/1', issued_by: `DhuanTrace node: ${R.name}`, home_region: R.name, generated_at: now,
    units: 'AQI points added by farm-fire smoke (screening estimate), summed over the cities listed',
    border_note: 'State of each fire is taken from the nearest district headquarters or border town: an approximate border, not a legal one.',
    states, inbound: inbound.sort((a, b) => b.aqi_points_now - a.aqi_points_now), outbound: outbound.sort((a, b) => b.aqi_points_now + b.aqi_points_incoming - a.aqi_points_now - a.aqi_points_incoming),
    cities_checked: { mp: CITIES.length, neighbours: NEIGHBOUR_CITIES.length },
  };
}

module.exports = { compute };
