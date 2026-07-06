// The map now renders the actual TIGER/Line CNO Council District polygons
// from /src/assets/cno-districts.json. The hand-traced CHOCTAW_BOUNDARY array
// that lived here has been removed; downstream code should rely on the
// district geojson layer instead.

// Approximate centroid for default map view (used before the geojson loads).
export const CHOCTAW_CENTER = [34.55, -95.45];
export const CHOCTAW_ZOOM = 8;

// Curated reference list of public water systems in the Choctaw Nation
// 10.5-county area. Addresses, coordinates, and water sources are verified
// against official city websites, myruralwater.com utility portals, ORWA
// membership records, EWG tap water data, and ODEQ/EPA SDWIS records.
//
// Field reference:
//   name           — display name
//   county         — Oklahoma county (must match COUNTIES list)
//   lat / lng      — display coordinates (municipal center or office location)
//   waterBody      — primary source (lake, river, aquifer, or purchased-from)
//   sourceType     — 'surface' | 'groundwater' | 'purchased' | 'mixed'
//   systemType     — 'community' | 'ntnc' | 'tnc'
//   address        — street address of utility office / main facility
//   populationServed — approximate; used as a starting estimate
//
// All values are best-effort starting points the user can edit. PWS IDs are
// intentionally omitted because they require official DEQ confirmation.
export const KNOWN_SYSTEMS = [

  // ── Atoka County ──────────────────────────────────────────────────────────
  {
    name: 'Atoka Municipal Water Authority',
    county: 'Atoka', lat: 34.3762, lng: -96.1281,
    waterBody: 'Atoka Lake / McGee Creek Reservoir', sourceType: 'surface', systemType: 'community',
    address: '225 S Greathouse Dr, Atoka, OK 74525', populationServed: '3200',
  },
  {
    name: 'Stringtown Public Works Authority',
    county: 'Atoka', lat: 34.4726, lng: -96.0503,
    waterBody: 'Atoka Lake (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '138 E Pecan Ave, Stringtown, OK 74569', populationServed: '430',
  },
  {
    name: 'Caney Public Works Authority (Atoka Co. RWD #3)',
    county: 'Atoka', lat: 34.2310, lng: -96.2556,
    waterBody: 'Groundwater wells (Antlers Aquifer)', sourceType: 'groundwater', systemType: 'community',
    address: '13416 S Highway 69/75, Caddo, OK 74729', populationServed: '1500',
  },
  {
    name: 'Atoka County Rural Water, Sewer & SWMD #4',
    county: 'Atoka', lat: 34.3900, lng: -96.0900,
    waterBody: 'McGee Creek Reservoir / Atoka Lake', sourceType: 'surface', systemType: 'community',
    address: '3169 E Highway 3, Atoka, OK 74525', populationServed: '3000',
  },

  // ── Bryan County ──────────────────────────────────────────────────────────
  {
    name: 'City of Durant Utilities',
    county: 'Bryan', lat: 33.9940, lng: -96.4089,
    waterBody: 'Blue River', sourceType: 'surface', systemType: 'community',
    address: '300 W Evergreen St, Durant, OK 74701', populationServed: '15545',
  },
  {
    name: 'Calera Public Works Authority',
    county: 'Bryan', lat: 33.9418, lng: -96.4265,
    waterBody: 'Blue River (purchased from Durant)', sourceType: 'purchased', systemType: 'community',
    address: '110 W Main St, Calera, OK 74730', populationServed: '2200',
  },
  {
    name: 'Caddo Public Works Authority',
    county: 'Bryan', lat: 34.1279, lng: -96.2559,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '206 Buffalo St, Caddo, OK 74729', populationServed: '950',
  },
  {
    name: 'Bokchito Public Works Authority',
    county: 'Bryan', lat: 34.0207, lng: -96.1442,
    waterBody: 'Blue River (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '117 E Main St, Bokchito, OK 74726', populationServed: '650',
  },
  {
    name: 'Colbert Public Works Authority',
    county: 'Bryan', lat: 33.8568, lng: -96.5049,
    waterBody: 'Lake Texoma / Durant (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '110 S 3rd St, Colbert, OK 74733', populationServed: '1100',
  },
  {
    name: 'Achille Public Works Authority',
    county: 'Bryan', lat: 34.0362, lng: -96.3640,
    waterBody: 'Durant (purchased)', sourceType: 'purchased', systemType: 'community',
    address: 'Achille, OK 74720', populationServed: '450',
  },
  {
    name: 'Bryan County Rural Water District #2',
    county: 'Bryan', lat: 33.9800, lng: -96.5400,
    waterBody: 'Blue River / Antlers Aquifer (mixed)', sourceType: 'mixed', systemType: 'community',
    address: '9077 Hwy 70, Mead, OK 73449', populationServed: '3000',
  },
  {
    name: 'Bryan County Rural Water District #5',
    county: 'Bryan', lat: 33.9200, lng: -96.3800,
    waterBody: 'Blue River (purchased from Durant)', sourceType: 'purchased', systemType: 'community',
    address: '22404 State Road 78S, Durant, OK 74701', populationServed: '2500',
  },
  {
    name: 'Bryan County Rural Water District #6',
    county: 'Bryan', lat: 34.1279, lng: -96.2700,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '206 Buffalo St, Caddo, OK 74729', populationServed: '1200',
  },
  {
    name: 'Bryan County Rural Water District #7',
    county: 'Bryan', lat: 34.0300, lng: -96.2200,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '120 N Perry St, Bennington, OK 74723', populationServed: '800',
  },
  {
    name: 'Bryan County Rural Water & SWMD #9',
    county: 'Bryan', lat: 33.8700, lng: -96.3200,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '2116 Kemp Rd, Hendrix, OK 74741', populationServed: '820',
  },

  // ── Choctaw County ────────────────────────────────────────────────────────
  {
    name: 'Hugo Municipal Authority',
    county: 'Choctaw', lat: 34.0101, lng: -95.5069,
    waterBody: 'Hugo Lake / Kiamichi River', sourceType: 'surface', systemType: 'community',
    address: '201 S 2nd St, Hugo, OK 74743', populationServed: '5300',
  },
  {
    name: 'Soper Public Works Authority',
    county: 'Choctaw', lat: 34.0237, lng: -95.6878,
    waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community',
    address: 'Soper, OK 74759', populationServed: '270',
  },
  {
    name: 'Fort Towson Public Works Authority',
    county: 'Choctaw', lat: 34.0270, lng: -95.2659,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '112 E Valliant St, Fort Towson, OK 74735', populationServed: '580',
  },
  {
    name: 'Boswell Public Works Authority',
    county: 'Choctaw', lat: 34.0196, lng: -95.8699,
    waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community',
    address: 'Boswell, OK 74727', populationServed: '750',
  },
  {
    name: 'Choctaw County Rural Water & Sewer District #1',
    county: 'Choctaw', lat: 34.1500, lng: -95.5000,
    waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '201 N Everidge St, Grant, OK 74738', populationServed: '700',
  },
  {
    name: 'Choctaw County Rural Water & SWMD #6',
    county: 'Choctaw', lat: 34.0350, lng: -95.8900,
    waterBody: 'Hugo Lake (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '878 N 4030 Rd, Boswell, OK 74727', populationServed: '800',
  },

  // ── Coal County ───────────────────────────────────────────────────────────
  {
    name: 'Coalgate Public Works Authority',
    county: 'Coal', lat: 34.5373, lng: -96.2181,
    waterBody: 'Coalgate Reservoir / groundwater wells', sourceType: 'mixed', systemType: 'community',
    address: '3 S Main St, Coalgate, OK 74538', populationServed: '2000',
  },
  {
    name: 'Tupelo Public Works Authority',
    county: 'Coal', lat: 34.6020, lng: -96.4282,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Tupelo, OK 74572', populationServed: '360',
  },
  {
    name: 'Coal County Rural Water District #1',
    county: 'Coal', lat: 34.5700, lng: -96.3500,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Coal County, OK 74538', populationServed: '450',
  },
  {
    name: 'Coal County Rural Water District #5',
    county: 'Coal', lat: 34.4800, lng: -96.1000,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Coal County, OK 74572', populationServed: '300',
  },

  // ── Haskell County ────────────────────────────────────────────────────────
  {
    name: 'Haskell County Water Company',
    county: 'Haskell', lat: 35.2600, lng: -95.1300,
    waterBody: 'Greenleaf Lake (surface)', sourceType: 'surface', systemType: 'community',
    address: '118 W Bk 1200 Rd, Stigler, OK 74462', populationServed: '3000',
  },
  {
    name: 'Stigler Public Works Authority',
    county: 'Haskell', lat: 35.2534, lng: -95.1239,
    waterBody: 'Greenleaf Lake (purchased from Haskell Co. Water Co.)', sourceType: 'purchased', systemType: 'community',
    address: 'Stigler, OK 74462', populationServed: '2700',
  },
  {
    name: 'Keota Public Works Authority',
    county: 'Haskell', lat: 35.0598, lng: -95.0237,
    waterBody: 'Purchased surface water', sourceType: 'purchased', systemType: 'community',
    address: 'Keota, OK 74941', populationServed: '564',
  },
  {
    name: 'Kinta Public Works Authority',
    county: 'Haskell', lat: 35.1200, lng: -95.2200,
    waterBody: 'Local wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Kinta, OK 74552', populationServed: '250',
  },

  // ── Hughes County ─────────────────────────────────────────────────────────
  {
    name: 'Holdenville Public Works Authority',
    county: 'Hughes', lat: 35.0820, lng: -96.3991,
    waterBody: 'Holdenville Lake / groundwater wells', sourceType: 'mixed', systemType: 'community',
    address: '100 N Creek St, Holdenville, OK 74848', populationServed: '5400',
  },
  {
    name: 'Wetumka Public Works Authority',
    county: 'Hughes', lat: 35.2334, lng: -96.2373,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '202 N Main St, Wetumka, OK 74883', populationServed: '1400',
  },
  {
    name: 'Hughes County Rural Water District #1',
    county: 'Hughes', lat: 35.2300, lng: -96.2300,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '1904 N 380 Rd, Wetumka, OK 74883', populationServed: '700',
  },
  {
    name: 'Hughes County Rural Water District #2',
    county: 'Hughes', lat: 34.9800, lng: -96.2500,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '709 Roosevelt Ave, Stuart, OK 74570', populationServed: '600',
  },
  {
    name: 'Hughes County Rural Water District #6',
    county: 'Hughes', lat: 34.8900, lng: -96.4200,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '716 Elder Ave, Gerty, OK 74531', populationServed: '500',
  },
  {
    name: 'Calvin Public Works Authority',
    county: 'Hughes', lat: 34.9740, lng: -96.2680,
    waterBody: 'Holdenville (purchased)', sourceType: 'purchased', systemType: 'community',
    address: 'Calvin, OK 74531', populationServed: '300',
  },

  // ── Latimer County ────────────────────────────────────────────────────────
  {
    name: 'Wilburton Water Department',
    county: 'Latimer', lat: 34.9195, lng: -95.3147,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '300 W Main St, Wilburton, OK 74578', populationServed: '2800',
  },
  {
    name: 'Red Oak Public Works Authority',
    county: 'Latimer', lat: 34.9423, lng: -95.0637,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Red Oak, OK 74563', populationServed: '530',
  },
  {
    name: 'Latimer County Rural Water District #1',
    county: 'Latimer', lat: 34.9200, lng: -95.3200,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '100 W Main St, Wilburton, OK 74578', populationServed: '900',
  },
  {
    name: 'Latimer County Rural Water District #2',
    county: 'Latimer', lat: 34.7500, lng: -95.0600,
    waterBody: 'Talihina WTP (purchased surface)', sourceType: 'purchased', systemType: 'community',
    address: '5473 SE Hwy 63, Talihina, OK 74571', populationServed: '470',
  },
  {
    name: 'Latimer County Rural Water District #4',
    county: 'Latimer', lat: 34.9400, lng: -95.0600,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Red Oak, OK 74563', populationServed: '350',
  },

  // ── Le Flore County ───────────────────────────────────────────────────────
  {
    name: 'Poteau Valley Improvement Authority (PVIA)',
    county: 'Le Flore', lat: 34.9787, lng: -94.7269,
    waterBody: 'Lake Wister / Poteau River', sourceType: 'surface', systemType: 'community',
    address: 'Wister, OK 74966', populationServed: '40000',
  },
  {
    name: 'Poteau Water Department',
    county: 'Le Flore', lat: 35.0534, lng: -94.6219,
    waterBody: 'Lake Wister (via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '111 Peters St, Poteau, OK 74953', populationServed: '8500',
  },
  {
    name: 'Heavener Utilities Authority',
    county: 'Le Flore', lat: 34.8884, lng: -94.5997,
    waterBody: 'Lake Wister (via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '103 E Avenue B, Heavener, OK 74937', populationServed: '3200',
  },
  {
    name: 'Spiro Public Works Authority',
    county: 'Le Flore', lat: 35.2445, lng: -94.6219,
    waterBody: 'Lake Wister (via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '131 S Main St, Spiro, OK 74959', populationServed: '2300',
  },
  {
    name: 'Talihina Public Works Authority',
    county: 'Le Flore', lat: 34.7493, lng: -95.0521,
    waterBody: 'Kiamichi River (surface)', sourceType: 'surface', systemType: 'community',
    address: '207 1st St, Talihina, OK 74571', populationServed: '1100',
  },
  {
    name: 'Wister Public Works Authority',
    county: 'Le Flore', lat: 34.9787, lng: -94.7269,
    waterBody: 'Lake Wister (via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '101 Caston St, Wister, OK 74966', populationServed: '1000',
  },
  {
    name: 'Bokoshe Public Works Authority',
    county: 'Le Flore', lat: 35.1730, lng: -94.7930,
    waterBody: 'Lake Wister (purchased via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: 'Bokoshe, OK 74930', populationServed: '550',
  },
  {
    name: 'Panama Public Works Authority',
    county: 'Le Flore', lat: 35.1670, lng: -94.6700,
    waterBody: 'Lake Wister (purchased via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: 'Panama, OK 74951', populationServed: '1300',
  },
  {
    name: 'LeFlore County Rural Water District #2',
    county: 'Le Flore', lat: 35.2000, lng: -94.4600,
    waterBody: 'Lake Wister (purchased via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '107 N Pocola Blvd, Pocola, OK 74902', populationServed: '1800',
  },
  {
    name: 'LeFlore County Rural Water District #14',
    county: 'Le Flore', lat: 35.2445, lng: -94.6000,
    waterBody: 'Lake Wister (purchased via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '114 N Fresno St, Spiro, OK 74959', populationServed: '2000',
  },
  {
    name: 'LeFlore County Rural Water District #17',
    county: 'Le Flore', lat: 34.8400, lng: -94.5700,
    waterBody: 'Lake Wister (purchased via PVIA)', sourceType: 'purchased', systemType: 'community',
    address: '21981 State Hwy 63, Hodgen, OK 74939', populationServed: '600',
  },

  // ── McCurtain County ──────────────────────────────────────────────────────
  {
    name: 'Idabel Public Works Authority',
    county: 'McCurtain', lat: 33.8959, lng: -94.8294,
    waterBody: 'Little River', sourceType: 'surface', systemType: 'community',
    address: '201 E Main St, Idabel, OK 74745', populationServed: '7000',
  },
  {
    name: 'Broken Bow Public Works Authority',
    county: 'McCurtain', lat: 34.0290, lng: -94.7391,
    waterBody: 'Broken Bow Lake', sourceType: 'surface', systemType: 'community',
    address: '210 N Broadway St, Broken Bow, OK 74728', populationServed: '4200',
  },
  {
    name: 'Wright City Public Works Authority',
    county: 'McCurtain', lat: 34.0454, lng: -95.0031,
    waterBody: 'Little River (purchased from Idabel)', sourceType: 'purchased', systemType: 'community',
    address: 'Wright City, OK 74766', populationServed: '850',
  },
  {
    name: 'Valliant Public Works Authority',
    county: 'McCurtain', lat: 34.0012, lng: -95.0876,
    waterBody: 'Little River (purchased from Idabel)', sourceType: 'purchased', systemType: 'community',
    address: '111 N Dalton Ave, Valliant, OK 74764', populationServed: '750',
  },
  {
    name: 'Kiamichi Rural Water District #6 (Smithville)',
    county: 'McCurtain', lat: 34.4683, lng: -94.6245,
    waterBody: 'Kiamichi River / groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '417 State Hwy 4, Smithville, OK 74957', populationServed: '900',
  },
  {
    name: 'Bethel Public Works Authority',
    county: 'McCurtain', lat: 34.2200, lng: -94.7600,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Bethel, OK 74724', populationServed: '350',
  },
  {
    name: 'McCurtain County Rural Water District #1 (Haworth)',
    county: 'McCurtain', lat: 33.8400, lng: -94.6500,
    waterBody: 'Little River (purchased from Idabel)', sourceType: 'purchased', systemType: 'community',
    address: 'McCurtain County, OK 74745', populationServed: '600',
  },
  {
    name: 'McCurtain County Rural Water District #2',
    county: 'McCurtain', lat: 33.9900, lng: -94.9500,
    waterBody: 'Little River (purchased)', sourceType: 'purchased', systemType: 'community',
    address: 'Millerton, OK 74750', populationServed: '500',
  },
  {
    name: 'McCurtain County Rural Water District #5 (Hochatown)',
    county: 'McCurtain', lat: 34.1700, lng: -94.7200,
    waterBody: 'Broken Bow Lake (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '9180 N US Hwy 259, Broken Bow, OK 74728', populationServed: '1200',
  },
  {
    name: 'McCurtain County Rural Water District #7 (Garvin)',
    county: 'McCurtain', lat: 34.0000, lng: -94.9800,
    waterBody: 'Little River (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '101 E Williams St, Garvin, OK 74736', populationServed: '450',
  },
  {
    name: 'McCurtain County Rural Water District #8',
    county: 'McCurtain', lat: 34.0500, lng: -94.7800,
    waterBody: 'Broken Bow Lake', sourceType: 'surface', systemType: 'community',
    address: '1803 N US Hwy 259, Broken Bow, OK 74728', populationServed: '1800',
  },

  // ── Pittsburg County ──────────────────────────────────────────────────────
  {
    name: 'McAlester Public Works Authority',
    county: 'Pittsburg', lat: 34.9334, lng: -95.7697,
    waterBody: 'Lake McAlester / Talawanda Lakes / Lake Eufaula', sourceType: 'surface', systemType: 'community',
    address: '28 E Washington Ave, McAlester, OK 74501', populationServed: '18500',
  },
  {
    name: 'Hartshorne Public Works Authority',
    county: 'Pittsburg', lat: 34.8437, lng: -95.5543,
    waterBody: 'Lake McAlester (purchased via PCWA)', sourceType: 'purchased', systemType: 'community',
    address: '1101 Pennsylvania Ave, Hartshorne, OK 74547', populationServed: '2000',
  },
  {
    name: 'Krebs Public Works Authority',
    county: 'Pittsburg', lat: 34.9279, lng: -95.7194,
    waterBody: 'Lake McAlester (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '5 NE Washington Ave, Krebs, OK 74554', populationServed: '2050',
  },
  {
    name: 'Kiowa Public Works Authority',
    county: 'Pittsburg', lat: 34.7215, lng: -95.9044,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: '831 S Van Buren St, Kiowa, OK 74553', populationServed: '720',
  },
  {
    name: 'Quinton Public Works Authority',
    county: 'Pittsburg', lat: 35.1248, lng: -95.3714,
    waterBody: 'Purchased surface water', sourceType: 'purchased', systemType: 'community',
    address: 'Quinton, OK 74561', populationServed: '1071',
  },
  {
    name: 'Pittsburg County Public Works Authority (Crowder)',
    county: 'Pittsburg', lat: 35.0600, lng: -95.6400,
    waterBody: 'Lake McAlester (surface)', sourceType: 'surface', systemType: 'community',
    address: 'Crowder, OK 74430', populationServed: '2200',
  },
  {
    name: 'Haileyville Public Works Authority',
    county: 'Pittsburg', lat: 34.8479, lng: -95.5680,
    waterBody: 'Lake McAlester (purchased via PCWA)', sourceType: 'purchased', systemType: 'community',
    address: '510 Main St, Haileyville, OK 74546', populationServed: '900',
  },
  {
    name: 'Pittsburg County Rural Water District #5',
    county: 'Pittsburg', lat: 34.9200, lng: -95.8200,
    waterBody: 'Lake McAlester (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '430 S Chambers Rd, McAlester, OK 74501', populationServed: '2500',
  },
  {
    name: 'Pittsburg County Rural Water District #14',
    county: 'Pittsburg', lat: 34.9400, lng: -95.7500,
    waterBody: 'Lake McAlester (purchased)', sourceType: 'purchased', systemType: 'community',
    address: '515 E Cherokee Ave, McAlester, OK 74501', populationServed: '1800',
  },
  {
    name: 'Pittsburg County Rural Water & Sewer District #20',
    county: 'Pittsburg', lat: 35.2500, lng: -95.6800,
    waterBody: 'Lake Eufaula (surface)', sourceType: 'surface', systemType: 'community',
    address: '44 Water St, Carlton Landing, OK 74432', populationServed: '400',
  },

  // ── Pushmataha County ─────────────────────────────────────────────────────
  {
    name: 'Antlers Public Works Authority',
    county: 'Pushmataha', lat: 34.2285, lng: -95.6218,
    waterBody: 'Kiamichi River', sourceType: 'surface', systemType: 'community',
    address: '100 SE 2nd St, Antlers, OK 74523', populationServed: '2400',
  },
  {
    name: 'Sardis Lake Water Authority',
    county: 'Pushmataha', lat: 34.6300, lng: -95.3100,
    waterBody: 'Sardis Lake', sourceType: 'surface', systemType: 'community',
    address: '161552 State Hwy 2, Clayton, OK 74536', populationServed: '800',
  },
  {
    name: 'Clayton Public Works Authority',
    county: 'Pushmataha', lat: 34.5984, lng: -95.3250,
    waterBody: 'Sardis Lake / Kiamichi River', sourceType: 'surface', systemType: 'community',
    address: 'Clayton, OK 74536', populationServed: '760',
  },
  {
    name: 'Rattan Public Works Authority',
    county: 'Pushmataha', lat: 34.1660, lng: -95.4220,
    waterBody: 'Kiamichi River (purchased from Antlers)', sourceType: 'purchased', systemType: 'community',
    address: 'Rattan, OK 74562', populationServed: '260',
  },
  {
    name: 'Pushmataha County Rural Water District #2 (Albion)',
    county: 'Pushmataha', lat: 34.7200, lng: -95.2100,
    waterBody: 'Talihina WTP (purchased surface)', sourceType: 'purchased', systemType: 'community',
    address: 'Albion, OK 74521', populationServed: '1200',
  },
  {
    name: 'Pushmataha County Rural Water District #3',
    county: 'Pushmataha', lat: 34.2200, lng: -95.6200,
    waterBody: 'Kiamichi River (purchased from Antlers)', sourceType: 'purchased', systemType: 'community',
    address: '418199 State Hwy 3, Antlers, OK 74523', populationServed: '700',
  },
  {
    name: 'Pushmataha County Rural Water District #5 (Nashoba)',
    county: 'Pushmataha', lat: 34.5400, lng: -95.1700,
    waterBody: 'Sardis Lake (purchased surface)', sourceType: 'purchased', systemType: 'community',
    address: 'Nashoba, OK 74558', populationServed: '725',
  },

  // ── Johnston County ───────────────────────────────────────────────────────
  {
    name: 'Tishomingo Public Works Authority',
    county: 'Johnston', lat: 34.2381, lng: -96.6784,
    waterBody: 'Pennington Creek / Lake Tishomingo', sourceType: 'surface', systemType: 'community',
    address: 'Tishomingo, OK 73460', populationServed: '3100',
  },
  {
    name: 'Johnston County Rural Water District #3',
    county: 'Johnston', lat: 34.2381, lng: -96.6900,
    waterBody: 'Groundwater wells / Lake Tishomingo', sourceType: 'groundwater', systemType: 'community',
    address: '10501 S Refuge Rd, Tishomingo, OK 73460', populationServed: '900',
  },
  {
    name: 'Johnston County Rural Water System & SWMD #4',
    county: 'Johnston', lat: 34.3000, lng: -96.7500,
    waterBody: 'Groundwater wells', sourceType: 'groundwater', systemType: 'community',
    address: 'Johnston County, OK 73460', populationServed: '600',
  },

  // ── Marshall County (partial CNO jurisdiction) ────────────────────────────
  {
    name: 'Marshall County Rural Water District #2',
    county: 'Marshall', lat: 34.1209, lng: -96.7717,
    waterBody: 'Lake Oteka / Lake Rex Smith (surface)', sourceType: 'surface', systemType: 'community',
    address: '400 E Main St, Madill, OK 73446', populationServed: '5000',
  },
  {
    name: 'Marshall County Rural Water & Sewer District #1',
    county: 'Marshall', lat: 34.0700, lng: -96.8500,
    waterBody: 'Lake Texoma / groundwater wells', sourceType: 'mixed', systemType: 'community',
    address: 'Marshall County, OK 73446', populationServed: '800',
  },
];
