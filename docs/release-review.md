# Review: Robot Investment Studio — Digital Twin migration

Review date: 25 September 2026. Working branch: `feat/anylogic-scene-workspace`.

## Current product state

The previous SimPy/JaamSim execution path has been removed from the active product and repository. The primary user path is now:

**object → equipment → editable Digital Twin Studio → execution/replay → baseline comparison → economics**

### Verified implementation

| Area | Current implementation | Remaining release gate |
|---|---|---|
| Facility input | PNG/JPG/WebP underlay; schema-validated JSON geometry; PDF/CAD accepted only as source attachment | vector PDF/DXF/DWG import, scale calibration workflow, BIM |
| 2D editor | walls, racks, doors, chargers, stations, elevators, A/B process zones; drag/select/remove | richer geometry, snapping, multi-floor topology |
| Robot execution | `grid-agv/1.0`: multi-robot tasks, exclusive route cells, queues, loaded/empty travel, charging | robot footprint, turn radius, multi-route traffic, dynamic doors/elevators |
| 2D replay | recorded frames from the same run used for KPI | larger-run performance and trace compression |
| 3D | Three.js geometry + the same robot replay positions | detailed assets/URDF, physics/kinematics |
| Sectors | warehouse, factory, hospital, airport process presets | validated domain-specific flows and resources |
| Baseline comparison | same site and task-arrival schedule class | measured site calibration |
| Finance | CAPEX/OPEX/TCO/ROI/NPV/payback, fail-closed on unmet common demand | quotations, leasing/RaaS, commissioning cash-flow, uncertainty |
| AnyLogic | fail-closed Cloud/API contract and local development tooling | publish a real RIS model and verify its trajectories/KPI end-to-end |
| Public preview | browser Digital Twin can execute; server writes/accounts/AnyLogic are blocked | authentication, persistence, tenant isolation and production ops |

## Quality evidence

Current branch must not be considered release-ready until the exact final commit passes:
- TypeScript typecheck and ESLint;
- complete Vitest suite;
- catalog/source verification;
- production Vite build;
- desktop and mobile Playwright workflow;
- public-preview Playwright boundary test;
- GitHub Actions on the exact pushed commit.

The Digital Twin unit suite includes an explicit invariant that two robots never share the same reported position in one frame.

## Release position

This is a substantial **working pre-investment Digital Twin**, not a validated industrial digital twin of an arbitrary site. The product may demonstrate and compare scenarios, but must not claim verified AnyLogic/FlexSim fidelity, guaranteed throughput, certified navigation safety or “exact ROI” until the relevant model and site data are independently calibrated.
