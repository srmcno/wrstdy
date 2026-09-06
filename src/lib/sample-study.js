import { newStudy } from './state.js';

// A realistic example rate study so new users can explore the tool's full
// workflow without manually entering data. Numbers are illustrative for a
// ~260-connection rural water district in southeastern Oklahoma.
//
// The numbers are not arbitrary — they are tuned to tell the story a rate
// study exists to tell, because this is the first thing most staff open:
//
//   Current rates: operating ratio 0.97 — the system covers today's bills and
//   nothing else. No depreciation is funded, base charges recover barely a
//   third of costs, and the five-year projection runs the fund balance
//   negative by year 2. This is what "we haven't raised rates in a decade"
//   looks like on paper.
//
//   Proposed rates: operating ratio 1.27, debt service coverage comfortably
//   above covenant, a funded depreciation and capital set-aside, and a fund
//   balance that clears the $50,000 target in year 1.
//
//   The trade-off is visible too: the bill at 5,000 gallons rises from $44.25
//   to $67.25, moving the affordability index from 1.21% to 1.84% of monthly
//   MHI — above the 1.50% that supports a USDA RD grant case, still under the
//   2.00% EPA affordability line. That tension is the conversation a board
//   actually has, so the sample should show it rather than hide it.
//
// If these figures are edited, re-run `npm test` — validate.test.js asserts
// the sample raises no blocking data-quality findings.
export function makeSampleStudy() {
  const s = newStudy('Sample — Oak Hill Rural Water District');
  s.status = 'in-progress';
  s.systemInfo = {
    systemName: 'Oak Hill Rural Water District',
    pwsId: 'OK1234567',
    county: 'Pushmataha',
    studyYear: String(new Date().getFullYear()),
    populationServed: '650',
    sourceType: 'surface',
    systemType: 'community',
    ownerContact: 'Jane Smith, Manager',
    contactEmail: 'manager@oakhillrwd.example.org',
    contactPhone: '(580) 555-0142',
    address: 'Antlers, OK',
    latitude: 34.2317,
    longitude: -95.6219,
    waterBodySource: 'Hugo Lake',
  };
  s.demographics = {
    medianMonthlyHHI: '3650',
    effectiveDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  };

  // Customer classes — Residential, Commercial, Pasture Tap enabled
  const tiers = (rates) => rates.map((r, i) => ({ gal: 1000 * (i + 1), rate: String(r) }));
  s.classes = s.classes.map(c => {
    if (c.id === 'res') {
      return {
        ...c, enabled: true,
        // Usage distribution (drives revenue): 240 customers across usage
        // levels, including a handful of high-volume users past the last
        // rate block — the case average-based revenue gets wrong.
        usage: [
          { customers: '60', gallons: '2000', note: 'From billing register' },
          { customers: '80', gallons: '3500', note: '' },
          { customers: '60', gallons: '5000', note: '' },
          { customers: '30', gallons: '8000', note: '' },
          { customers: '10', gallons: '20000', note: 'Poultry operations' },
        ],
        cur:  { customers: '240', gallonsSold: '1080000', minCharge: '18.00', tiers: tiers([4.25, 4.75, 5.25, 5.75, 6.25, 6.75]) },
        prop: { customers: '240', gallonsSold: '1080000', minCharge: '30.00', tiers: tiers([6.25, 6.85, 7.45, 8.05, 8.65, 9.25]) },
      };
    }
    if (c.id === 'com') {
      return {
        ...c, enabled: true,
        cur:  { customers: '14', gallonsSold: '320000', minCharge: '32.00', tiers: tiers([4.75, 5.25, 5.75, 6.25, 6.75, 7.25]) },
        prop: { customers: '14', gallonsSold: '320000', minCharge: '52.00', tiers: tiers([6.75, 7.35, 7.95, 8.55, 9.15, 9.75]) },
      };
    }
    if (c.id === 'pas') {
      return {
        ...c, enabled: true,
        cur:  { customers: '6', gallonsSold: '24000', minCharge: '15.00', tiers: tiers([3.50, 3.50, 3.50, 3.50, 3.50, 3.50]) },
        prop: { customers: '6', gallonsSold: '24000', minCharge: '24.00', tiers: tiers([4.75, 4.75, 4.75, 4.75, 4.75, 4.75]) },
      };
    }
    return c;
  });

  // Current budget — what the system spends today. Note the zeros on
  // depreciation and the long-range plan: nothing is being set aside for the
  // pumps and tank that will need replacing, which is the single most common
  // finding in a small-system rate study.
  s.curBudget = {
    emp: { salaries: '5800', healthIns: '900', retirement: '350', uniforms: '75', workersComp: '150', contractLabor: '250', other1: '', other2: '' },
    ofc: { rent: '250', electric: '165', naturalGas: '0', phone: '190', equipment: '80', supplies: '110', audit: '300', other1: '', other2: '' },
    plt: { tools: '140', chemicals: '420', utilities: '1150', treatment: '380', other: '' },
    dst: { tools: '180', parts: '300', chemicals: '0', utilities: '150', other1: '', other2: '' },
    veh: { maint: '190', fuel: '330', insurance: '160', other1: '', other2: '' },
    loa: { newLoan: '0', owrb: '1050', bank: '0', other: '' },
    oth: { depreciation: '0', longRange: '0', insurance: '380', membership: '85', purchasedWater: '0', attorney: '100', engineer: '150', other: '' },
  };
  // Proposed budget — modest inflation on operations, a new loan payment for
  // the planned meter replacement, and the depreciation and capital
  // set-asides the current budget is missing.
  s.propBudget = {
    emp: { salaries: '5850', healthIns: '1000', retirement: '380', uniforms: '85', workersComp: '170', contractLabor: '200', other1: '', other2: '' },
    ofc: { rent: '260', electric: '180', naturalGas: '0', phone: '205', equipment: '90', supplies: '115', audit: '330', other1: '', other2: '' },
    plt: { tools: '160', chemicals: '450', utilities: '1120', treatment: '380', other: '' },
    dst: { tools: '180', parts: '320', chemicals: '0', utilities: '170', other1: '', other2: '' },
    veh: { maint: '200', fuel: '350', insurance: '200', other1: '', other2: '' },
    loa: { newLoan: '350', owrb: '1050', bank: '0', other: '' },
    oth: { depreciation: '700', longRange: '400', insurance: '400', membership: '95', purchasedWater: '0', attorney: '100', engineer: '160', other: '' },
  };

  s.forecast = {
    inflationRate: '3',
    revenueGrowth: '0',
    accountGrowth: '1',
    beginFundBalance: '12500',
    targetFundBalance: '50000',
    debtService: ['', '', '', '', ''],
    knownItems: [
      { label: 'Meter replacement program', vals: ['', '18000', '', '', ''] },
      { label: 'USDA RD planning grant (offset)', vals: ['', '-9000', '', '', ''] },
    ],
  };

  s.reportNotes = 'Sample study auto-generated to demonstrate the tool. Numbers are illustrative only.';
  return s;
}
