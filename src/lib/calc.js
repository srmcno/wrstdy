export const nv = (v) => parseFloat(v) || 0;

// Normalize a tier list for billing: numeric breakpoints, sorted ascending,
// non-increasing/zero breakpoints dropped. Unsorted or duplicate breakpoints
// previously aborted the billing loop early and silently mis-billed the
// remaining gallons at the wrong rate.
export function normalizeTiers(tiers = []) {
  const safe = (Array.isArray(tiers) ? tiers : [])
    .map(t => ({ gal: nv(t?.gal), rate: nv(t?.rate), label: t?.label || '' }))
    .filter(t => t.gal > 0)
    .sort((a, b) => a.gal - b.gal);
  const out = [];
  for (const t of safe) {
    if (out.length === 0 || t.gal > out[out.length - 1].gal) out.push(t);
  }
  return out;
}

// Bill using $/1000 gal tiers; each tier covers up to tier.gal cumulative gallons.
// Usage beyond the final breakpoint continues at the final tier's rate — the
// last block extends to infinity, so 20,000/30,000/40,000-gallon customers are
// billed in full even when the table only lists blocks up to 5,000 or 10,000.
export function calcBill(minCharge, tiers = [], gallons) {
  const safeTiers = normalizeTiers(tiers);
  let bill = nv(minCharge), rem = nv(gallons), prev = 0;
  for (const t of safeTiers) {
    const block = Math.min(rem, t.gal - prev);
    if (block <= 0) break;
    bill += (block / 1000) * t.rate;
    rem -= block; prev = t.gal;
    if (rem <= 0) break;
  }
  if (rem > 0 && safeTiers.length > 0) {
    bill += (rem / 1000) * safeTiers[safeTiers.length - 1].rate;
  }
  return bill;
}

// Cumulative bill at each tier's configured gallon breakpoint.
export function tierTopAmounts(minCharge, tiers = []) {
  const safeTiers = Array.isArray(tiers) ? tiers : [];
  return safeTiers.map(t => calcBill(minCharge, safeTiers, nv(t?.gal)));
}

// ─── Customer usage distribution ────────────────────────────────────────────
// A class can carry a usage distribution: how many customers fall at each
// monthly-usage level (e.g. 100 @ 1,000 gal, 50 @ 2,000 gal, 10 @ 20,000 gal).
// Consumption is a property of the customers, not of the rate structure, so
// the distribution lives on the class and is shared by the Current and
// Proposed sides — only the rates differ between the two.

export function usageBrackets(cls = {}) {
  return (Array.isArray(cls.usage) ? cls.usage : []).filter(b => nv(b?.customers) > 0);
}

export function hasUsageDistribution(cls = {}) {
  return usageBrackets(cls).length > 0;
}

// Effective customer count for a class side: derived from the distribution
// when one is entered, otherwise the side's manual customer count.
export function classCustomers(cls = {}, isProposed) {
  const brackets = usageBrackets(cls);
  if (brackets.length > 0) return brackets.reduce((s, b) => s + nv(b.customers), 0);
  const d = (isProposed ? cls.prop : cls.cur) || {};
  return nv(d.customers);
}

// Effective total monthly gallons for a class side.
export function classGallons(cls = {}, isProposed) {
  const brackets = usageBrackets(cls);
  if (brackets.length > 0) return brackets.reduce((s, b) => s + nv(b.customers) * nv(b.gallons), 0);
  const d = (isProposed ? cls.prop : cls.cur) || {};
  return nv(d.gallonsSold);
}

// Class revenue. When a usage distribution is present, revenue is computed
// bracket-by-bracket against the actual tier structure — Σ customersᵢ ×
// bill(gallonsᵢ) — so changing any single block's rate (including blocks only
// high-use customers reach) moves revenue correctly. Without a distribution it
// falls back to the legacy approximation of billing every customer at the
// class average (total gallons ÷ customers), which understates revenue for
// increasing-block tariffs whenever usage varies across customers.
export function classMonthlyIncome(cls = {}, isProposed) {
  const d = (isProposed ? cls.prop : cls.cur) || {};
  const brackets = usageBrackets(cls);
  if (brackets.length > 0) {
    const cust = brackets.reduce((s, b) => s + nv(b.customers), 0);
    const monthly = brackets.reduce(
      (s, b) => s + nv(b.customers) * calcBill(d.minCharge, d.tiers || [], nv(b.gallons)),
      0,
    );
    const fixed = cust * nv(d.minCharge);
    return { monthly, annual: monthly * 12, fixed, volumetric: monthly - fixed };
  }
  const cust = nv(d.customers);
  if (cust <= 0) return { monthly: 0, annual: 0, fixed: 0, volumetric: 0 };
  const totalGal = nv(d.gallonsSold) || 0;
  const avgGal = cust > 0 ? totalGal / cust : 0;
  const bill = calcBill(d.minCharge, d.tiers || [], avgGal);
  const monthly = cust * bill;
  const fixed = cust * nv(d.minCharge);
  const volumetric = monthly - fixed;
  return { monthly, annual: monthly * 12, fixed, volumetric };
}

export function budgetTotal(b = {}) {
  const flat = (obj = {}) => Object.values(obj || {}).reduce((s, v) => s + nv(v), 0);
  const emp = flat(b.emp), ofc = flat(b.ofc), plt = flat(b.plt),
        dst = flat(b.dst), veh = flat(b.veh), loa = flat(b.loa), oth = flat(b.oth);
  return { emp, ofc, plt, dst, veh, loa, oth, total: emp + ofc + plt + dst + veh + loa + oth };
}

export function totalRevenue(classes = [], isProposed) {
  return (Array.isArray(classes) ? classes : []).filter(c => c?.enabled).reduce((s, c) => {
    const d = classMonthlyIncome(c, isProposed);
    return {
      monthly: s.monthly + d.monthly,
      annual: s.annual + d.annual,
      fixed: s.fixed + d.fixed,
      volumetric: s.volumetric + d.volumetric
    };
  }, { monthly: 0, annual: 0, fixed: 0, volumetric: 0 });
}

// Total monthly gallons across enabled classes (distribution-aware).
export function totalGallons(classes = [], isProposed) {
  return (Array.isArray(classes) ? classes : []).filter(c => c?.enabled)
    .reduce((s, c) => s + classGallons(c, isProposed), 0);
}

// Metrics below return null (not 0) when the inputs needed to compute them
// are missing — a partially-filled study should read "insufficient data",
// not a red "0.00 below break-even".

export function costPer1000(budget, classes = [], isProposed) {
  const exp = budgetTotal(budget).total;
  const gal = totalGallons(classes, isProposed);
  return gal > 0 ? (exp / (gal / 1000)) : null;
}

export function cost5000(classes = [], isProposed) {
  const safeClasses = Array.isArray(classes) ? classes : [];
  const res = safeClasses.find(c => c?.enabled && c?.id === 'res') || safeClasses.find(c => c?.enabled);
  if (!res) return 0;
  const d = (isProposed ? res.prop : res.cur) || {};
  return calcBill(d.minCharge, d.tiers || [], 5000);
}

export function affordabilityIndex(classes, isProposed, mhi) {
  const c5 = cost5000(classes, isProposed);
  const m = nv(mhi);
  return m > 0 ? c5 / m : null;
}

// ─── Customer bill impact examples ──────────────────────────────────────────
// Board/public-facing "what does my bill look like" table: current vs.
// proposed bill at a handful of representative monthly usage levels, for
// every enabled class (not just Residential) — a system with a separate
// Sewer class, for example, gets its own row set.
export const BILL_IMPACT_LEVELS = [1000, 2000, 5000, 10000];

// True once a rate side has at least one real, non-zero value entered — a
// base charge or a tier rate. Used to tell "nothing entered yet" (report N/A)
// apart from "genuinely a $0 charge" (report $0.00), the same distinction the
// rest of this module draws for every other metric. Takes already-normalized
// tiers (see normalizeTiers) — checking raw, unnormalized tiers would let a
// padded/invalid slot (e.g. a cleared "Block up to (gal)" field that still
// has a leftover rate typed in) make an otherwise-empty side look populated,
// even though that slot never survives into the tiers actually billed/shown.
function sideHasRates(minCharge, normalizedTiers) {
  return nv(minCharge) > 0 || normalizedTiers.some(t => t.rate > 0);
}

export function billImpactForClass(cls = {}, levels = BILL_IMPACT_LEVELS) {
  const curSide = cls?.cur || {};
  const propSide = cls?.prop || {};
  const curTiers = normalizeTiers(curSide.tiers);
  const propTiers = normalizeTiers(propSide.tiers);
  const curHasData = sideHasRates(curSide.minCharge, curTiers);
  const propHasData = sideHasRates(propSide.minCharge, propTiers);
  return levels.map(gal => {
    const cur = curHasData ? calcBill(curSide.minCharge, curTiers, gal) : null;
    const prop = propHasData ? calcBill(propSide.minCharge, propTiers, gal) : null;
    const delta = cur != null && prop != null ? prop - cur : null;
    return { gal, cur, prop, delta, pct: delta != null && cur > 0 ? delta / cur : null };
  });
}

export function billImpactExamples(classes = [], levels = BILL_IMPACT_LEVELS) {
  return (Array.isArray(classes) ? classes : [])
    .filter(c => c?.enabled)
    .map(c => ({ name: c.name || c.id, rows: billImpactForClass(c, levels) }));
}

// ─── Rate structure comparison ──────────────────────────────────────────────
// Current vs. proposed base charge and tier-by-tier rate, per enabled class —
// the same comparison Step 2's "Compare" tab shows on screen, computed once
// here so the Final Report and PDF/DOCX exports can carry it too instead of
// only the aggregate per-class revenue total.
export function rateStructureComparison(classes = []) {
  return (Array.isArray(classes) ? classes : [])
    .filter(c => c?.enabled)
    .map(c => {
      // normalizeTiers (the same normalization calcBill applies before
      // billing) filters out padded/invalid entries — normalizeStudy pads
      // every class to 6 tier slots, and a cleared "Block up to (gal)" field
      // becomes gal: 0 via Number('') — and sorts/dedupes so this comparison
      // never shows a bogus "Up to 0 gal" row or an out-of-order tier list.
      const curTiers = normalizeTiers(c.cur?.tiers);
      const propTiers = normalizeTiers(c.prop?.tiers);
      const curHasData = sideHasRates(c.cur?.minCharge, curTiers);
      const propHasData = sideHasRates(c.prop?.minCharge, propTiers);
      // A side's own rate for usage AT a given gallon breakpoint — the first
      // of that side's tiers whose breakpoint covers it, or its final tier's
      // rate if the breakpoint exceeds every configured block (calcBill's
      // "usage beyond the last block continues at the final rate" behavior).
      // Evaluated independently per side, NOT by matching array index —
      // current and proposed can have entirely different breakpoints (a
      // sub-1,000-gal lifeline block on one side only, say), so pairing by
      // index would compare unrelated gallon levels or silently drop a real
      // breakpoint whenever the two tier counts happened to match.
      const rateAtGal = (tiers, gal) => {
        if (tiers.length === 0) return null;
        const covering = tiers.find(t => t.gal >= gal);
        return nv((covering ?? tiers[tiers.length - 1]).rate);
      };
      // Union of every real breakpoint from either side, ascending — each is
      // a meaningful "up to X gal" row even when the two tier structures
      // don't line up 1:1.
      const uniqueGals = Array.from(new Set([...curTiers, ...propTiers].map(t => t.gal))).sort((a, b) => a - b);
      const tiers = uniqueGals.map(gal => {
        const label = propTiers.find(t => t.gal === gal)?.label || curTiers.find(t => t.gal === gal)?.label || '';
        const cur = curHasData ? rateAtGal(curTiers, gal) : null;
        const prop = propHasData ? rateAtGal(propTiers, gal) : null;
        const delta = cur != null && prop != null ? prop - cur : null;
        return { gal, label, cur, prop, delta };
      });
      const curMinCharge = curHasData ? nv(c.cur?.minCharge) : null;
      const propMinCharge = propHasData ? nv(c.prop?.minCharge) : null;
      const minChargeDelta = curMinCharge != null && propMinCharge != null ? propMinCharge - curMinCharge : null;
      return { name: c.name || c.id, curMinCharge, propMinCharge, minChargeDelta, tiers };
    });
}

export function operatingRatio(rev, expTotal) {
  return expTotal > 0 ? rev / expTotal : null;
}

export function debtToIncome(budget, rev) {
  const loa = budget?.loa || {};
  const debt = nv(loa.newLoan) + nv(loa.owrb) + nv(loa.bank) + nv(loa.other);
  return rev > 0 ? debt / rev : null;
}

// Debt Service Coverage Ratio — the metric USDA RD / OWRB loan covenants are
// written against (typically ≥ 1.15–1.25). Net revenue available for debt
// service = revenue − operating expenses, where operating expenses exclude
// debt payments themselves and the discretionary reserve set-asides
// (depreciation / long-range) that sit below the line.
export function debtServiceCoverage(budget, rev) {
  const bt = budgetTotal(budget);
  const debt = bt.loa;
  if (!(debt > 0)) return null;
  const setAsides = nv(budget?.oth?.depreciation) + nv(budget?.oth?.longRange);
  const opEx = bt.total - bt.loa - setAsides;
  return (rev - opEx) / debt;
}

export function baseCoverage(classes, isProposed, expTotal) {
  const fixed = (Array.isArray(classes) ? classes : []).filter(c => c?.enabled).reduce((s, c) => {
    const d = (isProposed ? c.prop : c.cur) || {};
    return s + classCustomers(c, isProposed) * nv(d.minCharge);
  }, 0);
  return expTotal > 0 ? fixed / expTotal : null;
}

// ─── True Cost of Service ───────────────────────────────────────────────────
// Board-facing summary: what one thousand gallons actually costs the system
// to produce and deliver, versus what one thousand gallons currently earns —
// and the across-the-board adjustment needed to break even.
export function trueCostOfService(budget, classes = [], isProposed) {
  const annualExpenses = budgetTotal(budget).total * 12;
  const monthlyGal = totalGallons(classes, isProposed);
  const annualGallons = monthlyGal * 12;
  const annualRevenue = totalRevenue(classes, isProposed).annual;
  const costPer1k = annualGallons > 0 ? annualExpenses / (annualGallons / 1000) : null;
  const revenuePer1k = annualGallons > 0 ? annualRevenue / (annualGallons / 1000) : null;
  return {
    annualExpenses,
    annualGallons,
    annualRevenue,
    costPer1k,
    revenuePer1k,
    gapPer1k: costPer1k != null && revenuePer1k != null ? costPer1k - revenuePer1k : null,
    gapAnnual: annualExpenses - annualRevenue,
    // Uniform % rate adjustment for revenue to cover expenses (negative = surplus).
    breakEvenAdjustment: annualRevenue > 0 ? annualExpenses / annualRevenue - 1 : null,
  };
}

// ─── 5-year projection ──────────────────────────────────────────────────────
// Two tracks: "current" (current rates + current budget) and "proposed"
// (proposed rates + proposed budget). Operating expenses escalate with the
// forecast inflation rate. When a per-year debt-service schedule is entered,
// it replaces the budget's loan/debt lines for that year (debt payments are
// set by amortization schedules, not inflation). Known one-time items add to
// (positive) or offset (negative) that year's expenses for both tracks.
export function calc5Yr(classes, curBudget, propBudget, forecast = {}) {
  const inf = 1 + nv(forecast.inflationRate) / 100;
  const revenueGrowth = nv(forecast.revenueGrowth) / 100;
  const accountGrowth = nv(forecast.accountGrowth) / 100;
  const revGrowthFactor = (1 + revenueGrowth) * (1 + accountGrowth);
  const curRev = totalRevenue(classes, false).annual;
  const propRev = totalRevenue(classes, true).annual;
  const curBT = budgetTotal(curBudget);
  const propBT = budgetTotal(propBudget);
  const debtSchedule = Array.from({ length: 5 }, (_, i) => forecast?.debtService?.[i]);
  const useSchedule = debtSchedule.some(v => String(v ?? '').trim() !== '' && nv(v) !== 0);
  const knownRows = Array.isArray(forecast?.knownItems) ? forecast.knownItems : [];
  const knownAt = (i) => knownRows.reduce((s, item) => s + nv(item?.vals?.[i]), 0);

  let beginFB = nv(forecast.beginFundBalance);
  const target = nv(forecast.targetFundBalance);
  const yrs = ['FY1', 'FY2', 'FY3', 'FY4', 'FY5'];
  const rows = {
    curRevArr: [], propRevArr: [],
    curExpArr: [], propExpArr: [], expArr: [],
    debtArr: [], knownArr: [],
    curFBArr: [], propFBArr: [], targetArr: []
  };
  let curFB = beginFB, propFB = beginFB;
  for (let i = 0; i < 5; i++) {
    const esc = Math.pow(inf, i);
    const revMultiplier = Math.pow(revGrowthFactor, i);
    const curYrRev = curRev * revMultiplier;
    const propYrRev = propRev * revMultiplier;
    const known = knownAt(i);
    let curExp, propExp, debtYr;
    if (useSchedule) {
      const raw = debtSchedule[i];
      debtYr = String(raw ?? '').trim() === '' ? null : nv(raw);
      const curDebt = debtYr == null ? curBT.loa * 12 : debtYr;
      const propDebt = debtYr == null ? propBT.loa * 12 : debtYr;
      curExp = (curBT.total - curBT.loa) * 12 * esc + curDebt + known;
      propExp = (propBT.total - propBT.loa) * 12 * esc + propDebt + known;
      rows.debtArr.push(debtYr == null ? propDebt : debtYr);
    } else {
      curExp = curBT.total * 12 * esc + known;
      propExp = propBT.total * 12 * esc + known;
      rows.debtArr.push(propBT.loa * 12);
    }
    rows.curRevArr.push(curYrRev);
    rows.propRevArr.push(propYrRev);
    rows.curExpArr.push(curExp);
    rows.propExpArr.push(propExp);
    rows.expArr.push(propExp); // legacy alias — consumers read expArr as the proposed-track expenses
    rows.knownArr.push(known);
    curFB += curYrRev - curExp; rows.curFBArr.push(curFB);
    propFB += propYrRev - propExp; rows.propFBArr.push(propFB);
    rows.targetArr.push(target);
  }
  return { yrs, ...rows };
}

export function calcHML(cls = {}, isProposed, mhi) {
  const m = nv(mhi);
  if (!(m > 0)) return null;
  const d = (isProposed ? cls.prop : cls.cur) || {};
  const vol5000 = calcBill(0, d.tiers || [], 5000); // bill with $0 base
  return {
    low: Math.max(0, m * 0.015 - vol5000),
    med: Math.max(0, m * 0.020 - vol5000),
    high: Math.max(0, m * 0.025 - vol5000)
  };
}

export const fmt = {
  c: (v) => '$' + nv(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  p: (v) => (nv(v) * 100).toFixed(2) + '%',
  px: (v) => nv(v).toFixed(2) + '%',
  n: (v) => nv(v).toLocaleString('en-US'),
  r: (v) => '$' + nv(v).toFixed(2),
  // Null-aware variants: metrics return null when their inputs are missing.
  ratio: (v, dash = '—') => (v == null ? dash : nv(v).toFixed(2)),
  pd: (v, dash = '—') => (v == null ? dash : (nv(v) * 100).toFixed(2) + '%'),
  cd: (v, dash = '—') => (v == null ? dash : fmt.c(v)),
  date: (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
  short: (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : ''
};
