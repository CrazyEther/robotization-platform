# Simulation engines and evidence boundaries

## Current executable engine

The active RIS simulation is **RIS Digital Twin `grid-agv/1.0`**, implemented in `packages/ris/digitalTwin.ts`.

It uses the same scenario geometry and incoming workload for the baseline and robot alternative. The robot run produces time-indexed robot positions and operational state together with KPI. The UI replays those recorded frames in 2D and uses the same positions for the Three.js 3D view; it does not generate unrelated decorative motion.

The current engine models:
- multiple transport robots on a one-metre orthogonal grid;
- queued work, loading/unloading, loaded and empty travel;
- exclusive internal route occupancy and traffic waiting;
- battery depletion, charging and charger-channel contention;
- backlog, throughput, mean waiting time, P95 job time, fleet utilization and energy;
- deterministic fixed demand or seeded Poisson arrivals;
- a baseline process under the same demand and site geometry.

It is intentionally **not described as AnyLogic-equivalent physics**. Current limits include a single level, one primary A→B transport flow, no footprint/turn-radius model, no dynamic doors/elevators, no safety scanner zones and no calibrated physical dynamics.

## Scene and plan import

`packages/ris/scene.ts` is the geometry boundary.

- JSON geometry is schema-validated before use.
- PNG/JPG/WebP is a visual underlay that the user traces/edits; an image alone is not treated as navigable geometry.
- PDF/DXF/DWG can be attached as source material in the current UI but are not automatically vectorized yet.
- Walls and racks are blocking geometry.
- Chargers are operational: their configured capacity changes available charging channels.
- Doors, stations and elevators are currently scene metadata and require scenario-specific behavior before they can alter the simulation.

## Professional AnyLogic adapter

`packages/ris/cloud.ts` defines a fail-closed adapter for an externally published AnyLogic model. It requires a versioned model that accepts the RIS geometry/robot/process contract and returns both:
- `risTraceJson` — the measured/engine-produced trajectory frames;
- `risKpisJson` — the KPI produced by that same run.

The API key stays server-side. `/api/v1/ris/cloud/inspect` verifies the expected model inputs/outputs before a run. `/api/v1/ris/cloud/run` does not invent results when the model, version, credentials or output contract are unavailable.

A locally installed AnyLogic 8.9 Personal Learning Edition and the pinned third-party AnyLogic PLE MCP are useful development aids. The third-party MCP currently creates simple Process Modeling Library models and is **not** an AGV/navigation engine for RIS.

No live published RIS AnyLogic model has yet been verified end-to-end, therefore the product must not label local RIS Digital Twin output as AnyLogic output.

## Financial evidence

`compareDigitalTwin` uses:
- actual completed work from the baseline run;
- actual completed work and energy from the robot run;
- the same annual demand threshold for both;
- user-entered robot CAPEX, integration/infrastructure, maintenance, electricity, baseline cash cost and residual human cost.

ROI/NPV/payback are withheld unless both simulated processes meet the same required annual workload and the mandatory financial inputs are coherent.

The result is a pre-investment estimate. It does not establish supplier quotations, taxes, financing, commissioning downtime, safety certification or field performance. Those require independent evidence.
