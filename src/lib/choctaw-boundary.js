// Default map center + zoom for the Choctaw Nation reservation area.
// The actual district boundaries come from src/lib/cno-districts.js
// (auto-simplified from CNOCD.geojson, the official Council Districts file).
export const CHOCTAW_CENTER = [34.55, -95.45];
export const CHOCTAW_ZOOM = 8;

// A small starter list of well-known Choctaw-area public water systems.
// Coordinates are approximate (county seat). These serve as map starting
// points; the map will render ALL studies the user creates, not just these.
export const KNOWN_SYSTEMS = [
  { name: 'McAlester Public Works Authority', county: 'Pittsburg', lat: 34.9334, lng: -95.7697, waterBody: 'McAlester Reservoir' },
  { name: 'City of Durant Utilities', county: 'Bryan', lat: 33.9937, lng: -96.3711, waterBody: 'Lake Texoma' },
  { name: 'Hugo Municipal Authority', county: 'Choctaw', lat: 34.0093, lng: -95.5119, waterBody: 'Hugo Lake' },
  { name: 'Idabel Public Works Authority', county: 'McCurtain', lat: 33.8959, lng: -94.8266, waterBody: 'Mountain Fork (Broken Bow Lake)' },
  { name: 'Antlers Public Works Authority', county: 'Pushmataha', lat: 34.2317, lng: -95.6219, waterBody: 'Moyers Creek' },
  { name: 'Atoka Municipal Water Authority', county: 'Atoka', lat: 34.3856, lng: -96.1289, waterBody: 'Atoka Reservoir' },
  { name: 'Poteau Water Department', county: 'Le Flore', lat: 35.0537, lng: -94.6232, waterBody: 'Wister Lake' },
  { name: 'Coalgate Public Works Authority', county: 'Coal', lat: 34.5359, lng: -96.2173, waterBody: 'Coalgate Reservoir' },
  { name: 'Tishomingo Public Works Authority', county: 'Johnston', lat: 34.2359, lng: -96.6783, waterBody: 'Pennington Creek' },
  { name: 'Wilburton Water Department', county: 'Latimer', lat: 34.9181, lng: -95.3097, waterBody: 'Robbers Cave SP watershed' },
];
