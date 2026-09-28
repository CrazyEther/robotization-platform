# Material Flow v1 — bounded vertical scenario

Purpose: an executable production cycle, not a calibrated AnyLogic-class digital twin.
Input pallet at pickup → assigned robot → machine → timed processing → a **new**
output pallet → transport request → output station. The same robot may perform
both trips. No inventory of individual rack cells is required or implemented.

## Open and run
1. Open RIS / Digital Twin Studio.
2. Click **Загрузить производственный цикл**.
3. Edit **Время обработки станка** and fleet / workload parameters.
4. Click **Запустить Simulation Core**.
5. Use the timeline and 2D/3D switch to inspect cargo movement, machine
   processing, output pallets, and the computed process KPI.
6. Export the project to inspect the event trace and financial comparison.

## Data flow

- factoryFlowDemo.ts compiles a three-node process with **two transport edges**.
- process-runtime.ts schedules requests, machine queues, duration and explicit
  load transformation when a machine declares `transformsLoad:true`.
- mobile-transport-runtime.ts emits cargo loading and unloading with robot IDs.
- simulationCoreReplay.ts projects the same EventTrace into cargo and robot frames.
- The existing Simulation Study uses that process trace for its KPI/ROI calculations.

Entity lifecycle: created(input) → loaded → unloaded(machine) → processing
→ consumed(input) → created(output) → loaded → unloaded(sink) → completed.

Different operations may preserve the original unit (e.g., hospital inspection);
the platform **never** transforms all Process operations automatically.

## Limitations / evidence

- Racks are geometry, not inventory. The transfer point is adjacent to a rack.
- Load/unload represents time and attachment, not manipulator or forklift dynamics.
- One floor, axis-aligned obstacles and conservative traffic reservations.
- No arbitrary graph-editor UI: the first user-visible template is hard-coded.
- The template is uncalibrated; ROI is withheld until a specific site is confirmed.
- Medical patient care and airport baggage handling require separate process packs.
- No claim of full AnyLogic parity, vendor-grade safety or validated ROI.

Unit tests: packages/ris/factoryFlowDemo.test.ts (process, identity, sensitivity).
E2E: tests/e2e/workflow.spec.ts -g "production cycle:" on desktop and mobile.
Both test the real Simulation Core rather than drawing artificial movements.
