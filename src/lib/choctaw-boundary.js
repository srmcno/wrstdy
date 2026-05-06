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
  // ── Atoka County ─────────────────────────────────────────────────────────
  { name: 'Atoka Municipal Water Authority', county: 'Atoka', lat: 34.3856, lng: -96.1289, waterBody: 'Atoka Reservoir / McGee Creek', sourceType: 'surface', systemType: 'community', address: '100 E Court St, Atoka, OK 74525', populationServed: '3000' },
  { name: 'Stringtown Public Works Authority', county: 'Atoka', lat: 34.4669, lng: -96.0566, waterBody: 'Atoka Reservoir (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Stringtown, OK 74569', populationServed: '450' },
  { name: 'Caney Public Works Authority (RWD #3)', county: 'Atoka', lat: 34.2342, lng: -96.2167, waterBody: 'Caney Creek wells', sourceType: 'groundwater', systemType: 'community', address: 'Caney, OK 74533', populationServed: '200' },
  { name: 'Atoka County RWD #1', county: 'Atoka', lat: 34.4900, lng: -96.0100, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Atoka County, OK 74525', populationServed: '350' },

  // ── Bryan County ──────────────────────────────────────────────────────────
  { name: 'City of Durant Utilities', county: 'Bryan', lat: 33.9937, lng: -96.3711, waterBody: 'Lake Texoma (Red River)', sourceType: 'surface', systemType: 'community', address: '300 W Elm Ave, Durant, OK 74701', populationServed: '18500' },
  { name: 'Calera Public Works Authority', county: 'Bryan', lat: 33.9304, lng: -96.4239, waterBody: 'Durant (purchased)', sourceType: 'purchased', systemType: 'community', address: '105 E Main St, Calera, OK 74730', populationServed: '2200' },
  { name: 'Caddo Public Works Authority', county: 'Bryan', lat: 34.1273, lng: -96.2628, waterBody: 'McGee Creek (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Caddo, OK 74729', populationServed: '1000' },
  { name: 'Bokchito Public Works Authority', county: 'Bryan', lat: 34.0207, lng: -96.1505, waterBody: 'Bryan RWD #5 (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Bokchito, OK 74726', populationServed: '600' },
  { name: 'Colbert Public Works Authority', county: 'Bryan', lat: 33.8568, lng: -96.5049, waterBody: 'Lake Texoma / Durant (purchased)', sourceType: 'purchased', systemType: 'community', address: '110 S 3rd St, Colbert, OK 74733', populationServed: '1100' },
  { name: 'Achille Public Works Authority', county: 'Bryan', lat: 34.0362, lng: -96.3640, waterBody: 'Durant (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Achille, OK 74720', populationServed: '450' },
  { name: 'Bryan County Rural Water District #5', county: 'Bryan', lat: 34.0650, lng: -96.1800, waterBody: 'Local wells / groundwater', sourceType: 'groundwater', systemType: 'community', address: 'Bokchito, OK 74726', populationServed: '800' },

  // ── Choctaw County ────────────────────────────────────────────────────────
  { name: 'Hugo Municipal Authority', county: 'Choctaw', lat: 34.0093, lng: -95.5119, waterBody: 'Hugo Lake (Kiamichi River)', sourceType: 'surface', systemType: 'community', address: '201 E Jackson St, Hugo, OK 74743', populationServed: '5300' },
  { name: 'Soper Public Works Authority', county: 'Choctaw', lat: 34.0237, lng: -95.6878, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Soper, OK 74759', populationServed: '300' },
  { name: 'Fort Towson Public Works Authority', county: 'Choctaw', lat: 34.0270, lng: -95.2659, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Fort Towson, OK 74735', populationServed: '600' },
  { name: 'Boswell Public Works Authority', county: 'Choctaw', lat: 34.0331, lng: -95.8702, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Boswell, OK 74727', populationServed: '650' },
  { name: 'Sawyer Public Works Authority', county: 'Choctaw', lat: 34.0545, lng: -95.4112, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Sawyer, OK 74756', populationServed: '250' },
  { name: 'Grant Public Works Authority', county: 'Choctaw', lat: 34.0750, lng: -95.5480, waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Grant, OK 74738', populationServed: '400' },

  // ── Coal County ───────────────────────────────────────────────────────────
  { name: 'Coalgate Public Works Authority', county: 'Coal', lat: 34.5359, lng: -96.2173, waterBody: 'Coalgate Reservoir', sourceType: 'surface', systemType: 'community', address: '105 N Main St, Coalgate, OK 74538', populationServed: '1900' },
  { name: 'Tupelo Public Works Authority', county: 'Coal', lat: 34.5950, lng: -96.4222, waterBody: 'Sardis Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Tupelo, OK 74572', populationServed: '350' },
  { name: 'Lehigh Public Works Authority', county: 'Coal', lat: 34.4600, lng: -96.2260, waterBody: 'Coalgate (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Lehigh, OK 74556', populationServed: '300' },

  // ── Haskell County ────────────────────────────────────────────────────────
  { name: 'Stigler Public Works Authority', county: 'Haskell', lat: 35.2536, lng: -95.1308, waterBody: 'Stigler Lake', sourceType: 'surface', systemType: 'community', address: '118 E Main St, Stigler, OK 74462', populationServed: '2700' },
  { name: 'Keota Public Works Authority', county: 'Haskell', lat: 35.2581, lng: -94.9224, waterBody: 'Wister Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Keota, OK 74941', populationServed: '550' },
  { name: 'Quinton Public Works Authority', county: 'Haskell', lat: 35.1228, lng: -95.3724, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Quinton, OK 74561', populationServed: '950' },
  { name: 'Kinta Public Works Authority', county: 'Haskell', lat: 35.1200, lng: -95.2200, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Kinta, OK 74552', populationServed: '250' },

  // ── Hughes County ─────────────────────────────────────────────────────────
  { name: 'Holdenville Public Works Authority', county: 'Hughes', lat: 35.0820, lng: -96.3992, waterBody: 'Holdenville Lake', sourceType: 'surface', systemType: 'community', address: '121 E Gentry Ave, Holdenville, OK 74848', populationServed: '5500' },
  { name: 'Wetumka Public Works Authority', county: 'Hughes', lat: 35.2378, lng: -96.2406, waterBody: 'Wetumka Lake', sourceType: 'surface', systemType: 'community', address: 'Wetumka, OK 74883', populationServed: '1300' },
  { name: 'Stuart Public Works Authority', county: 'Hughes', lat: 34.9107, lng: -96.0900, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Stuart, OK 74570', populationServed: '250' },
  { name: 'Calvin Public Works Authority', county: 'Hughes', lat: 34.9740, lng: -96.2680, waterBody: 'Holdenville (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Calvin, OK 74531', populationServed: '300' },

  // ── Latimer County ────────────────────────────────────────────────────────
  { name: 'Wilburton Water Department', county: 'Latimer', lat: 34.9181, lng: -95.3097, waterBody: 'Robbers Cave SP watershed', sourceType: 'surface', systemType: 'community', address: '109 W Main St, Wilburton, OK 74578', populationServed: '2900' },
  { name: 'Red Oak Public Works Authority', county: 'Latimer', lat: 34.9525, lng: -95.0731, waterBody: 'Wister Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Red Oak, OK 74563', populationServed: '550' },
  { name: 'Hartshorne-Latimer County RWD', county: 'Latimer', lat: 34.8500, lng: -95.5500, waterBody: 'McAlester (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Latimer County, OK', populationServed: '400' },

  // ── Le Flore County ───────────────────────────────────────────────────────
  { name: 'Poteau Water Department', county: 'Le Flore', lat: 35.0537, lng: -94.6232, waterBody: 'Wister Lake (Poteau River)', sourceType: 'surface', systemType: 'community', address: '100 Dewey Ave, Poteau, OK 74953', populationServed: '8500' },
  { name: 'Heavener Utilities Authority', county: 'Le Flore', lat: 34.8868, lng: -94.6019, waterBody: 'Holson Creek wells', sourceType: 'groundwater', systemType: 'community', address: '307 E Ave A, Heavener, OK 74937', populationServed: '3300' },
  { name: 'Spiro Public Works Authority', county: 'Le Flore', lat: 35.2403, lng: -94.6225, waterBody: 'Arkansas River alluvium wells', sourceType: 'groundwater', systemType: 'community', address: '116 N Main St, Spiro, OK 74959', populationServed: '2100' },
  { name: 'Talihina Public Works Authority', county: 'Le Flore', lat: 34.7484, lng: -95.0397, waterBody: 'Holson Valley wells', sourceType: 'groundwater', systemType: 'community', address: 'Talihina, OK 74571', populationServed: '1100' },
  { name: 'Wister Public Works Authority', county: 'Le Flore', lat: 34.9582, lng: -94.7244, waterBody: 'Wister Lake', sourceType: 'surface', systemType: 'community', address: 'Wister, OK 74966', populationServed: '1100' },
  { name: 'Bokoshe Public Works Authority', county: 'Le Flore', lat: 35.1730, lng: -94.7930, waterBody: 'Poteau (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Bokoshe, OK 74930', populationServed: '550' },
  { name: 'Panama Public Works Authority', county: 'Le Flore', lat: 35.1670, lng: -94.6700, waterBody: 'Poteau (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Panama, OK 74951', populationServed: '1300' },
  { name: 'Pocola Public Works Authority', county: 'Le Flore', lat: 35.2362, lng: -94.4775, waterBody: 'Arkansas River / Fort Smith AR (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Pocola, OK 74902', populationServed: '4000' },

  // ── McCurtain County ──────────────────────────────────────────────────────
  { name: 'Idabel Public Works Authority', county: 'McCurtain', lat: 33.8959, lng: -94.8266, waterBody: 'Mountain Fork (Broken Bow Lake)', sourceType: 'surface', systemType: 'community', address: '5 SE Avenue A, Idabel, OK 74745', populationServed: '7000' },
  { name: 'Broken Bow Public Works Authority', county: 'McCurtain', lat: 34.0287, lng: -94.7383, waterBody: 'Broken Bow Lake / Mountain Fork', sourceType: 'surface', systemType: 'community', address: '110 N Broadway, Broken Bow, OK 74728', populationServed: '4200' },
  { name: 'Wright City Public Works Authority', county: 'McCurtain', lat: 34.0717, lng: -95.0061, waterBody: 'Pine Creek Lake', sourceType: 'surface', systemType: 'community', address: 'Wright City, OK 74766', populationServed: '750' },
  { name: 'Valliant Public Works Authority', county: 'McCurtain', lat: 34.0048, lng: -95.0921, waterBody: 'Pine Creek Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Valliant, OK 74764', populationServed: '750' },
  { name: 'Smithville Rural Water District', county: 'McCurtain', lat: 34.4768, lng: -94.6452, waterBody: 'Mountain Fork wells', sourceType: 'groundwater', systemType: 'community', address: 'Smithville, OK 74957', populationServed: '300' },
  { name: 'Bethel Public Works Authority', county: 'McCurtain', lat: 34.4287, lng: -94.8233, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Bethel, OK 74724', populationServed: '350' },
  { name: 'Haworth Public Works Authority', county: 'McCurtain', lat: 33.8460, lng: -94.6570, waterBody: 'Red River basin wells', sourceType: 'groundwater', systemType: 'community', address: 'Haworth, OK 74740', populationServed: '400' },
  { name: 'Eagletown Public Works Authority', county: 'McCurtain', lat: 34.1110, lng: -94.5800, waterBody: 'Mountain Fork wells', sourceType: 'groundwater', systemType: 'community', address: 'Eagletown, OK 74734', populationServed: '500' },
  { name: 'Tom RWD / Octavia Area Water', county: 'McCurtain', lat: 34.5500, lng: -94.9200, waterBody: 'Mountain Fork / local wells', sourceType: 'groundwater', systemType: 'community', address: 'Octavia, OK 74957', populationServed: '300' },

  // ── Pittsburg County ──────────────────────────────────────────────────────
  { name: 'McAlester Public Works Authority', county: 'Pittsburg', lat: 34.9334, lng: -95.7697, waterBody: 'McAlester Reservoir / Lake Hudson', sourceType: 'surface', systemType: 'community', address: '28 E Washington Ave, McAlester, OK 74501', populationServed: '18300' },
  { name: 'Hartshorne Public Works Authority', county: 'Pittsburg', lat: 34.8401, lng: -95.5617, waterBody: 'McAlester (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Hartshorne, OK 74547', populationServed: '2000' },
  { name: 'Krebs Public Works Authority', county: 'Pittsburg', lat: 34.9253, lng: -95.7244, waterBody: 'McAlester (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Krebs, OK 74554', populationServed: '2100' },
  { name: 'Kiowa Public Works Authority', county: 'Pittsburg', lat: 34.7234, lng: -95.8997, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Kiowa, OK 74553', populationServed: '750' },
  { name: 'Canadian Public Works Authority', county: 'Pittsburg', lat: 35.1024, lng: -95.6696, waterBody: 'Canadian Valley wells', sourceType: 'groundwater', systemType: 'community', address: 'Canadian, OK 74425', populationServed: '250' },
  { name: 'Savanna Public Works Authority', county: 'Pittsburg', lat: 34.8317, lng: -96.0021, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Savanna, OK 74565', populationServed: '700' },

  // ── Pushmataha County ─────────────────────────────────────────────────────
  { name: 'Antlers Public Works Authority', county: 'Pushmataha', lat: 34.2317, lng: -95.6219, waterBody: 'Moyers Creek', sourceType: 'surface', systemType: 'community', address: '115 N High St, Antlers, OK 74523', populationServed: '2400' },
  { name: 'Clayton Public Works Authority', county: 'Pushmataha', lat: 34.5806, lng: -95.3580, waterBody: 'Sardis Lake (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Clayton, OK 74536', populationServed: '700' },
  { name: 'Rattan Public Works Authority', county: 'Pushmataha', lat: 34.1929, lng: -95.4350, waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community', address: 'Rattan, OK 74562', populationServed: '300' },
  { name: 'Albion Public Works Authority', county: 'Pushmataha', lat: 34.6600, lng: -95.5250, waterBody: 'Sardis Lake area wells', sourceType: 'groundwater', systemType: 'community', address: 'Albion, OK 74521', populationServed: '200' },
  { name: 'Tuskahoma Rural Water District', county: 'Pushmataha', lat: 34.7200, lng: -95.2700, waterBody: 'Jack Fork Creek watershed', sourceType: 'surface', systemType: 'community', address: 'Tuskahoma, OK 74574', populationServed: '250' },

  // ── Johnston County ───────────────────────────────────────────────────────
  { name: 'Tishomingo Public Works Authority', county: 'Johnston', lat: 34.2359, lng: -96.6783, waterBody: 'Pennington Creek', sourceType: 'surface', systemType: 'community', address: '219 E Main St, Tishomingo, OK 73460', populationServed: '3200' },
  { name: 'Mill Creek Public Works Authority', county: 'Johnston', lat: 34.4367, lng: -96.8000, waterBody: 'Tishomingo (purchased)', sourceType: 'purchased', systemType: 'community', address: 'Mill Creek, OK 74856', populationServed: '350' },

  // ── Marshall County (partial CNO jurisdiction) ────────────────────────────
  { name: 'Madill Public Works Authority', county: 'Marshall', lat: 34.0912, lng: -96.7706, waterBody: 'Lake Texoma (purchased from Durant)', sourceType: 'purchased', systemType: 'community', address: '131 W Taliaferro, Madill, OK 73446', populationServed: '3900' },
];
