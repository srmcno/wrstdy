import { SK } from './constants.js';

export const defaultTiers = () => [
  { gal: 1000, rate: '' }, { gal: 2000, rate: '' }, { gal: 3000, rate: '' },
  { gal: 4000, rate: '' }, { gal: 5000, rate: '' }, { gal: 6000, rate: '' }
];

export const mkClass = (id, name, enabled = false) => ({
  id, name, enabled,
  cur: { customers: '', minCharge: '', tiers: defaultTiers() },
  prop: { customers: '', minCharge: '', tiers: defaultTiers() }
});

export const defaultClasses = () => [
  { ...mkClass('res', 'Residential Water', true) },
  mkClass('pas', 'Pasture Tap'),
  mkClass('com', 'Commercial Users'),
  mkClass('who', 'Wholesale'),
  mkClass('c5', ''), mkClass('c6', ''), mkClass('c7', '')
];

export const defBudget = () => ({
  emp: { salaries: '', healthIns: '', retirement: '', uniforms: '', workersComp: '', contractLabor: '', other1: '', other2: '' },
  ofc: { rent: '', electric: '', naturalGas: '', phone: '', equipment: '', supplies: '', audit: '', other1: '', other2: '' },
  plt: { tools: '', chemicals: '', utilities: '', treatment: '', other: '' },
  dst: { tools: '', parts: '', chemicals: '', utilities: '', other1: '', other2: '' },
  veh: { maint: '', fuel: '', insurance: '', other1: '', other2: '' },
  loa: { newLoan: '', owrb: '', bank: '', other: '' },
  oth: { depreciation: '', longRange: '', insurance: '', membership: '', purchasedWater: '', attorney: '', engineer: '', other: '' }
});

export function newStudy(name = '') {
  const yr = String(new Date().getFullYear());
  return {
    id: crypto.randomUUID(),
    name: name || `Rate Study ${yr}`,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    systemInfo: {
      systemName: '', pwsId: '', county: '', studyYear: yr,
      populationServed: '', sourceType: 'groundwater', systemType: 'community',
      ownerContact: '', contactEmail: '', contactPhone: '',
      address: '', latitude: null, longitude: null,
      waterBodySource: '', // e.g. "Hugo Lake", "Antlers Aquifer"
    },
    demographics: { medianMonthlyHHI: '', effectiveDate: '' },
    classes: defaultClasses(),
    curBudget: defBudget(),
    propBudget: defBudget(),
    forecast: {
      inflationRate: '3', revenueGrowth: '0', accountGrowth: '0',
      beginFundBalance: '0', targetFundBalance: '5000',
      debtService: ['', '', '', '', ''],
      knownItems: [{ label: '', vals: ['', '', '', '', ''] }]
    },
    scenarios: [],
    aiAnalysis: { content: '', generatedAt: '' },
    reportNotes: ''
  };
}

export const loadDB = () => {
  try { return JSON.parse(localStorage.getItem(SK)) || []; } catch { return []; }
};

// Save listeners — UI components subscribe to surface persistence failures
// (quota exceeded, opaque origin, disabled storage) instead of silently
// dropping data.
const saveListeners = new Set();
export function onSaveStatus(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }
function notify(status, err) { saveListeners.forEach(fn => { try { fn(status, err); } catch { /* ignore */ } }); }

export const saveDB = (s) => {
  try {
    localStorage.setItem(SK, JSON.stringify(s));
    notify('ok', null);
    return true;
  } catch (err) {
    notify('error', err);
    return false;
  }
};
