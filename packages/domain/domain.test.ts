import { describe, expect, it } from 'vitest';
import { capacityArithmetic, confusionArithmetic, coverageArithmetic, digitalArithmetic, discountedValue,
  economicArithmetic, inventoryArithmetic, safeRatio, scheduleFcfs, workcellArithmetic } from './algebra';
import { economicFields, evaluateEconomics, evaluateModel, modelFields, replaySimulation, simulateFlow,
  snapshotSimulation, validateMeasurement } from './index';
import type { ModelKind } from './index';

/*
 * Numeric vectors in this suite are abstract algebra exercises, NOT company,
 * robot, cost, scenario, customer or demonstration fixtures. They are never
 * submitted to a successful domain case or exported to application data.
 * The only accepted domain measurement below is a minimal real-source excerpt.
 */
describe('Mathematical invariants (not domain datasets)', () => {
  it('never equates an undefined ratio with zero', () => {
    expect(safeRatio(0, 0)).toBeNull();
    expect(safeRatio(3, 0)).toBeNull();
    expect(safeRatio(0, 3)).toBe(0);
  });
  it('rounds resources up, reports overload and conserves capacity-time', () => {
    const value = capacityArithmetic(7, 3, 2, 2);
    expect(value.requiredUnits).toBe(3);
    expect(value.capacityPerHour).toBe(6);
    expect(value.capacityOverWindow).toBe(12);
    expect(value.shortfallPerHour).toBe(1);
    expect(value.utilizationRequired).toBeCloseTo(7 / 6);
  });
  it('does not claim attainable demand when effective rate is zero', () => {
    const value = capacityArithmetic(7, 0, 2, 2);
    expect(value.requiredUnits).toBeNull();
    expect(value.utilizationRequired).toBeNull();
    expect(value.shortfallPerHour).toBe(7);
  });
  it('coverage needs enough resource-hours, not only enough robots', () => {
    const value = coverageArithmetic(13, 2, 3, 2);
    expect(value.requiredUnits).toBe(3);
    expect(value.capacityArea).toBe(12);
    expect(value.requiredHours).toBe(3.25);
    expect(value.shortfallArea).toBe(1);
  });
  it('applies availability and good yield exactly once', () => {
    const value = workcellArithmetic(100, 60, 0.5, 0.8, 2, 3);
    expect(value.effectiveUnitThroughput).toBe(24);
    expect(value.capacityOverWindow).toBe(144);
    expect(value.requiredUnits).toBe(5);
    expect(workcellArithmetic(100, 60, 0, 0.8, 2, 3).requiredUnits).toBeNull();
  });
  it('separates precision and recall with their correct populations', () => {
    const value = confusionArithmetic(3, 7, 1, 2);
    expect(value.inspectedCount).toBe(13);
    expect(value.precision).toBe(0.75);
    expect(value.recall).toBe(0.6);
    expect(value.accuracy).toBeCloseTo(10 / 13);
    expect(value.falsePositiveRate).toBe(0.125);
    expect(value.falseNegativeRate).toBe(0.4);
  });
  it('returns undefined diagnostic rates for empty mathematical populations', () => {
    expect(confusionArithmetic(0, 0, 0, 0)).toEqual({
      inspectedCount: 0, precision: null, recall: null, specificity: null,
      accuracy: null, falsePositiveRate: null, falseNegativeRate: null,
    });
  });
  it('distinguishes observation coverage, errors and their resolution', () => {
    const value = inventoryArithmetic(8, 10, 2, 1, 2);
    expect(value).toEqual({ coverage: 0.8, discrepancyRate: 0.25, resolutionRate: 0.5, unresolvedCount: 1, locationsPerHour: 4 });
    expect(inventoryArithmetic(0, 0, 0, 0, 2).coverage).toBeNull();
  });
  it('keeps released human work separate from automated engine capacity', () => {
    const value = digitalArithmetic(360, 20, 10, 0.25, 20, 2, 1, 1);
    expect(value.baselineHumanHours).toBe(2);
    expect(value.retainedHumanHours).toBe(0.7);
    expect(value.releasedHumanHours).toBe(1.3);
    expect(value.engineCapacityPerHour).toBe(360);
    expect(value.requiredEngineUnits).toBe(1);
    expect(value.automatedProcessingHours).toBe(1);
  });
  it('does not hide additional human effort behind a zero clamp', () => {
    expect(digitalArithmetic(360, 1, 10, 1, 20, 2, 1, 1).releasedHumanHours).toBe(-2.1);
  });
  it('separates incremental economics and retained costs', () => {
    const value = economicArithmetic(100, 10, 5, 7, 40, 4);
    expect(value.netEffect).toBe(25);
    expect(value.payback).toBe(4);
    expect(value.roi).toBe(0);
    expect(value.tco).toBe(188);
    expect(economicArithmetic(100, 10, 5, 70, 40, 4).netEffect).toBe(value.netEffect);
    expect(economicArithmetic(100, 10, 5, 70, 40, 4).tco).toBeGreaterThan(value.tco);
  });
  it('does not divide ROI by zero or report payback for negative effects', () => {
    expect(economicArithmetic(0, 10, 5, 0, 40, 4).roi).toBeNull();
    expect(economicArithmetic(100, 10, 5, 0, 15, 4).payback).toBeNull();
    expect(economicArithmetic(100, 10, 5, 0, 14, 4).netEffect).toBe(-1);
    expect(economicArithmetic(100, 10, 5, 0, 14, 4).payback).toBeNull();
  });
  it('zero discount preserves cash-flow sums, positive discount lowers future value', () => {
    expect(discountedValue(10, [6, 6], 0)).toBe(2);
    expect(discountedValue(10, [6, 6], 0.1)).toBeLessThan(2);
    expect(discountedValue(10, [11], 0.1)).toBeCloseTo(0);
    expect(discountedValue(10, [-1, -1], 0)).toBe(-12);
  });
  it('FCFS uses stable arrival order and conserves service durations', () => {
    const arrivals = [4, 0, 0, 1];
    const service = [1, 3, 2, 2];
    const value = scheduleFcfs(arrivals, service, 2, 0);
    expect(value.map(item => item.inputIndex)).toEqual([1, 2, 3, 0]);
    expect(value.map(item => item.resourceIndex)).toEqual([0, 1, 1, 0]);
    expect(value.map(item => item.started)).toEqual([0, 0, 2, 4]);
    expect(value.map(item => item.ended)).toEqual([3, 2, 4, 5]);
    for (const item of value) {
      expect(item.started).toBeGreaterThanOrEqual(item.arrived);
      expect(item.ended - item.started).toBe(service[item.inputIndex]);
    }
    expect(scheduleFcfs(arrivals, service, 2, 0)).toEqual(value);
  });
  it('FCFS serializes work at a shared resource and preserves unused resources', () => {
    expect(scheduleFcfs([0, 0, 0], [2, 2, 2], 1, 0).map(item => item.started)).toEqual([0, 2, 4]);
    expect(scheduleFcfs([0, 0, 0], [2, 2, 2], 3, 0).map(item => item.started)).toEqual([0, 0, 0]);
    expect(scheduleFcfs([], [], 3, 0)).toEqual([]);
  });
  it('rejects invalid queue arguments and numerical overflow', () => {
    expect(() => scheduleFcfs([0], [0], 1, 0)).toThrow(RangeError);
    expect(() => scheduleFcfs([0], [1], 0, 0)).toThrow(RangeError);
    expect(() => scheduleFcfs([0], [], 1, 0)).toThrow(RangeError);
    expect(() => scheduleFcfs([0], [1], 1, 1)).toThrow(RangeError);
    expect(() => scheduleFcfs([Number.MAX_VALUE], [Number.MAX_VALUE], 1, 0)).toThrow(RangeError);
  });
});

describe('Fail-closed domain boundaries', () => {
  for (const kind of Object.keys(modelFields) as ModelKind[]) {
    it(`${kind}: lists required measurements without generating a scenario`, () => {
      const result = evaluateModel({ kind, inputs: {} });
      expect(result.status).toBe('incomplete');
      expect(result.missing).toEqual(modelFields[kind].map(definition => `inputs.${definition.key}`));
      expect(result.metrics).toEqual({});
    });
  }
  it('keeps source-backed building area insufficient for effective cleaning capacity', () => {
    // Minimal factual extraction; public vendor case, no copied media or report text.
    // Observed 2026-09-05. The source describes total building area, not cleanable area.
    const buildingArea = {
      value: 13000, unit: 'm2',
      sourceRef: 'https://www.kaercher.com/nz/target-groups-transport-logistics/healthcare-logistics.html#warehouse-area',
    };
    expect(validateMeasurement(buildingArea)).toEqual(buildingArea);
    const result = evaluateModel({ kind: 'coverage', inputs: { buildingArea } });
    expect(result.status).toBe('invalid');
    expect(result.errors.join(' ')).toContain('buildingArea');
    expect(result.metrics).toEqual({});
  });
  it('does not normalize missing or empty values into zero', () => {
    expect(validateMeasurement({ value: '', unit: 'count', sourceRef: 'source' })).toBeUndefined();
    expect(validateMeasurement({ value: null, unit: 'count', sourceRef: 'source' })).toBeUndefined();
    expect(validateMeasurement({ value: 0, unit: 'count', sourceRef: ' ' })).toBeUndefined();
    expect(validateMeasurement({ value: Infinity, unit: 'count', sourceRef: 'source' })).toBeUndefined();
  });
  it('rejects unknown model kinds and inputs without provenance', () => {
    expect(evaluateModel({ kind: 'transport', inputs: {} }).status).toBe('invalid');
    expect(evaluateModel({ kind: 'flow', inputs: { requiredThroughput: { value: -1, unit: 'count', sourceRef: '' } } }).status).toBe('invalid');
    expect(evaluateModel({ kind: 'flow', inputs: {}, seed: 1 }).status).toBe('invalid');
  });
  it('reports missing economics inputs instead of a free solution', () => {
    const result = evaluateEconomics({});
    expect(result.status).toBe('incomplete');
    expect(result.metrics).toEqual({});
    expect(result.missing).toContain('benefitsConfirmed');
    expect(result.missing).toContain('annualAmountsConstant');
    expect(economicFields.map(definition => definition.key)).toEqual(['capex', 'annualOpex', 'annualOtherCosts', 'annualRetainedCosts']);
  });
  it('rejects invalid economics syntax without leaking partial KPIs', () => {
    expect(evaluateEconomics({ currency: 'rub', horizonYears: 0, discountRate: -1 }).status).toBe('invalid');
    expect(evaluateEconomics({ inputs: { capex: { value: 'unknown', unit: 'RUB', sourceRef: '' } } }).metrics).toEqual({});
    expect(evaluateEconomics(null).status).toBe('invalid');
  });
  it('does not generate a replay or simulated arrivals from absent logs', () => {
    const replay = replaySimulation({});
    const simulation = simulateFlow({});
    expect(replay.status).toBe('incomplete');
    expect(simulation.status).toBe('incomplete');
    expect(replay.timeline).toEqual([]);
    expect(simulation.timeline).toEqual([]);
    expect(simulation.missing).toContain('continuousAvailabilityConfirmed');
    expect(snapshotSimulation(simulation, 0).completedOperations).toBeNull();
  });
  it('rejects empty journals and unsupported random-event fields', () => {
    expect(replaySimulation({ resources: [], events: [] }).status).toBe('invalid');
    expect(simulateFlow({ arrivals: [], seed: 1 }).status).toBe('invalid');
  });
});
