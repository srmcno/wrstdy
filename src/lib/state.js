import { SK } from './constants.js';

export const defaultTiers = () => [
  { gal: 1000, rate: '' }, { gal: 2000, rate: '' }, { gal: 3000, rate: '' },
  { gal: 4000, rate: '' }, { gal: 5000, rate: '' }, { gal: 6000, rate: '' }
];

export const mkClass = (id, name, enabled = false) => ({
  id, name, enabled,
  // Optional customer usage distribution: how many customers fall at each
  // monthly-usage level. Shared by the Current and Proposed sides (usage is a
  // property of the customers, not the rates). When present, revenue is
  // computed bracket-by-bracket instead of from the class average.
  usage: [],
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

const uuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const defaultForecast = () => ({
  inflationRate: '3', revenueGrowth: '0', accountGrowth: '0',
  beginFundBalance: '0', targetFundBalance: '5000',
  debtService: ['', '', '', '', ''],
  knownItems: [{ label: '', vals: ['', '', '', '', ''] }]
});

const defaultSystemInfo = (yr = String(new Date().getFullYear())) => ({
  systemName: '', pwsId: '', county: '', studyYear: yr,
  populationServed: '', sourceType: 'groundwater', systemType: 'community',
  ownerContact: '', contactEmail: '', contactPhone: '',
  address: '', latitude: null, longitude: null,
  waterBodySource: '', // e.g. "Hugo Lake", "Antlers Aquifer"
});

const normalizeSide = (side = {}) => ({
  customers: side.customers ?? '',
  gallonsSold: side.gallonsSold ?? '',
  minCharge: side.minCharge ?? '',
  tiers: Array.isArray(side.tiers) && side.tiers.length > 0
    ? side.tiers.map((t, i) => ({ gal: t?.gal ?? 1000 * (i + 1), rate: t?.rate ?? '', ...(t?.label ? { label: t.label } : {}) }))
    : defaultTiers(),
});

const normalizeUsage = (usage) =>
  Array.isArray(usage)
    ? usage.filter(b => b && typeof b === 'object').map(b => ({
      customers: b.customers ?? '',
      gallons: b.gallons ?? '',
      note: b.note ?? '',
    }))
    : [];

const normalizeBudget = (budget = {}) => {
  const base = defBudget();
  return Object.fromEntries(
    Object.entries(base).map(([section, fields]) => [
      section,
      { ...fields, ...(budget?.[section] && typeof budget[section] === 'object' ? budget[section] : {}) },
    ]),
  );
};

const normalizeForecast = (forecast = {}) => {
  const base = defaultForecast();
  const knownItems = Array.isArray(forecast?.knownItems) && forecast.knownItems.length > 0
    ? forecast.knownItems.map(item => ({
      label: item?.label ?? '',
      vals: Array.from({ length: 5 }, (_, i) => item?.vals?.[i] ?? ''),
    }))
    : base.knownItems;
  return {
    ...base,
    ...(forecast && typeof forecast === 'object' ? forecast : {}),
    debtService: Array.from({ length: 5 }, (_, i) => forecast?.debtService?.[i] ?? ''),
    knownItems,
  };
};

const normalizeClasses = (classes) => {
  const base = defaultClasses();
  const incoming = Array.isArray(classes) ? classes : [];
  const byId = new Map(incoming.filter(Boolean).map(c => [c.id, c]));
  const merged = base.map(def => {
    const c = byId.get(def.id) || {};
    return {
      ...def,
      ...c,
      id: c.id || def.id,
      name: c.name ?? def.name,
      enabled: Boolean(c.enabled ?? def.enabled),
      usage: normalizeUsage(c.usage),
      cur: normalizeSide(c.cur || def.cur),
      prop: normalizeSide(c.prop || def.prop),
    };
  });
  for (const c of incoming) {
    if (!c?.id || byId.has(c.id) && base.some(def => def.id === c.id)) continue;
    merged.push({
      ...mkClass(c.id, c.name || c.id, Boolean(c.enabled)),
      ...c,
      usage: normalizeUsage(c.usage),
      cur: normalizeSide(c.cur),
      prop: normalizeSide(c.prop),
    });
  }
  return merged;
};

export function normalizeStudy(study = {}) {
  const yr = String(new Date().getFullYear());
  const now = new Date().toISOString();
  const safeStudy = study && typeof study === 'object' ? study : {};
  return {
    ...safeStudy,
    id: safeStudy.id || uuid(),
    name: safeStudy.name || `Rate Study ${yr}`,
    status: safeStudy.status || 'draft',
    createdAt: safeStudy.createdAt || now,
    updatedAt: safeStudy.updatedAt || safeStudy.createdAt || now,
    systemInfo: { ...defaultSystemInfo(yr), ...(safeStudy.systemInfo || {}) },
    demographics: { medianMonthlyHHI: '', effectiveDate: '', ...(safeStudy.demographics || {}) },
    classes: normalizeClasses(safeStudy.classes),
    curBudget: normalizeBudget(safeStudy.curBudget),
    propBudget: normalizeBudget(safeStudy.propBudget),
    forecast: normalizeForecast(safeStudy.forecast),
    scenarios: Array.isArray(safeStudy.scenarios) ? safeStudy.scenarios : [],
    activeScenario: safeStudy.activeScenario || undefined,
    aiAnalysis: { content: '', generatedAt: '', ...(safeStudy.aiAnalysis || {}) },
    aiHistory: Array.isArray(safeStudy.aiHistory) ? safeStudy.aiHistory : [],
    reportNotes: safeStudy.reportNotes || '',
    // Set when "Export Study (.json)" is used for this study — drives a
    // reminder banner when real data exists but hasn't been backed up since
    // (localStorage is this tool's only persistence; clearing browser data
    // or switching machines without exporting first loses the study).
    lastExportedAt: safeStudy.lastExportedAt || null,
  };
}

export function newStudy(name = '') {
  return normalizeStudy({ name });
}

export const loadDB = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SK));
    return Array.isArray(raw) ? raw.map(normalizeStudy) : [];
  } catch {
    return [];
  }
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
