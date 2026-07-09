export const VER = '2.1.0';
export const SK = 'wrs-studies-v2';

// Optional link to OWRM's approved engineers/consultants list, set at build
// time once a URL exists. Left blank, the UI shows "pending" instead of a
// dead link rather than pointing somewhere broken.
// Optional chaining on `import.meta.env` itself: it's a Vite-injected object
// in the browser/build, but doesn't exist when this module is loaded under
// plain Node (e.g. `node --test`), where `import.meta.env` is undefined.
export const ENGINEERS_LIST_URL = (import.meta.env?.VITE_ENGINEERS_LIST_URL || '').trim();
export const ENGINEERS_LIST_UPDATED = (import.meta.env?.VITE_ENGINEERS_LIST_UPDATED || '').trim();
export const COUNTIES = [
  'Atoka', 'Bryan', 'Choctaw', 'Coal', 'Haskell', 'Hughes', 'Johnston',
  'Latimer', 'Le Flore', 'Marshall', 'McCurtain', 'McIntosh', 'Okfuskee',
  'Pittsburg', 'Pontotoc', 'Pushmataha', 'Sequoyah', 'Other'
];

export const STEPS = [
  { id: 0, l: '1  System Info' },
  { id: 1, l: '2  Cust. Classes & Rates' },
  { id: 2, l: '3  Budget' },
  { id: 3, l: '4  Financial Metrics' },
  { id: 4, l: '5  5-Year Projection' },
  { id: 5, l: '6  Scenarios' },
  { id: 6, l: '7  AI Analysis' },
  { id: 7, l: '8  Final Report' }
];
