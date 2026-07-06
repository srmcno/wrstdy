import { newStudy } from './state.js';

// A realistic example rate study so new users can explore the tool's full
// workflow without manually entering data. Numbers are illustrative for a
// ~250-customer rural water district in southeastern Oklahoma.
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
        prop: { customers: '240', gallonsSold: '1080000', minCharge: '24.00', tiers: tiers([5.50, 6.00, 6.50, 7.00, 7.50, 8.00]) },
      };
    }
    if (c.id === 'com') {
      return {
        ...c, enabled: true,
        cur:  { customers: '14', gallonsSold: '320000', minCharge: '32.00', tiers: tiers([4.75, 5.25, 5.75, 6.25, 6.75, 7.25]) },
        prop: { customers: '14', gallonsSold: '320000', minCharge: '40.00', tiers: tiers([6.00, 6.50, 7.00, 7.50, 8.00, 8.50]) },
      };
    }
    if (c.id === 'pas') {
      return {
        ...c, enabled: true,
        cur:  { customers: '6', gallonsSold: '24000', minCharge: '15.00', tiers: tiers([3.50, 3.50, 3.50, 3.50, 3.50, 3.50]) },
        prop: { customers: '6', gallonsSold: '24000', minCharge: '18.00', tiers: tiers([4.00, 4.00, 4.00, 4.00, 4.00, 4.00]) },
      };
    }
    return c;
  });

  // Budget — current and proposed
  s.curBudget = {
    emp: { salaries: '7200', healthIns: '1100', retirement: '420', uniforms: '85', workersComp: '180', contractLabor: '300', other1: '', other2: '' },
    ofc: { rent: '650', electric: '180', naturalGas: '0', phone: '210', equipment: '90', supplies: '120', audit: '350', other1: '', other2: '' },
    plt: { tools: '160', chemicals: '480', utilities: '1450', treatment: '620', other: '' },
    dst: { tools: '210', parts: '340', chemicals: '0', utilities: '180', other1: '', other2: '' },
    veh: { maint: '220', fuel: '380', insurance: '180', other1: '', other2: '' },
    loa: { newLoan: '0', owrb: '1850', bank: '0', other: '' },
    oth: { depreciation: '0', longRange: '0', insurance: '420', membership: '95', purchasedWater: '0', attorney: '120', engineer: '180', other: '' },
  };
  s.propBudget = {
    emp: { salaries: '8100', healthIns: '1320', retirement: '480', uniforms: '95', workersComp: '210', contractLabor: '400', other1: '', other2: '' },
    ofc: { rent: '700', electric: '210', naturalGas: '0', phone: '230', equipment: '100', supplies: '140', audit: '400', other1: '', other2: '' },
    plt: { tools: '180', chemicals: '560', utilities: '1620', treatment: '720', other: '' },
    dst: { tools: '240', parts: '420', chemicals: '0', utilities: '210', other1: '', other2: '' },
    veh: { maint: '260', fuel: '440', insurance: '200', other1: '', other2: '' },
    loa: { newLoan: '350', owrb: '1850', bank: '0', other: '' },
    oth: { depreciation: '850', longRange: '500', insurance: '460', membership: '110', purchasedWater: '0', attorney: '140', engineer: '220', other: '' },
  };

  s.forecast = {
    inflationRate: '3',
    revenueGrowth: '0',
    accountGrowth: '1',
    beginFundBalance: '12500',
    targetFundBalance: '50000',
    debtService: ['', '', '', '', ''],
    knownItems: [{ label: '', vals: ['', '', '', '', ''] }],
  };

  s.reportNotes = 'Sample study auto-generated to demonstrate the tool. Numbers are illustrative only.';
  return s;
}
