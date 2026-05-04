export const nv = (v) => parseFloat(v) || 0;

// Bill using $/1000 gal tiers; each tier covers up to tier.gal cumulative gallons.
export function calcBill(minCharge, tiers, gallons) {
  let bill = nv(minCharge), rem = nv(gallons), prev = 0;
  for (const t of tiers) {
    const top = nv(t.gal);
    const block = Math.min(rem, top - prev);
    if (block <= 0) break;
    bill += (block / 1000) * nv(t.rate);
    rem -= block; prev = top;
    if (rem <= 0) break;
  }
  if (rem > 0 && tiers.length > 0) {
    bill += (rem / 1000) * nv(tiers[tiers.length - 1].rate);
  }
  return bill;
}

// Cumulative bill at the top of each tier block (1,000 gal blocks)
export function tierTopAmounts(minCharge, tiers) {
  const res = [];
  let cum = nv(minCharge);
  for (let i = 0; i < tiers.length; i++) {
    cum += nv(tiers[i].rate); // each 1,000 gal block × rate
    res.push(cum);
  }
  return res;
}

export function classMonthlyIncome(cls, isProposed) {
  const d = isProposed ? cls.prop : cls.cur;
  const cust = nv(d.customers);
  if (cust <= 0) return { monthly: 0, annual: 0, fixed: 0, volumetric: 0 };
  const totalGal = nv(d.gallonsSold) || 0;
  const avgGal = cust > 0 ? totalGal / cust : 0;
  const bill = calcBill(d.minCharge, d.tiers, avgGal);
  const monthly = cust * bill;
  const fixed = cust * nv(d.minCharge);
  const volumetric = monthly - fixed;
  return { monthly, annual: monthly * 12, fixed, volumetric };
}

export function budgetTotal(b) {
  const flat = (obj) => Object.values(obj).reduce((s, v) => s + nv(v), 0);
  const emp = flat(b.emp), ofc = flat(b.ofc), plt = flat(b.plt),
        dst = flat(b.dst), veh = flat(b.veh), loa = flat(b.loa), oth = flat(b.oth);
  return { emp, ofc, plt, dst, veh, loa, oth, total: emp + ofc + plt + dst + veh + loa + oth };
}

export function totalRevenue(classes, isProposed) {
  return classes.filter(c => c.enabled).reduce((s, c) => {
    const d = classMonthlyIncome(c, isProposed);
    return {
      monthly: s.monthly + d.monthly,
      annual: s.annual + d.annual,
      fixed: s.fixed + d.fixed,
      volumetric: s.volumetric + d.volumetric
    };
  }, { monthly: 0, annual: 0, fixed: 0, volumetric: 0 });
}

export function costPer1000(budget, classes, isProposed) {
  const exp = budgetTotal(budget).total;
  const gal = classes.filter(c => c.enabled).reduce((s, c) => {
    const d = isProposed ? c.prop : c.cur;
    return s + nv(d.gallonsSold);
  }, 0);
  return gal > 0 ? (exp / (gal / 1000)) : 0;
}

export function cost5000(classes, isProposed) {
  const res = classes.find(c => c.id === 'res') || classes.find(c => c.enabled);
  if (!res) return 0;
  const d = isProposed ? res.prop : res.cur;
  return calcBill(d.minCharge, d.tiers, 5000);
}

export function affordabilityIndex(classes, isProposed, mhi) {
  const c5 = cost5000(classes, isProposed);
  const m = nv(mhi);
  return m > 0 ? c5 / m : 0;
}

export function operatingRatio(rev, expTotal) {
  return expTotal > 0 ? rev / expTotal : 0;
}

export function debtToIncome(budget, rev) {
  const debt = nv(budget.loa.newLoan) + nv(budget.loa.owrb) + nv(budget.loa.bank) + nv(budget.loa.other);
  return rev > 0 ? debt / rev : 0;
}

export function baseCoverage(classes, isProposed, expTotal) {
  const fixed = classes.filter(c => c.enabled).reduce((s, c) => {
    const d = isProposed ? c.prop : c.cur;
    return s + nv(d.customers) * nv(d.minCharge);
  }, 0);
  return expTotal > 0 ? fixed / expTotal : 0;
}

export function calc5Yr(classes, curBudget, propBudget, forecast) {
  const inf = 1 + nv(forecast.inflationRate) / 100;
  const curRev = totalRevenue(classes, false).annual;
  const propRev = totalRevenue(classes, true).annual;
  const expBase = budgetTotal(propBudget).total * 12;
  let beginFB = nv(forecast.beginFundBalance);
  const target = nv(forecast.targetFundBalance);
  const yrs = ['FY1', 'FY2', 'FY3', 'FY4', 'FY5'];
  const rows = { curRevArr: [], propRevArr: [], expArr: [], curFBArr: [], propFBArr: [], targetArr: [] };
  let curFB = beginFB, propFB = beginFB;
  let exp = expBase;
  for (let i = 0; i < 5; i++) {
    if (i > 0) exp *= inf;
    rows.curRevArr.push(curRev);
    rows.propRevArr.push(propRev);
    rows.expArr.push(exp);
    curFB += curRev - exp; rows.curFBArr.push(curFB);
    propFB += propRev - exp; rows.propFBArr.push(propFB);
    rows.targetArr.push(target);
  }
  return { yrs, ...rows };
}

export function calcHML(cls, isProposed, mhi) {
  if (!mhi) return null;
  const d = isProposed ? cls.prop : cls.cur;
  const vol5000 = calcBill(0, d.tiers, 5000); // bill with $0 base
  const m = nv(mhi);
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
  date: (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
  short: (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : ''
};
