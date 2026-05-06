// Free OpenStreetMap-based geocoding via Nominatim. Browser fetches cannot set
// the User-Agent header, so direct browser calls identify only as the browser and
// are best-effort for low-volume/internal use. Production or higher-volume
// deployments should route geocoding through a server-side proxy that sends a
// policy-compliant User-Agent with contact information.

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_ENDPOINT = import.meta.env.VITE_GEOCODE_ENDPOINT || DEFAULT_ENDPOINT;
const REQUEST_INTERVAL_MS = 1100;

let nextRequestAt = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleGeocodeRequest() {
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + REQUEST_INTERVAL_MS;
  if (delay > 0) await wait(delay);
}

export async function geocode(address, { county = '', state = 'Oklahoma', country = 'USA' } = {}) {
  const q = [address, county && `${county} County`, state, country].filter(Boolean).join(', ');
  const url = `${GEOCODE_ENDPOINT}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  await throttleGeocodeRequest();
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Geocoding HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.length) throw new Error(`No location found for "${q}"`);
  return {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}
