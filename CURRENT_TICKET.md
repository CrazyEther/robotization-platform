# CURRENT TICKET — AnyLogic-backed RIS digital twin

Updated: 2026-09-26 09:03 +05:00
Branch: feat/anylogic-scene-workspace

## Goal
Replace RIS's self-authored browser simulation as the source of engineering KPIs/ROI with a real AnyLogic-backed execution path while keeping the browser as the editable site/robot authoring and replay workspace.

Target user flow:
1. Upload or draw a facility plan.
2. Calibrate dimensions and edit walls, racks, doors, stations, chargers and elevators.
3. Choose robot and sector workflow (warehouse / medical facility / airport, extensible).
4. Serialize the same scene/process/robot contract into an executable AnyLogic model.
5. Run AnyLogic, collect actual trajectory + KPI outputs, replay the same trace in RIS 2D/3D.
6. Compare baseline and robotized scenarios under the same demand/site assumptions.
7. Enable CAPEX/OPEX/TCO/ROI only when both execution evidence and monetary inputs are valid.

## Current implementation evidence
- AnyLogic Desktop 8.9 Personal Learning Edition is installed on the authorized Windows workstation.
- Repository skill .agents/skills/ris-anylogic exists and documents evidence gates.
- Pinned third-party anylogicPLE-mcp setup exists as a scaffold for simple PLE .alp generation; it is not accepted as mobile-robot simulation.
- RIS already contains an editable DigitalTwinStudio, 2D scene editor, 3D Three.js view, robot/catalog selection and warehouse/hospital/airport/factory templates.
- Current blocker: DigitalTwinStudio still calls local runDigitalTwin()/runBaseline() from packages/ris/digitalTwin.ts. Those results are NOT accepted as professional AnyLogic execution evidence.

## Active work card
**TICKET AL-001 — Establish a real AnyLogic Desktop execution seam**

Acceptance:
- MCP helper handshake succeeds and creates an .alp scaffold in an isolated ignored directory.
- Generated .alp is launchable by installed AnyLogic Desktop (opening/compile/run are separate gates).
- Installed AnyLogic Design-Time API surface is inspected from the actual 8.9 installation; no invented API methods.
- A versioned RIS↔AnyLogic scene/process/output contract is documented in code.
- Browser self-simulation cannot be labelled or used as AnyLogic result/ROI evidence.
- Next executable card identifies the minimum real AnyLogic model required for warehouse transport.

## Invariants
- Never fabricate AnyLogic trajectories/KPIs.
- Browser/Three.js replay is presentation only unless frames came from a verified run.
- One uploaded image/PDF is only a reference layer until scale/traversable geometry is confirmed.
- Baseline and robot scenario must share demand, horizon and site geometry for economic comparison.
- PLE is development/learning infrastructure, not assumed production licensing.
- AnyLogic API/cloud credentials are never committed or exposed to browser JavaScript.

## Snapshot log
### 2026-09-26 / S001 — resumed work
- Confirmed clean git working tree on feat/anylogic-scene-workspace.
- Confirmed commits 7301021 (pinned AnyLogic PLE MCP + RIS skill) and dd0efe3 (editable digital twin workspace).
- Confirmed installed AnyLogic Desktop 8.9 PLE.
- Identified architectural mismatch: current grid-agv/1.0 browser engine remains the source of local simulation KPIs despite the requirement for professional AnyLogic execution.
- Next: verify MCP scaffold end-to-end, inspect Design-Time API, then replace the runtime seam.

### 2026-09-26 / S002 — AnyLogic toolchain verification
- Verified pinned third-party anylogicPLE-mcp end-to-end over MCP stdio: handshake succeeded and 5 tools were exposed.
- Generated `.tools/anylogic-ple-models/RIS_MCP_Smoke.alp` (34,126 bytes) successfully through the MCP helper.
- Confirmed this helper remains only a scaffold generator (Source/Queue/Delay/Sink), not an AGV/material-handling implementation.
- Confirmed from official AnyLogic 8.9.7+ documentation that Python Design-Time API requires Professional or University Researcher edition; PLE contains helper files but does not expose the graphical-editor API connector/token.
- Consequence: PLE can be used to open/run manually-created real models, but automatic scene construction through the official Design-Time API is blocked on current license.
- Next: launch the generated `.alp` in installed AnyLogic PLE as an opening/compatibility smoke gate, then replace RIS browser simulation execution with an explicit AnyLogic-unavailable/read-only state until a real AnyLogic model execution bridge exists.

### 2026-09-26 / S003 — evidence-gated migration completed
- Removed the browser/grid simulator from the trusted KPI/ROI path in DigitalTwinStudio.
- Added the versioned RIS↔AnyLogic input/evidence contract in packages/ris/anylogic.ts.
- Added deterministic input fingerprinting and exact package/evidence matching.
- Evidence validation now rejects malformed KPI, out-of-bounds traces, incomplete robot fleets and changing robot identities.
- 2D/3D replay, baseline comparison and finance are unavailable until matching AnyLogic evidence is imported.
- Updated startup language so browser 2D/3D is described as authoring/replay only.
- Verification: typecheck PASS; lint PASS; 81/81 unit tests PASS; data:verify PASS; build PASS; Playwright desktop/mobile 11 PASS / 3 expected skips.
- The ChatGPT Playwright MCP connector itself returned an SSE 404 in this session; repository Playwright CLI verification completed successfully.
- Next engineering milestone remains AL-006 opening/compile smoke for generated .alp, followed by AL-007 real warehouse AMR/AGV AnyLogic model and trajectory/KPI export.
