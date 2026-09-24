---
name: ris-anylogic
description: Build, inspect and test AnyLogic Desktop/Online models and MCP-assisted .alp prototypes for Robot Investment Studio; use for editable floor plans, AGV/AMR routing, warehouse/hospital/airport scenarios, 2D/3D replay, model KPI and simulation-based ROI.
---

# RIS AnyLogic modelling skill

## Classify the task before choosing a tool
**Flowchart prototype:** The optional third-party anylogicPLE-mcp can create Source/Queue/Delay/Sink .alp files for AnyLogic PLE 8.9. It cannot generate validated AGV navigation, robot 2D/3D physics or an AnyLogic Cloud model API. Use its output as an educational scaffold only, not as the answer to a realistic robotization request.

**Physical/process simulation:** Create a genuine executable AnyLogic model with configurable room geometry, immovable objects, access zones, fleet and charger resources, task scheduling, path planning and conflict rules. Inspect the real installed AnyLogic API/design-time capabilities before writing Java snippets; do not invent API names or direct-manipulate proprietary model XML from guesses. Benchmark against a documented, manually opened desktop model.

**Online integration:** AnyLogic Online can edit and run models in browser. Public web execution through an API requires an accessible published RIS model, the correct API permissions, verified model version and server-side credentials. Never treat a browser session or Cloud model gallery as proof of API access.

## Model I/O contract and evidence
Input: calibrated floor dimensions and scale, obstacles/doors/zones/channels, selected robot ID and footprint, speed, payload, energy/charge constraints, task origin/destination, arrival distribution and seed, work shifts, baseline staffing, measured service times. A PNG/PDF/CAD floor plan is a reference layer until walls, scale and traversable geometry are confirmed.

Output per run: engine/model versions, input hash, seed, scene, robot ID, task arrivals/completions, timestamps and per-robot (x,y[,z],state,battery,task) trace, metrics for queue, utilization, distance, charging, bottlenecks, energy, unserved jobs, warnings, and a copy of all cash-cost assumptions. Playback must use actual output frames from the same run as reported KPIs. A Three.js scene of extruded obstacles alone is NOT an AnyLogic 3D simulation.

For each warehouse, hospital or airport case, use independent sector-specific workflow rules built on shared room/robot/task schemas. Medical and airport templates are illustrative until actual site and safety rules are provided. Validate minimum aisle widths, turn radius, forbidden crossings, inaccessible destinations, door/elevator capacity and emergency routes.

Compare current and automated processes under the same demand, time horizon and site constraints. Do not derive financial savings from faster motion alone; require measured throughput, verified CAPEX/OPEX and realistic retained labour. If the baseline, run, trajectory, sensor data or site calibration is missing, block ROI/NPV instead of fabricating it. Repeat stochastic experiments, expose uncertainty and provide traceable data provenance.

## Tooling and execution
From the repository root run `powershell -ExecutionPolicy Bypass -File scripts/setup-anylogic-mcp.ps1` once for a local isolated MCP installation and a nontracked `.mcp.json`. Read `references/integration-and-validation.md` before using the tool. Check that the desktop AnyLogic installation is on the actually connected computer. The MCP process must be explicitly registered in the supported coding-agent host; it does not automatically become a ChatGPT connector. An authorized remote desktop can invoke the local tool using a project-local MCP client.

Before modifying any user .alp, copy it and record its source version. Before claiming success, test MCP handshake/tool list, generated .alp validity, real AnyLogic opening and compilation, a live run with visible 2D/3D robot motion and KPI trace, and then the complete RIS API/economics path as separate gates. Report explicitly any unverified gate.

**License:** AnyLogic PLE is for education and personal learning. Never represent PLE as licensed for commercial public RIS hosting or customer projects; verify applicable terms and acquire suitable rights before deployment.
