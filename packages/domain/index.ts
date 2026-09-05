import { z } from 'zod';
import { discountedValue, economicArithmetic } from './algebra';
import { emptyResult, finalizeResult, measurementSchema, parseResult, validateFields } from './models';
import type { CalculationResult, FieldDefinition, Measurement } from './models';
export * from './models';

export const ECONOMICS_VERSION = 'constant-annual-economics/1.0.0';
export const economicFields: FieldDefinition[] = [
  { key: 'capex', label: 'Первоначальные затраты', unit: 'currency', required: true, min: 0,
    description: 'Оборудование, внедрение, инфраструктура, запуск ПО, обучение и резерв. Ноль требует источника.' },
  { key: 'annualOpex', label: 'Годовой OPEX решения', unit: 'currency/year', required: true, min: 0,
    description: 'Сервис, лицензии, энергия, расходники, поддержка, аренда/подписка. Без сохранённых затрат процесса.' },
  { key: 'annualOtherCosts', label: 'Прочие дополнительные годовые затраты', unit: 'currency/year', required: true, min: 0,
    description: 'Другие затраты, возникающие из-за проекта; не включать повторно в OPEX.' },
  { key: 'annualRetainedCosts', label: 'Сохраняемые годовые затраты процесса', unit: 'currency/year', required: true, min: 0,
    description: 'Оставшийся труд и прочие затраты: включаются в TCO, но не повторно вычитаются из приростного эффекта.' },
];
const benefitSchema = z.object({
  id: z.string().trim().min(1).max(128),
  kind: z.enum(['cash_saving', 'avoided_hire', 'margin', 'loss_reduction', 'time_released', 'nonfinancial']),
  value: z.number().finite().nonnegative(),
  unit: z.string().trim().min(1).max(80),
  sourceRef: z.string().trim().min(1).max(2048),
  overlapKey: z.string().trim().min(1).max(128),
}).strict();
export const economicsSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/, 'Ожидается трёхбуквенный код валюты'),
  vat: z.enum(['included', 'excluded']),
  mode: z.enum(['purchase', 'lease', 'subscription']),
  horizonYears: z.number().int().min(1).max(100),
  discountRate: z.number().finite().gt(-1).optional(),
  inputs: z.record(z.string(), measurementSchema),
  benefits: z.array(benefitSchema).max(1000),
  benefitsConfirmed: z.boolean(),
  annualAmountsConstant: z.boolean(),
  cashFlows: z.array(z.object({
    year: z.number().int().min(1).max(100), inflow: measurementSchema, outflow: measurementSchema,
  }).strict()).max(100).optional(),
}).strict();
export type EconomicsInput = z.infer<typeof economicsSchema>;
export type Benefit = z.infer<typeof benefitSchema>;

/** Units and VAT basis must already have been normalised at the import boundary. */
export function evaluateEconomics(raw: unknown): CalculationResult {
  const result = emptyResult(ECONOMICS_VERSION);
  const parsed = parseResult(economicsSchema, raw, result);
  if (!parsed) return result;
  const fields = economicFields.map(definition => ({ ...definition, unit: definition.unit.replace('currency', parsed.currency) }));
  validateFields(fields, parsed.inputs, result);
  if (!parsed.benefitsConfirmed) result.missing.push('benefitsConfirmed');
  if (!parsed.annualAmountsConstant) result.missing.push('annualAmountsConstant: модель требует подтверждения постоянных годовых сумм');
  const ids = new Set<string>();
  const monetaryKeys = new Set<string>();
  let grossBenefit = 0;
  let releasedHours = 0;
  const cashBenefitInputs: string[] = [];
  const timeBenefitInputs: string[] = [];
  for (const benefit of parsed.benefits) {
    if (ids.has(benefit.id)) result.errors.push(`benefits.${benefit.id}: повтор id`);
    ids.add(benefit.id);
    if (benefit.kind === 'nonfinancial') continue;
    if (benefit.kind === 'time_released') {
      if (benefit.unit !== 'h/year') result.errors.push(`benefits.${benefit.id}.unit: ожидается h/year`);
      releasedHours += benefit.value;
      timeBenefitInputs.push(`benefits.${benefit.id} [${benefit.sourceRef}]`);
      continue;
    }
    if (benefit.unit !== `${parsed.currency}/year`) result.errors.push(`benefits.${benefit.id}.unit: ожидается ${parsed.currency}/year`);
    if (monetaryKeys.has(benefit.overlapKey)) result.errors.push(`benefits.${benefit.id}: пересечение денежной выгоды ${benefit.overlapKey}`);
    monetaryKeys.add(benefit.overlapKey);
    grossBenefit += benefit.value;
    cashBenefitInputs.push(`benefits.${benefit.id} [${benefit.sourceRef}]`);
  }
  if (result.errors.length || result.missing.length) return finalizeResult(result);
  const v = (key: string) => parsed.inputs[key]!.value;
  const annualOutflow = v('annualOpex') + v('annualOtherCosts');
  result.metrics = { ...economicArithmetic(v('capex'), v('annualOpex'), v('annualOtherCosts'), v('annualRetainedCosts'), grossBenefit, parsed.horizonYears),
    releasedHours, npv: null };
  const source = (key: string) => `inputs.${key} [${parsed.inputs[key]!.sourceRef}]`;
  result.trace = [
    { key: 'CAPEX', formula: 'capex; all initial project costs, same VAT basis', inputs: [source('capex'), 'currency', 'vat', 'mode'] },
    { key: 'annualOPEX', formula: 'annualOpex; includes recurring lease/subscription when applicable', inputs: [source('annualOpex'), 'currency', 'vat', 'mode'] },
    { key: 'grossBenefit', formula: 'sum(non-overlapping monetized annual benefits); time_released and nonfinancial excluded', inputs: [...cashBenefitInputs, 'benefitsConfirmed'] },
    { key: 'releasedHours', formula: 'sum(time_released); never counted as cash saving automatically', inputs: [...timeBenefitInputs, 'benefitsConfirmed'] },
    { key: 'netEffect', formula: 'grossBenefit - annualOpex - annualOtherCosts', inputs: [...cashBenefitInputs, source('annualOpex'), source('annualOtherCosts')] },
    { key: 'payback', formula: 'netEffect > 0 ? capex / netEffect : null; years, undiscounted', inputs: [source('capex'), ...cashBenefitInputs, source('annualOpex'), source('annualOtherCosts'), 'annualAmountsConstant'] },
    { key: 'roi', formula: 'capex > 0 ? (netEffect * horizonYears - capex) / capex * 100 : null', inputs: [source('capex'), ...cashBenefitInputs, source('annualOpex'), source('annualOtherCosts'), 'horizonYears', 'annualAmountsConstant'] },
    { key: 'tco', formula: 'capex + horizonYears * (annualOpex + annualOtherCosts + annualRetainedCosts)', inputs: [source('capex'), source('annualOpex'), source('annualOtherCosts'), source('annualRetainedCosts'), 'horizonYears', 'annualAmountsConstant'] },
  ];
  if (parsed.cashFlows) {
    const years = new Set<number>();
    for (const flow of parsed.cashFlows) {
      if (years.has(flow.year)) result.errors.push(`cashFlows: повтор года ${flow.year}`);
      years.add(flow.year);
      if (flow.year > parsed.horizonYears) result.errors.push(`cashFlows.${flow.year}: вне горизонта`);
      for (const [name, measurement] of [['inflow', flow.inflow], ['outflow', flow.outflow]] as const) {
        if (measurement.unit !== parsed.currency) result.errors.push(`cashFlows.${flow.year}.${name}.unit: ожидается ${parsed.currency}`);
        if (measurement.value < 0) result.errors.push(`cashFlows.${flow.year}.${name}.value: отрицательное значение`);
      }
      // This version represents a constant annual case. Variable-year cash flows need another model version.
      if (!nearlyEqual(flow.inflow.value, grossBenefit) || !nearlyEqual(flow.outflow.value, annualOutflow)) {
        result.errors.push(`cashFlows.${flow.year}: поток не согласован с подтверждёнными постоянными годовыми суммами`);
      }
    }
    for (let year = 1; year <= parsed.horizonYears; year += 1) {
      if (!years.has(year)) result.missing.push(`cashFlows.year.${year}`);
    }
  }
  if (parsed.discountRate !== undefined) {
    if (!parsed.cashFlows) result.missing.push('cashFlows');
    if (!result.errors.length && !result.missing.length) {
      const flows = [...parsed.cashFlows!].sort((a, b) => a.year - b.year);
      result.metrics.npv = discountedValue(v('capex'), flows.map(flow => flow.inflow.value - flow.outflow.value), parsed.discountRate);
      result.trace.push({ key: 'npv', formula: '-capex + sum((inflow[year] - outflow[year]) / (1 + discountRate)^year); year-end cash flows',
        inputs: [source('capex'), 'discountRate', ...flows.flatMap(flow => [`cashFlows.${flow.year}.inflow [${flow.inflow.sourceRef}]`, `cashFlows.${flow.year}.outflow [${flow.outflow.sourceRef}]`])] });
    }
  } else result.trace.push({ key: 'npv', formula: 'null: discountRate not specified', inputs: [] });
  return finalizeResult(result);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 16;
}

/** Boundary helper, with no unit conversion or source inference. */
export function validateMeasurement(raw: unknown): Measurement | undefined {
  const result = measurementSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}
