// Approximate outline of the Choctaw Nation Reservation in southeastern
// Oklahoma — the 10.5 counties recognized as the historic treaty boundary.
// This is a SIMPLIFIED polygon for visual reference only; replace with
// official BIA / Census TIGER data when you need pixel-accurate borders.
//
// Reference points trace roughly: Arkansas River north, Red River south,
// Texas border west of McCurtain, Arkansas state line east.
export const CHOCTAW_BOUNDARY = [
  // [lat, lng] pairs going clockwise
  [35.55, -96.30], // Hughes County NW
  [35.55, -95.40], // Pittsburg / McIntosh north
  [35.45, -94.95], // Haskell County NE
  [35.10, -94.43], // Le Flore County NE (Arkansas border)
  [34.50, -94.43],
  [33.85, -94.43], // Le Flore / McCurtain SE corner
  [33.62, -94.48], // McCurtain SE — Red River turn
  [33.65, -95.10],
  [33.78, -95.55],
  [33.85, -95.95],
  [33.85, -96.40], // Bryan County south
  [33.92, -96.65], // Bryan / Marshall transition
  [34.10, -96.65], // Atoka W
  [34.40, -96.55], // Coal W
  [34.65, -96.50], // Pittsburg W
  [34.95, -96.40], // Hughes S
  [35.30, -96.35],
  [35.55, -96.30], // close
];

// Approximate centroid for default map view
export const CHOCTAW_CENTER = [34.55, -95.45];
export const CHOCTAW_ZOOM = 8;

// A small starter list of well-known Choctaw-area public water systems.
// Coordinates are approximate (county seat). These are seeded from public
// info and serve as map starting points; replace with a curated DEQ-sourced
// list when available. The map will render ALL studies the user creates,
// not just these.
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
