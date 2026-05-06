// The map now renders the actual TIGER/Line CNO Council District polygons
// from /src/assets/cno-districts.json. The hand-traced CHOCTAW_BOUNDARY array
// that lived here has been removed; downstream code should rely on the
// district geojson layer instead.

// Approximate centroid for default map view (used before the geojson loads).
export const CHOCTAW_CENTER = [34.55, -95.45];
export const CHOCTAW_ZOOM = 8;

// Curated reference list of public water systems in the Choctaw Nation
// 10.5-county area. Coordinates are county-seat / municipal centers; sources
// reflect the system's primary raw-water source where publicly known.
//
// Field reference:
//   name           — display name
//   county         — Oklahoma county (must match COUNTIES list)
//   lat / lng      — display coordinates
//   waterBody      — primary source (lake, river, aquifer, purchased-from)
//   sourceType     — 'surface' | 'groundwater' | 'purchased' | 'mixed'
//   systemType     — 'community' | 'ntnc' | 'tnc'
//   address        — street/city used to seed Step 1 if user starts a study
//   populationServed — approximate; used as a starting estimate
//
// All values are best-effort starting points the user can edit. PWS IDs are
// intentionally omitted because they require official DEQ confirmation.
export const KNOWN_SYSTEMS = [
  // Atoka County
  { name: 'Atoka Municipal Water Authority', county: 'Atoka', lat: 34.3856, lng: -96.1289, waterBody: 'Atoka Reservoir / McGee Creek', sourceType: 'surface', systemType: 'community', address: 'Atoka, OK', populationServed: '3000' },
  { name: 'Stringtown Public Works Authority', county: 'Atoka', lat: 34.4669, lng: -96.0566, waterBody: 'Atoka Reservoir (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Stringtown, OK', populationServed: '450' },
  { name: 'Caney Public Works Authority (RWD #3)', county: 'Atoka', lat: 34.2342, lng: -96.2167, waterBody: 'Caney Creek wells', sourceType: 'groundwater', systemType: 'community', address: 'Caney, OK', populationServed: '200' },
  // Bryan County
  { name: 'City of Durant Utilities', county: 'Bryan', lat: 33.9937, lng: -96.3711, waterBody: 'Lake Texoma (Red River)', sourceType: 'surface', systemType: 'community', address: 'Durant, OK', populationServed: '18500' },
  { name: 'Calera Public Works Authority', county: 'Bryan', lat: 33.9304, lng: -96.4239, waterBody: 'Durant (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Calera, OK', populationServed: '2200' },
  { name: 'Caddo Public Works Authority', county: 'Bryan', lat: 34.1273, lng: -96.2628, waterBody: 'McGee Creek (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Caddo, OK', populationServed: '1000' },
  { name: 'Bokchito Public Works Authority', county: 'Bryan', lat: 34.0207, lng: -96.1505, waterBody: 'Bryan RWD #5 (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Bokchito, OK', populationServed: '600' },
  // Choctaw County
  { name: 'Hugo Municipal Authority', county: 'Choctaw', lat: 34.0093, lng: -95.5119, waterBody: 'Hugo Lake (Kiamichi River)', sourceType: 'surface', systemType: 'community', address: 'Hugo, OK', populationServed: '5300' },
  { name: 'Soper Public Works Authority', county: 'Choctaw', lat: 34.0237, lng: -95.6878, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Soper, OK', populationServed: '300' },
  { name: 'Fort Towson Public Works Authority', county: 'Choctaw', lat: 34.0270, lng: -95.2659, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Fort Towson, OK', populationServed: '600' },
  { name: 'Boswell Public Works Authority', county: 'Choctaw', lat: 34.0331, lng: -95.8702, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Boswell, OK', populationServed: '650' },
  // Coal County
  { name: 'Coalgate Public Works Authority', county: 'Coal', lat: 34.5359, lng: -96.2173, waterBody: 'Coalgate Reservoir', sourceType: 'surface', systemType: 'community', address: 'Coalgate, OK', populationServed: '1900' },
  { name: 'Tupelo Public Works Authority', county: 'Coal', lat: 34.5950, lng: -96.4222, waterBody: 'Sardis Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Tupelo, OK', populationServed: '350' },
  // Haskell County
  { name: 'Stigler Public Works Authority', county: 'Haskell', lat: 35.2536, lng: -95.1308, waterBody: 'Stigler Lake', sourceType: 'surface', systemType: 'community', address: 'Stigler, OK', populationServed: '2700' },
  { name: 'Keota Public Works Authority', county: 'Haskell', lat: 35.2581, lng: -94.9224, waterBody: 'Wister Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Keota, OK', populationServed: '550' },
  { name: 'Quinton Public Works Authority', county: 'Haskell', lat: 35.1228, lng: -95.3724, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Quinton, OK', populationServed: '950' },
  // Hughes County
  { name: 'Holdenville Public Works Authority', county: 'Hughes', lat: 35.0820, lng: -96.3992, waterBody: 'Holdenville Lake', sourceType: 'surface', systemType: 'community', address: 'Holdenville, OK', populationServed: '5500' },
  { name: 'Wetumka Public Works Authority', county: 'Hughes', lat: 35.2378, lng: -96.2406, waterBody: 'Wetumka Lake', sourceType: 'surface', systemType: 'community', address: 'Wetumka, OK', populationServed: '1300' },
  // Latimer County
  { name: 'Wilburton Water Department', county: 'Latimer', lat: 34.9181, lng: -95.3097, waterBody: 'Robbers Cave SP watershed', sourceType: 'surface', systemType: 'community', address: 'Wilburton, OK', populationServed: '2900' },
  { name: 'Red Oak Public Works Authority', county: 'Latimer', lat: 34.9525, lng: -95.0731, waterBody: 'Wister Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Red Oak, OK', populationServed: '550' },
  // Le Flore County
  { name: 'Poteau Water Department', county: 'Le Flore', lat: 35.0537, lng: -94.6232, waterBody: 'Wister Lake (Poteau River)', sourceType: 'surface', systemType: 'community', address: 'Poteau, OK', populationServed: '8500' },
  { name: 'Heavener Utilities Authority', county: 'Le Flore', lat: 34.8868, lng: -94.6019, waterBody: 'Holson Creek wells', sourceType: 'groundwater', systemType: 'community', address: 'Heavener, OK', populationServed: '3300' },
  { name: 'Spiro Public Works Authority', county: 'Le Flore', lat: 35.2403, lng: -94.6225, waterBody: 'Arkansas River alluvium wells', sourceType: 'groundwater', systemType: 'community', address: 'Spiro, OK', populationServed: '2100' },
  { name: 'Talihina Public Works Authority', county: 'Le Flore', lat: 34.7484, lng: -95.0397, waterBody: 'Holson Valley wells', sourceType: 'groundwater', systemType: 'community', address: 'Talihina, OK', populationServed: '1100' },
  { name: 'Wister Public Works Authority', county: 'Le Flore', lat: 34.9582, lng: -94.7244, waterBody: 'Wister Lake', sourceType: 'surface', systemType: 'community', address: 'Wister, OK', populationServed: '1100' },
  // McCurtain County
  { name: 'Idabel Public Works Authority', county: 'McCurtain', lat: 33.8959, lng: -94.8266, waterBody: 'Mountain Fork (Broken Bow Lake)', sourceType: 'surface', systemType: 'community', address: 'Idabel, OK', populationServed: '7000' },
  { name: 'Broken Bow Public Works Authority', county: 'McCurtain', lat: 34.0287, lng: -94.7383, waterBody: 'Broken Bow Lake / Mountain Fork', sourceType: 'surface', systemType: 'community', address: 'Broken Bow, OK', populationServed: '4200' },
  { name: 'Wright City Public Works Authority', county: 'McCurtain', lat: 34.0717, lng: -95.0061, waterBody: 'Pine Creek Lake', sourceType: 'surface', systemType: 'community', address: 'Wright City, OK', populationServed: '750' },
  { name: 'Valliant Public Works Authority', county: 'McCurtain', lat: 34.0048, lng: -95.0921, waterBody: 'Pine Creek Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Valliant, OK', populationServed: '750' },
  { name: 'Smithville Rural Water District', county: 'McCurtain', lat: 34.4768, lng: -94.6452, waterBody: 'Mountain Fork wells', sourceType: 'groundwater', systemType: 'community', address: 'Smithville, OK', populationServed: '300' },
  { name: 'Bethel Public Works Authority', county: 'McCurtain', lat: 34.4287, lng: -94.8233, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Bethel, OK', populationServed: '350' },
  // Pittsburg County
  { name: 'McAlester Public Works Authority', county: 'Pittsburg', lat: 34.9334, lng: -95.7697, waterBody: 'McAlester Reservoir / Lake Hudson', sourceType: 'surface', systemType: 'community', address: 'McAlester, OK', populationServed: '18300' },
  { name: 'Hartshorne Public Works Authority', county: 'Pittsburg', lat: 34.8401, lng: -95.5617, waterBody: 'McAlester (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Hartshorne, OK', populationServed: '2000' },
  { name: 'Krebs Public Works Authority', county: 'Pittsburg', lat: 34.9253, lng: -95.7244, waterBody: 'McAlester (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Krebs, OK', populationServed: '2100' },
  { name: 'Kiowa Public Works Authority', county: 'Pittsburg', lat: 34.7234, lng: -95.8997, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Kiowa, OK', populationServed: '750' },
  // Pushmataha County
  { name: 'Antlers Public Works Authority', county: 'Pushmataha', lat: 34.2317, lng: -95.6219, waterBody: 'Moyers Creek', sourceType: 'surface', systemType: 'community', address: 'Antlers, OK', populationServed: '2400' },
  { name: 'Clayton Public Works Authority', county: 'Pushmataha', lat: 34.5806, lng: -95.3580, waterBody: 'Sardis Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Clayton, OK', populationServed: '700' },
  { name: 'Rattan Public Works Authority', county: 'Pushmataha', lat: 34.1929, lng: -95.4350, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Rattan, OK', populationServed: '300' },
  // Marshall County (half overlaps Choctaw Nation reservation)
  { name: 'Tishomingo Public Works Authority', county: 'Johnston', lat: 34.2359, lng: -96.6783, waterBody: 'Pennington Creek', sourceType: 'surface', systemType: 'community', address: 'Tishomingo, OK', populationServed: '3200' },
];
