/** Mathematical primitives; no object, product or company data lives here. */
export function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function capacityArithmetic(demand: number, rate: number, hours: number, units: number) {
  const capacityPerHour = rate * units;
  return {
    requiredUnits: rate > 0 ? Math.ceil(demand / rate) : null,
    capacityPerHour,
    capacityOverWindow: capacityPerHour * hours,
    utilizationRequired: safeRatio(demand, capacityPerHour),
    shortfallPerHour: Math.max(0, demand - capacityPerHour),
  };
}

export function confusionArithmetic(tp: number, tn: number, fp: number, fn: number) {
  const total = tp + tn + fp + fn;
  return {
    inspectedCount: total,
    precision: safeRatio(tp, tp + fp),
    recall: safeRatio(tp, tp + fn),
    specificity: safeRatio(tn, tn + fp),
    accuracy: safeRatio(tp + tn, total),
    falsePositiveRate: safeRatio(fp, fp + tn),
    falseNegativeRate: safeRatio(fn, fn + tp),
  };
}

export function coverageArithmetic(area: number, rate: number, hours: number, units: number) {
  const capacityArea = rate * hours * units;
  return {
    requiredUnits: Math.ceil(area / (rate * hours)), capacityArea,
    requiredHours: area / (rate * units),
    utilizationRequired: area / capacityArea,
    shortfallArea: Math.max(0, area - capacityArea),
  };
}

export function workcellArithmetic(demand: number, cycle: number, availability: number, yieldRatio: number, hours: number, units: number) {
  const effectiveUnitThroughput = 3600 / cycle * availability * yieldRatio;
  return { effectiveUnitThroughput, ...capacityArithmetic(demand, effectiveUnitThroughput, hours, units) };
}

export function inventoryArithmetic(observed: number, expected: number, detected: number, resolved: number, hours: number) {
  return {
    coverage: safeRatio(observed, expected), discrepancyRate: safeRatio(detected, observed),
    resolutionRate: safeRatio(resolved, detected), unresolvedCount: detected - resolved,
    locationsPerHour: observed / hours,
  };
}

export function digitalArithmetic(documents: number, manual: number, automated: number, exceptionRatio: number,
  exceptionTime: number, monitoring: number, hours: number, units: number) {
  const retained = monitoring + exceptionRatio * exceptionTime;
  const engineCapacityPerHour = 3600 / automated * units;
  return {
    baselineHumanHours: documents * manual / 3600,
    retainedHumanHours: documents * retained / 3600,
    releasedHumanHours: documents * (manual - retained) / 3600,
    automatedProcessingHours: documents * automated / (3600 * units),
    engineCapacityPerHour, engineCapacityOverWindow: engineCapacityPerHour * hours,
    requiredEngineUnits: Math.ceil(documents * automated / (3600 * hours)),
    engineShortfallDocuments: Math.max(0, documents - engineCapacityPerHour * hours),
  };
}

export function economicArithmetic(
  capex: number, annualOpex: number, annualOtherCosts: number,
  annualRetainedCosts: number, annualGrossBenefit: number, horizonYears: number,
) {
  const netEffect = annualGrossBenefit - annualOpex - annualOtherCosts;
  return {
    CAPEX: capex,
    annualOPEX: annualOpex,
    grossBenefit: annualGrossBenefit,
    netEffect,
    payback: netEffect > 0 ? capex / netEffect : null,
    roi: capex > 0 ? ((netEffect * horizonYears - capex) / capex) * 100 : null,
    tco: capex + horizonYears * (annualOpex + annualOtherCosts + annualRetainedCosts),
  };
}

export function discountedValue(initialCost: number, netFlows: number[], rate: number): number {
  return netFlows.reduce((value, flow, index) => value + flow / (1 + rate) ** (index + 1), -initialCost);
}

export interface QueueAssignment {
  inputIndex: number;
  resourceIndex: number;
  arrived: number;
  started: number;
  ended: number;
}

/** Stable FCFS scheduling on parallel, continuously available identical servers. */
export function scheduleFcfs(
  arrivals: readonly number[], durations: readonly number[], resources: number, start: number,
): QueueAssignment[] {
  if (!Number.isSafeInteger(resources) || resources < 1 || resources > 1000
      || arrivals.length !== durations.length || !Number.isFinite(start)
      || arrivals.some(value => !Number.isFinite(value) || value < start)
      || durations.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Invalid mathematical queue arguments');
  }
  const available = Array<number>(resources).fill(start);
  const order = arrivals.map((value, inputIndex) => ({ value, inputIndex }))
    .sort((a, b) => a.value - b.value || a.inputIndex - b.inputIndex);
  return order.map(({ value, inputIndex }) => {
    let resourceIndex = 0;
    for (let i = 1; i < available.length; i += 1) {
      if (available[i]! < available[resourceIndex]!) resourceIndex = i;
    }
    const started = Math.max(value, available[resourceIndex]!);
    const ended = started + durations[inputIndex]!;
    if (!Number.isFinite(ended)) throw new RangeError('Queue arithmetic overflow');
    available[resourceIndex] = ended;
    return { inputIndex, resourceIndex, arrived: value, started, ended };
  });
}
