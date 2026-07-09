export const VER = '2.1.0';
export const SK = 'wrs-studies-v2';
// Grouped for the county <select>s: the 10.5 counties of the Choctaw Nation
// reservation first, then neighboring counties whose systems OWRM sometimes
// assists. The flat COUNTIES list is preserved (same values, same order) so
// existing saved studies keep matching their <option> values.
export const COUNTY_GROUPS = [
  {
    label: 'Choctaw Nation Reservation',
    counties: ['Atoka', 'Bryan', 'Choctaw', 'Coal', 'Haskell', 'Hughes',
      'Latimer', 'Le Flore', 'McCurtain', 'Pittsburg', 'Pushmataha'],
  },
  {
    label: 'Neighboring Counties',
    counties: ['Johnston', 'Marshall', 'McIntosh', 'Okfuskee', 'Pontotoc', 'Sequoyah', 'Other'],
  },
];
export const COUNTIES = COUNTY_GROUPS.flatMap(g => g.counties);

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
