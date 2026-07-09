// Per-step "has enough to be useful" heuristics for the wizard tab bar.
// These are soft completeness signals, not hard gates — every step stays
// navigable and editable regardless of what this reports. It only drives the
// small checkmark shown on each tab so staff can see at a glance which steps
// still need data, without having to open Financial Metrics or the Final
// Report to find a gap.

import { nv, totalRevenue, budgetTotal } from './calc.js';

export function stepCompletion(study = {}) {
  const si = study.systemInfo || {};
  const classes = study.classes || [];
  const propBudget = study.propBudget || {};

  const hasSystemInfo = Boolean((si.systemName || '').trim()) && nv(si.populationServed) > 0;
  const hasRates = totalRevenue(classes, true).monthly > 0;
  const hasBudget = budgetTotal(propBudget).total > 0;
  const hasFinancials = hasRates && hasBudget;
  const hasAiAnalysis = Boolean((study.aiAnalysis?.content || '').trim());
  const isComplete = study.status === 'complete';

  // One entry per STEPS id (0-7), in order.
  return [
    hasSystemInfo,
    hasRates,
    hasBudget,
    hasFinancials, // Financial Metrics — a derived view of rates + budget
    hasFinancials, // 5-Year Projection — needs rates + budget to be meaningful
    hasFinancials, // Scenarios — same
    hasAiAnalysis,
    isComplete,
  ];
}

const STALE_EXPORT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// App.jsx's export flow writes lastExportedAt without touching updatedAt, so
// in practice updated <= lastExport right after an export. This tolerance is
// a defensive margin against any millisecond-level clock skew between the two
// fields (e.g. a future code path that saves both near-simultaneously) rather
// than a fix for a known gap — it costs nothing and prevents that class of
// false positive outright.
const EDIT_TOLERANCE_MS = 5000;

// True once a study has real financial data entered but hasn't been backed
// up (Export Study .json) since — the only persistence is browser
// localStorage, so this is the one thing standing between an edit session
// and losing the study entirely.
export function needsBackupReminder(study = {}) {
  const classes = study.classes || [];
  const hasData = totalRevenue(classes, true).monthly > 0 || budgetTotal(study.propBudget || {}).total > 0;
  if (!hasData) return false;
  if (!study.lastExportedAt) return true;
  const lastExport = new Date(study.lastExportedAt).getTime();
  const updated = new Date(study.updatedAt || 0).getTime();
  return updated - lastExport > EDIT_TOLERANCE_MS && Date.now() - lastExport > STALE_EXPORT_MS;
}
