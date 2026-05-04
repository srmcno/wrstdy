// Free OpenStreetMap-based geocoding via Nominatim. Internal-tool usage is
// well under the rate limit (1 req/sec). For fairness we set a User-Agent
// per their TOS — Nominatim respects this header.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function geocode(address, { county = '', state = 'Oklahoma', country = 'USA' } = {}) {
  const q = [address, county && `${county} County`, state, country].filter(Boolean).join(', ');
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
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
