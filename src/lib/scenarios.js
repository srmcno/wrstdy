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

export function scenarioAdjustmentsForClasses(classes = [], activeScenario = {}) {
  const saved = activeScenario?.adjustments || activeScenario || {};
  const ids = new Set([
    ...Object.keys(DEFAULT_SCENARIO_ADJUSTMENTS),
    ...classes.map(c => c?.id).filter(Boolean),
  ]);

  return Array.from(ids).reduce((acc, id) => {
    acc[id] = nv(saved[id] ?? DEFAULT_SCENARIO_ADJUSTMENTS[id] ?? 1);
    return acc;
  }, {});
}
