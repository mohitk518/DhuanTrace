// CPCB National AQI helpers (breakpoints from the CPCB NAQI technical document)
const BP = {
  pm25: [[0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200], [91, 120, 201, 300], [121, 250, 301, 400], [251, 500, 401, 500]],
  pm10: [[0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200], [251, 350, 201, 300], [351, 430, 301, 400], [431, 600, 401, 500]],
};

function subIndex(pollutant, conc) {
  if (conc == null || !isFinite(conc)) return null;
  const table = BP[pollutant];
  const c = Math.max(0, conc);
  for (const [lo, hi, ilo, ihi] of table) {
    if (c <= hi + 0.999) return Math.round(ilo + ((ihi - ilo) / (hi - lo)) * (Math.min(c, hi) - lo));
  }
  return 500;
}

const BANDS = [
  [50, 'Good', '#3AA757'], [100, 'Satisfactory', '#8DBB3A'], [200, 'Moderate', '#D9A91E'],
  [300, 'Poor', '#EB7A1F'], [400, 'Very poor', '#D12B3F'], [Infinity, 'Severe', '#7B1E3A'],
];
function category(aqi) {
  const b = BANDS.find((x) => aqi <= x[0]);
  return { name: b[1], color: b[2] };
}

// AQI time series from hourly PM concentrations using a trailing 24-hour mean, as CPCB does for PM
function aqiSeries(times, pm25, pm10) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const from = Math.max(0, i - 23);
    const mean = (arr) => {
      let s = 0, n = 0;
      for (let j = from; j <= i; j++) if (arr[j] != null) { s += arr[j]; n++; }
      return n ? s / n : null;
    };
    const a = subIndex('pm25', mean(pm25));
    const b = subIndex('pm10', mean(pm10));
    out.push({ t: times[i], aqi: Math.max(a ?? 0, b ?? 0) });
  }
  return out;
}

// Inverse of subIndex: the concentration that gives a CPCB sub-index (used to compare sensors with stations)
function concFromIndex(pollutant, index) {
  if (index == null || !isFinite(index)) return null;
  for (const [lo, hi, ilo, ihi] of BP[pollutant]) {
    if (index <= ihi) return lo + ((Math.max(index, ilo) - ilo) * (hi - lo)) / (ihi - ilo);
  }
  return BP[pollutant][BP[pollutant].length - 1][1];
}

module.exports = { subIndex, category, aqiSeries, concFromIndex, BANDS };
