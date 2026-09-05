import { z } from 'zod';
import { capacityArithmetic, confusionArithmetic, coverageArithmetic, digitalArithmetic, inventoryArithmetic, workcellArithmetic, scheduleFcfs } from './algebra';

export type ModelKind = 'flow' | 'coverage' | 'workcell' | 'inspection' | 'inventory' | 'digital';
export interface FieldDefinition {
  key: string;
  label: string;
  unit: string;
  required: boolean;
  description: string;
  min?: number;
  max?: number;
  integer?: boolean;
  exclusiveMin?: boolean;
}
export interface CalculationResult {
  status: 'complete' | 'incomplete' | 'invalid';
  missing: string[];
  errors: string[];
  metrics: Record<string, number | null>;
  trace: Array<{ key: string; formula: string; inputs: string[] }>;
  version: string;
}
export const measurementSchema = z.object({
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(80),
  sourceRef: z.string().trim().min(1).max(2048),
}).strict();
export type Measurement = z.infer<typeof measurementSchema>;
export const MODEL_VERSION = 'process-models/1.0.0';

function field(key: string, label: string, unit: string, description: string,
  options: Partial<FieldDefinition> = {}): FieldDefinition {
  return { key, label, unit, description, required: true, min: 0, ...options };
}
const availableHours = field('availableHours', 'Доступное время', 'h',
  'Реальное окно работы, без включённых в другие коэффициенты перерывов.', { exclusiveMin: true });
const availableUnits = field('availableUnits', 'Доступные единицы', 'count',
  'Подтверждённое число одновременно доступных одинаковых единиц.', { integer: true, exclusiveMin: true });
const observationHours = field('observationHours', 'Период наблюдения', 'h',
  'Продолжительность периода, за который собраны все счётчики.', { exclusiveMin: true });
const demand = field('requiredThroughput', 'Требуемый поток', 'operations/h',
  'Требуемый поток годных операций в час по данным объекта.');

export const modelFields: Record<ModelKind, FieldDefinition[]> = {
  flow: [demand,
    field('effectiveUnitThroughput', 'Измеренная производительность единицы', 'operations/h',
      'Производительность в сопоставимых условиях, включая реальные задержки; не паспортная скорость.', { exclusiveMin: true }),
    availableHours, availableUnits],
  coverage: [
    field('cleanableArea', 'Обрабатываемая площадь', 'm2', 'Площадь принятого задания, а не всего здания.'),
    field('effectiveAreaRate', 'Измеренная производительность по площади', 'm2/h',
      'Площадь качественно выполненной работы за час в условиях объекта.', { exclusiveMin: true }),
    availableHours, availableUnits],
  workcell: [demand,
    field('cycleSeconds', 'Время цикла', 's/operation', 'Измеренный цикл одной операции.', { exclusiveMin: true }),
    field('availability', 'Доступность', 'ratio', 'Доля рабочего окна без простоев, от 0 до 1.', { max: 1 }),
    field('goodYield', 'Выход годных', 'ratio', 'Доля годных операций, от 0 до 1; не учитывать повторно в цикле.', { max: 1 }),
    availableHours, availableUnits],
  inspection: [
    field('truePositive', 'Верно обнаруженные дефекты', 'count', 'Число результатов с независимой проверкой истинности.', { integer: true }),
    field('trueNegative', 'Верно принятые изделия', 'count', 'Число результатов с независимой проверкой истинности.', { integer: true }),
    field('falsePositive', 'Ложные отбраковки', 'count', 'Годные изделия, ошибочно признанные дефектными.', { integer: true }),
    field('falseNegative', 'Пропущенные дефекты', 'count', 'Дефектные изделия, ошибочно принятые.', { integer: true }),
    observationHours],
  inventory: [
    field('observedLocations', 'Проверенные уникальные места', 'count', 'Без повторного счёта одного места.', { integer: true }),
    field('expectedLocations', 'Места в области проверки', 'count', 'Согласованный реестр мест на момент проверки.', { integer: true }),
    field('discrepanciesDetected', 'Места с расхождениями', 'count', 'Уникальные проверенные места с подтверждёнными расхождениями.', { integer: true }),
    field('discrepanciesResolved', 'Исправленные расхождения', 'count', 'Исправленные места из обнаруженных в том же периоде.', { integer: true }),
    observationHours],
  digital: [
    field('documentCount', 'Число документов', 'count', 'Реальный объём документов за выбранное окно.', { integer: true }),
    field('manualSecondsPerDocument', 'Ручная обработка до автоматизации', 's/document', 'Хронометраж активной работы человека на документ.'),
    field('automatedSecondsPerDocument', 'Автоматическая обработка', 's/document', 'Измеренное время на документ в одном вычислительном потоке.', { exclusiveMin: true }),
    field('exceptionRate', 'Доля исключений', 'ratio', 'Измеренная доля документов с ручным разбором.', { max: 1 }),
    field('exceptionSecondsPerDocument', 'Ручной разбор исключения', 's/document', 'Дополнительное ручное время на документ-исключение.'),
    field('monitoringSecondsPerDocument', 'Ручной контроль каждого документа', 's/document', 'Оставшаяся работа человека, не включённая в разбор исключений.'),
    availableHours, availableUnits],
};

export function emptyResult(version = MODEL_VERSION): CalculationResult {
  return { status: 'incomplete', missing: [], errors: [], metrics: {}, trace: [], version };
}

function valueAt(raw: unknown, path: PropertyKey[]): unknown {
  let value = raw;
  for (const part of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = Reflect.get(value, part);
  }
  return value;
}

export function parseResult<T>(schema: z.ZodType<T>, raw: unknown, result: CalculationResult): T | undefined {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join('.') || 'payload';
    if (valueAt(raw, issue.path) === undefined && issue.code !== 'unrecognized_keys') result.missing.push(path);
    else result.errors.push(`${path}: ${issue.message}`);
  }
  result.missing = [...new Set(result.missing)];
  result.status = result.errors.length ? 'invalid' : 'incomplete';
  return undefined;
}

export function validateFields(
  fields: FieldDefinition[], inputs: Record<string, Measurement>, result: CalculationResult,
): boolean {
  const allowed = new Set(fields.map(definition => definition.key));
  for (const key of Object.keys(inputs)) {
    if (!allowed.has(key)) result.errors.push(`inputs.${key}: неизвестное поле; проверьте модель или версию mapping`);
  }
  for (const definition of fields) {
    const measurement = inputs[definition.key];
    if (!measurement) {
      if (definition.required) result.missing.push(`inputs.${definition.key}`);
      continue;
    }
    if (measurement.unit !== definition.unit) {
      result.errors.push(`inputs.${definition.key}.unit: ожидается ${definition.unit}; получено ${measurement.unit}`);
    }
    if (definition.min !== undefined && (definition.exclusiveMin
      ? measurement.value <= definition.min : measurement.value < definition.min)) {
      result.errors.push(`inputs.${definition.key}.value: должно быть ${definition.exclusiveMin ? '>' : '>='} ${definition.min}`);
    }
    if (definition.max !== undefined && measurement.value > definition.max) {
      result.errors.push(`inputs.${definition.key}.value: должно быть <= ${definition.max}`);
    }
    if (definition.integer && !Number.isSafeInteger(measurement.value)) {
      result.errors.push(`inputs.${definition.key}.value: ожидается безопасное целое число`);
    }
  }
  result.status = result.errors.length ? 'invalid' : result.missing.length ? 'incomplete' : 'complete';
  return result.status === 'complete';
}

export function finalizeResult(result: CalculationResult): CalculationResult {
  for (const [key, value] of Object.entries(result.metrics)) {
    if (value !== null && !Number.isFinite(value)) {
      result.errors.push(`${key}: результат выходит за допустимый числовой диапазон`);
      result.metrics[key] = null;
    }
  }
  result.status = result.errors.length ? 'invalid' : result.missing.length ? 'incomplete' : 'complete';
  return result;
}

const modelSchema = z.object({
  kind: z.enum(['flow', 'coverage', 'workcell', 'inspection', 'inventory', 'digital']),
  inputs: z.record(z.string(), measurementSchema),
}).strict();

export function evaluateModel(raw: unknown): CalculationResult {
  const result = emptyResult();
  const parsed = parseResult(modelSchema, raw, result);
  if (!parsed || !validateFields(modelFields[parsed.kind], parsed.inputs, result)) return result;
  const v = (key: string) => parsed.inputs[key]!.value;
  const trace = (key: string, formula: string, keys: string[]) => {
    result.trace.push({ key, formula, inputs: keys.map(name => `inputs.${name} [${parsed.inputs[name]!.sourceRef}]`) });
  };
  switch (parsed.kind) {
    case 'flow': {
      result.metrics = capacityArithmetic(v('requiredThroughput'), v('effectiveUnitThroughput'), v('availableHours'), v('availableUnits'));
      trace('requiredUnits', 'ceil(requiredThroughput / effectiveUnitThroughput)', ['requiredThroughput', 'effectiveUnitThroughput']);
      trace('capacityPerHour', 'effectiveUnitThroughput * availableUnits', ['effectiveUnitThroughput', 'availableUnits']);
      trace('capacityOverWindow', 'capacityPerHour * availableHours', ['effectiveUnitThroughput', 'availableUnits', 'availableHours']);
      trace('utilizationRequired', 'requiredThroughput / capacityPerHour', ['requiredThroughput', 'effectiveUnitThroughput', 'availableUnits']);
      trace('shortfallPerHour', 'max(0, requiredThroughput - capacityPerHour)', ['requiredThroughput', 'effectiveUnitThroughput', 'availableUnits']);
      break;
    }
    case 'coverage': {
      result.metrics = coverageArithmetic(v('cleanableArea'), v('effectiveAreaRate'), v('availableHours'), v('availableUnits'));
      trace('requiredUnits', 'ceil(cleanableArea / (effectiveAreaRate * availableHours))', ['cleanableArea', 'effectiveAreaRate', 'availableHours']);
      trace('capacityArea', 'effectiveAreaRate * availableHours * availableUnits', ['effectiveAreaRate', 'availableHours', 'availableUnits']);
      trace('requiredHours', 'cleanableArea / (effectiveAreaRate * availableUnits)', ['cleanableArea', 'effectiveAreaRate', 'availableUnits']);
      trace('utilizationRequired', 'cleanableArea / capacityArea', ['cleanableArea', 'effectiveAreaRate', 'availableHours', 'availableUnits']);
      trace('shortfallArea', 'max(0, cleanableArea - capacityArea)', ['cleanableArea', 'effectiveAreaRate', 'availableHours', 'availableUnits']);
      break;
    }
    case 'workcell': {
      result.metrics = workcellArithmetic(v('requiredThroughput'), v('cycleSeconds'), v('availability'), v('goodYield'), v('availableHours'), v('availableUnits'));
      const rateKeys = ['cycleSeconds', 'availability', 'goodYield'];
      trace('effectiveUnitThroughput', '3600 / cycleSeconds * availability * goodYield', rateKeys);
      trace('requiredUnits', 'rate > 0 ? ceil(requiredThroughput / rate) : null', ['requiredThroughput', ...rateKeys]);
      trace('capacityPerHour', 'rate * availableUnits', [...rateKeys, 'availableUnits']);
      trace('capacityOverWindow', 'rate * availableUnits * availableHours', [...rateKeys, 'availableUnits', 'availableHours']);
      trace('utilizationRequired', 'capacityPerHour > 0 ? requiredThroughput / capacityPerHour : null', ['requiredThroughput', ...rateKeys, 'availableUnits']);
      trace('shortfallPerHour', 'max(0, requiredThroughput - capacityPerHour)', ['requiredThroughput', ...rateKeys, 'availableUnits']);
      break;
    }
    case 'inspection': {
      result.metrics = { ...confusionArithmetic(v('truePositive'), v('trueNegative'), v('falsePositive'), v('falseNegative')) };
      result.metrics.inspectedPerHour = result.metrics.inspectedCount! / v('observationHours');
      const keys = ['truePositive', 'trueNegative', 'falsePositive', 'falseNegative'];
      const formulas: Record<string, string> = {
        inspectedCount: 'TP + TN + FP + FN', precision: 'TP / (TP + FP)', recall: 'TP / (TP + FN)',
        specificity: 'TN / (TN + FP)', accuracy: '(TP + TN) / (TP + TN + FP + FN)',
        falsePositiveRate: 'FP / (FP + TN)', falseNegativeRate: 'FN / (FN + TP)',
        inspectedPerHour: '(TP + TN + FP + FN) / observationHours',
      };
      for (const [key, formula] of Object.entries(formulas)) trace(key, `${formula}; zero denominator => null`, key === 'inspectedPerHour' ? [...keys, 'observationHours'] : keys);
      break;
    }
    case 'inventory': {
      if (v('observedLocations') > v('expectedLocations')) result.errors.push('observedLocations не может превышать expectedLocations');
      if (v('discrepanciesDetected') > v('observedLocations')) result.errors.push('discrepanciesDetected не может превышать observedLocations');
      if (v('discrepanciesResolved') > v('discrepanciesDetected')) result.errors.push('discrepanciesResolved не может превышать discrepanciesDetected');
      if (result.errors.length) return finalizeResult(result);
      result.metrics = inventoryArithmetic(v('observedLocations'), v('expectedLocations'), v('discrepanciesDetected'), v('discrepanciesResolved'), v('observationHours'));
      trace('coverage', 'observedLocations / expectedLocations; zero denominator => null', ['observedLocations', 'expectedLocations']);
      trace('discrepancyRate', 'discrepanciesDetected / observedLocations; zero denominator => null', ['discrepanciesDetected', 'observedLocations']);
      trace('resolutionRate', 'discrepanciesResolved / discrepanciesDetected; zero denominator => null', ['discrepanciesResolved', 'discrepanciesDetected']);
      trace('unresolvedCount', 'discrepanciesDetected - discrepanciesResolved', ['discrepanciesDetected', 'discrepanciesResolved']);
      trace('locationsPerHour', 'observedLocations / observationHours', ['observedLocations', 'observationHours']);
      break;
    }
    case 'digital': {
      result.metrics = digitalArithmetic(v('documentCount'), v('manualSecondsPerDocument'), v('automatedSecondsPerDocument'),
        v('exceptionRate'), v('exceptionSecondsPerDocument'), v('monitoringSecondsPerDocument'), v('availableHours'), v('availableUnits'));
      trace('baselineHumanHours', 'documentCount * manualSecondsPerDocument / 3600', ['documentCount', 'manualSecondsPerDocument']);
      trace('retainedHumanHours', 'documentCount * (monitoringSecondsPerDocument + exceptionRate * exceptionSecondsPerDocument) / 3600', ['documentCount', 'monitoringSecondsPerDocument', 'exceptionRate', 'exceptionSecondsPerDocument']);
      trace('releasedHumanHours', 'baselineHumanHours - retainedHumanHours; not cash saving', ['documentCount', 'manualSecondsPerDocument', 'monitoringSecondsPerDocument', 'exceptionRate', 'exceptionSecondsPerDocument']);
      trace('automatedProcessingHours', 'documentCount * automatedSecondsPerDocument / (3600 * availableUnits)', ['documentCount', 'automatedSecondsPerDocument', 'availableUnits']);
      trace('engineCapacityPerHour', '3600 / automatedSecondsPerDocument * availableUnits; excludes human bottleneck', ['automatedSecondsPerDocument', 'availableUnits']);
      trace('engineCapacityOverWindow', 'engineCapacityPerHour * availableHours', ['automatedSecondsPerDocument', 'availableUnits', 'availableHours']);
      trace('requiredEngineUnits', 'ceil(documentCount * automatedSecondsPerDocument / (3600 * availableHours))', ['documentCount', 'automatedSecondsPerDocument', 'availableHours']);
      trace('engineShortfallDocuments', 'max(0, documentCount - engineCapacityOverWindow)', ['documentCount', 'automatedSecondsPerDocument', 'availableUnits', 'availableHours']);
      break;
    }
  }
  return finalizeResult(result);
}

export type ResourceState = 'idle' | 'moving' | 'working' | 'charging' | 'maintenance' | 'error';
export interface TimelineEvent {
  id: string;
  resourceId: string;
  state: ResourceState;
  startedAtSeconds: number;
  endedAtSeconds: number;
  completedOperations: number | null;
  sourceRefs: string[];
  basis: 'observed' | 'computed';
}
export interface SimulationResult extends CalculationResult {
  timeline: TimelineEvent[];
  durationSeconds: number | null;
  resources: string[];
  observationStartSeconds: number | null;
  jobs?: Array<{ id: string; resourceId: string; arrivedAtSeconds: number; startedAtSeconds: number; endedAtSeconds: number }>;
}
const identifier = z.string().trim().min(1).max(128);
const resourceSchema = z.object({ id: identifier, sourceRef: z.string().trim().min(1).max(2048) }).strict();
const replaySchema = z.object({
  resources: z.array(resourceSchema).min(1).max(1000),
  events: z.array(z.object({
    id: identifier, resourceId: identifier,
    state: z.enum(['idle', 'moving', 'working', 'charging', 'maintenance', 'error']),
    startedAtSeconds: measurementSchema, endedAtSeconds: measurementSchema,
    completedOperations: measurementSchema.optional(),
  }).strict()).min(1).max(10000),
  observationStartSeconds: measurementSchema,
  observationEndSeconds: measurementSchema,
}).strict();

function simulationResult(version: string): SimulationResult {
  return { ...emptyResult(version), timeline: [], durationSeconds: null, resources: [], observationStartSeconds: null };
}
function validateMeasure(measurement: Measurement, unit: string, path: string, result: CalculationResult, positive = false): void {
  if (measurement.unit !== unit) result.errors.push(`${path}.unit: ожидается ${unit}`);
  if (positive ? measurement.value <= 0 : measurement.value < 0) result.errors.push(`${path}.value: недопустимый знак`);
}
function validateWindow(start: Measurement, end: Measurement, result: CalculationResult): void {
  validateMeasure(start, 's', 'observationStartSeconds', result);
  validateMeasure(end, 's', 'observationEndSeconds', result, true);
  if (end.value <= start.value) result.errors.push('observationEndSeconds должно быть больше observationStartSeconds');
}
function uniqueIds(values: Array<{ id: string }>, path: string, result: CalculationResult): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) result.errors.push(`${path}: повтор id ${value.id}`);
    seen.add(value.id);
  }
}

export function replaySimulation(raw: unknown): SimulationResult {
  const result = simulationResult('observed-replay/1.0.0');
  const parsed = parseResult(replaySchema, raw, result);
  if (!parsed) return result;
  validateWindow(parsed.observationStartSeconds, parsed.observationEndSeconds, result);
  uniqueIds(parsed.resources, 'resources', result);
  uniqueIds(parsed.events, 'events', result);
  const resources = new Map(parsed.resources.map(resource => [resource.id, resource]));
  for (const event of parsed.events) {
    if (!resources.has(event.resourceId)) result.errors.push(`events.${event.id}.resourceId: неизвестный ресурс`);
    validateMeasure(event.startedAtSeconds, 's', `events.${event.id}.startedAtSeconds`, result);
    validateMeasure(event.endedAtSeconds, 's', `events.${event.id}.endedAtSeconds`, result);
    if (event.endedAtSeconds.value <= event.startedAtSeconds.value) result.errors.push(`events.${event.id}: окончание должно быть позже начала`);
    if (event.startedAtSeconds.value < parsed.observationStartSeconds.value || event.endedAtSeconds.value > parsed.observationEndSeconds.value) {
      result.errors.push(`events.${event.id}: событие вне окна наблюдения`);
    }
    if (event.completedOperations) {
      validateMeasure(event.completedOperations, 'count', `events.${event.id}.completedOperations`, result);
      if (!Number.isSafeInteger(event.completedOperations.value)) result.errors.push(`events.${event.id}.completedOperations: ожидается целое число`);
      if (event.state !== 'working') result.errors.push(`events.${event.id}: completedOperations допустимо только для working`);
    }
  }
  const sorted = parsed.events.map((event, index) => ({ event, index })).sort((a, b) =>
    a.event.startedAtSeconds.value - b.event.startedAtSeconds.value || a.index - b.index);
  const endByResource = new Map<string, number>();
  for (const { event } of sorted) {
    const previous = endByResource.get(event.resourceId);
    if (previous !== undefined && event.startedAtSeconds.value < previous) result.errors.push(`events.${event.id}: перекрытие интервалов ресурса`);
    endByResource.set(event.resourceId, Math.max(previous ?? event.endedAtSeconds.value, event.endedAtSeconds.value));
  }
  if (result.errors.length) { finalizeResult(result); return result; }
  result.resources = parsed.resources.map(resource => resource.id);
  result.observationStartSeconds = parsed.observationStartSeconds.value;
  result.durationSeconds = parsed.observationEndSeconds.value - parsed.observationStartSeconds.value;
  result.timeline = sorted.map(({ event }) => ({
    id: event.id, resourceId: event.resourceId, state: event.state,
    startedAtSeconds: event.startedAtSeconds.value, endedAtSeconds: event.endedAtSeconds.value,
    completedOperations: event.state === 'working' ? event.completedOperations?.value ?? null : 0,
    sourceRefs: [...new Set([resources.get(event.resourceId)!.sourceRef, event.startedAtSeconds.sourceRef,
      event.endedAtSeconds.sourceRef, ...(event.completedOperations ? [event.completedOperations.sourceRef] : [])])],
    basis: 'observed',
  }));
  const observed = result.timeline.reduce((sum, event) => sum + event.endedAtSeconds - event.startedAtSeconds, 0);
  const busy = result.timeline.filter(event => event.state === 'working' || event.state === 'moving')
    .reduce((sum, event) => sum + event.endedAtSeconds - event.startedAtSeconds, 0);
  const wholeWindow = result.durationSeconds * result.resources.length;
  const completeCoverage = Math.abs(observed - wholeWindow) <= Number.EPSILON * Math.max(1, wholeWindow) * 16;
  const operations = result.timeline.some(event => event.completedOperations === null)
    ? null : result.timeline.reduce((sum, event) => sum + event.completedOperations!, 0);
  result.metrics = {
    recordedCompletedOperations: operations,
    completedOperations: completeCoverage ? operations : null,
    observedResourceSeconds: observed,
    observationCoverage: observed / wholeWindow,
    busyResourceSeconds: busy,
    utilization: completeCoverage ? busy / wholeWindow : null,
    throughputPerHour: completeCoverage && operations !== null ? operations * 3600 / result.durationSeconds : null,
    meanWaitingSeconds: null,
    queueLength: null,
  };
  for (const [key, formula] of Object.entries({
    recordedCompletedOperations: 'sum(recorded completedOperations); missing work count => null',
    completedOperations: 'recordedCompletedOperations only when all resource-time is observed',
    observedResourceSeconds: 'sum(event end - event start)',
    observationCoverage: 'observedResourceSeconds / (windowSeconds * resourceCount)',
    busyResourceSeconds: 'sum(duration of working and moving intervals)',
    utilization: 'busyResourceSeconds / (windowSeconds * resourceCount); gaps => null',
    throughputPerHour: 'completedOperations * 3600 / windowSeconds; gaps => null',
    meanWaitingSeconds: 'null: arrivals not provided', queueLength: 'null: queue observations not provided',
  })) result.trace.push({ key, formula, inputs: ['resources', 'events', 'observationStartSeconds', 'observationEndSeconds'] });
  finalizeResult(result);
  return result;
}

const flowSimulationSchema = z.object({
  resources: z.array(resourceSchema).min(1).max(1000),
  arrivals: z.array(z.object({ id: identifier, arrivedAtSeconds: measurementSchema, serviceSeconds: measurementSchema }).strict()).min(1).max(10000),
  observationStartSeconds: measurementSchema,
  observationEndSeconds: measurementSchema,
  continuousAvailabilityConfirmed: z.literal(true),
}).strict();

/** Modelled FCFS outcomes from observed arrivals and measured service times. */
export function simulateFlow(raw: unknown): SimulationResult {
  const result = simulationResult('fcfs-flow/1.0.0');
  const parsed = parseResult(flowSimulationSchema, raw, result);
  if (!parsed) return result;
  validateWindow(parsed.observationStartSeconds, parsed.observationEndSeconds, result);
  uniqueIds(parsed.resources, 'resources', result);
  uniqueIds(parsed.arrivals, 'arrivals', result);
  for (const arrival of parsed.arrivals) {
    validateMeasure(arrival.arrivedAtSeconds, 's', `arrivals.${arrival.id}.arrivedAtSeconds`, result);
    validateMeasure(arrival.serviceSeconds, 's', `arrivals.${arrival.id}.serviceSeconds`, result, true);
    if (arrival.arrivedAtSeconds.value < parsed.observationStartSeconds.value || arrival.arrivedAtSeconds.value >= parsed.observationEndSeconds.value) {
      result.errors.push(`arrivals.${arrival.id}: поступление вне окна наблюдения [start, end)`);
    }
  }
  if (result.errors.length) { finalizeResult(result); return result; }
  let assignments;
  try {
    assignments = scheduleFcfs(parsed.arrivals.map(arrival => arrival.arrivedAtSeconds.value),
      parsed.arrivals.map(arrival => arrival.serviceSeconds.value), parsed.resources.length, parsed.observationStartSeconds.value);
  } catch {
    result.errors.push('Переполнение при расчёте расписания');
    finalizeResult(result);
    return result;
  }
  result.resources = parsed.resources.map(resource => resource.id);
  result.observationStartSeconds = parsed.observationStartSeconds.value;
  result.durationSeconds = parsed.observationEndSeconds.value - parsed.observationStartSeconds.value;
  result.jobs = assignments.map(assignment => ({
    id: parsed.arrivals[assignment.inputIndex]!.id,
    resourceId: parsed.resources[assignment.resourceIndex]!.id,
    arrivedAtSeconds: assignment.arrived, startedAtSeconds: assignment.started, endedAtSeconds: assignment.ended,
  }));
  result.timeline = assignments.map(assignment => ({
    id: parsed.arrivals[assignment.inputIndex]!.id,
    resourceId: parsed.resources[assignment.resourceIndex]!.id,
    state: 'working', startedAtSeconds: assignment.started, endedAtSeconds: assignment.ended,
    completedOperations: 1,
    sourceRefs: [parsed.resources[assignment.resourceIndex]!.sourceRef,
      parsed.arrivals[assignment.inputIndex]!.arrivedAtSeconds.sourceRef,
      parsed.arrivals[assignment.inputIndex]!.serviceSeconds.sourceRef],
    basis: 'computed',
  }));
  const end = parsed.observationEndSeconds.value;
  const completed = assignments.filter(assignment => assignment.ended <= end).length;
  const busyWithinWindow = assignments.reduce((sum, assignment) => sum + Math.max(0, Math.min(end, assignment.ended) - Math.min(end, assignment.started)), 0);
  const waits = assignments.map(assignment => assignment.started - assignment.arrived);
  const waitingTimeWithinWindow = assignments.reduce((sum, assignment) => sum + Math.min(end, assignment.started) - assignment.arrived, 0);
  result.metrics = {
    arrivedOperations: assignments.length,
    completedOperations: completed,
    remainingOperations: assignments.length - completed,
    meanWaitingSeconds: waits.reduce((sum, wait) => sum + wait, 0) / assignments.length,
    maxWaitingSeconds: Math.max(...waits),
    meanQueueLength: waitingTimeWithinWindow / result.durationSeconds,
    queueLength: assignments.filter(assignment => assignment.arrived < end && assignment.started > end).length,
    throughputPerHour: completed * 3600 / result.durationSeconds,
    utilization: busyWithinWindow / (result.durationSeconds * result.resources.length),
    predictedLastCompletionSeconds: Math.max(...assignments.map(assignment => assignment.ended)),
  };
  for (const [key, formula] of Object.entries({
    arrivedOperations: 'count(observed arrivals)', completedOperations: 'count(predicted end <= observationEndSeconds)',
    remainingOperations: 'arrivedOperations - completedOperations',
    meanWaitingSeconds: 'mean(predicted service start - observed arrival); includes jobs starting beyond observation window',
    maxWaitingSeconds: 'max(predicted service start - observed arrival)',
    meanQueueLength: 'integral(predicted queue length within window) / windowSeconds',
    queueLength: 'count(arrival < observationEndSeconds AND predicted start > observationEndSeconds)',
    throughputPerHour: 'completedOperations * 3600 / windowSeconds',
    utilization: 'busy server seconds inside window / (server count * windowSeconds)',
    predictedLastCompletionSeconds: 'max(predicted completion)',
  })) result.trace.push({ key, formula, inputs: ['arrivals', 'resources', 'observationStartSeconds', 'observationEndSeconds', 'continuousAvailabilityConfirmed'] });
  finalizeResult(result);
  return result;
}

export function snapshotSimulation(result: SimulationResult, atSeconds: number): {
  states: Record<string, ResourceState | 'unknown'>;
  completedOperations: number | null;
  observedSeconds: number;
  queueLength: number | null;
} {
  const states: Record<string, ResourceState | 'unknown'> = Object.create(null) as Record<string, ResourceState | 'unknown'>;
  if (result.status !== 'complete' || result.observationStartSeconds === null || result.durationSeconds === null || !Number.isFinite(atSeconds)) {
    return { states, completedOperations: null, observedSeconds: 0, queueLength: null };
  }
  const start = result.observationStartSeconds;
  const end = start + result.durationSeconds;
  const time = Math.max(start, Math.min(atSeconds, end));
  for (const id of result.resources) states[id] = result.jobs ? 'idle' : 'unknown';
  for (const event of result.timeline) {
    if (event.startedAtSeconds <= time && time < event.endedAtSeconds) states[event.resourceId] = event.state;
  }
  const finished = result.timeline.filter(event => event.endedAtSeconds <= time);
  const observedSeconds = result.timeline.reduce((sum, event) => sum + Math.max(0, Math.min(time, event.endedAtSeconds) - Math.min(time, event.startedAtSeconds)), 0);
  const fullObserved = result.jobs !== undefined || Math.abs(observedSeconds - (time - start) * result.resources.length) <= Number.EPSILON * Math.max(1, observedSeconds) * 16;
  const completedOperations = fullObserved && !finished.some(event => event.completedOperations === null)
    ? finished.reduce((sum, event) => sum + event.completedOperations!, 0) : null;
  const queueLength = result.jobs ? result.jobs.filter(job => job.arrivedAtSeconds <= time && job.startedAtSeconds > time).length : null;
  return { states, completedOperations, observedSeconds, queueLength };
}
