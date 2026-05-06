import { nv } from './calc.js';

export const DEFAULT_SCENARIO_ADJUSTMENTS = Object.freeze({
  res: 1,
  pas: 1,
  com: 1,
  who: 1,
  c5: 1,
  c6: 1,
  c7: 1,
});

export const DEFAULT_SCENARIO_RATE_BASIS = 'proposed';

export function scenarioAdjustmentsForClasses(classes = [], activeScenario = {}) {
  const saved = activeScenario?.adjustments || activeScenario || {};
  const ids = scenarioClassIds(classes);

  return Array.from(ids).reduce((acc, id) => {
    acc[id] = nv(saved[id] ?? DEFAULT_SCENARIO_ADJUSTMENTS[id] ?? 1);
    return acc;
  }, {});
}

export function scenarioRateBasisForClasses(classes = [], activeScenario = {}) {
  const saved = activeScenario?.rateBasis || {};
  const ids = scenarioClassIds(classes);

  return Array.from(ids).reduce((acc, id) => {
    acc[id] = saved[id] === 'current' ? 'current' : DEFAULT_SCENARIO_RATE_BASIS;
    return acc;
  }, {});
}

export function scenarioForClasses(classes = [], activeScenario = {}) {
  return {
    label: activeScenario?.label || 'Custom',
    adjustments: scenarioAdjustmentsForClasses(classes, activeScenario),
    rateBasis: scenarioRateBasisForClasses(classes, activeScenario),
  };
}

function scenarioClassIds(classes = []) {
  return new Set([
    ...Object.keys(DEFAULT_SCENARIO_ADJUSTMENTS),
    ...classes.map(c => c?.id).filter(Boolean),
  ]);
}
