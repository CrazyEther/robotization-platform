# Integration, verification and recovery playbook

## Verified local environment
One authorized Remote Desktop Commander device DESKTOP-SNNO6M6 had `C:\Program Files\AnyLogic 8.9 Personal Learning Edition\AnyLogic.exe` and bundled `anylogic_design_time_api` Python modules. This is not proof that another user's Windows machine with a different home directory has the same files. Detect the actual host on each run. The external MCP prototype is in ignored `.tools/anylogicPLE-mcp`, commit `2464973134c10cb5abbc6ff22dbf96bbab0dd99e`. Its Python environment is ignored `.tools/anylogic-mcp-venv`. The `mcp` Python dependency must remain on major version 1 (v1.30.0 verified): major v2 removed `Server.list_tools()` and the third-party implementation crashes on startup. Do not modify upstream package imports to mask breakages.

The project-local setup script writes a private `.mcp.json` with a command to start the local `anylogic-mcp.exe`; it contains NO Cloud key. To enable it in a local agent, open this repository in a coding host that supports project MCP discovery and approve the configured server. This ChatGPT conversation's available tools remain separately registered; access through Remote Desktop Commander does not imply automatic MCP tool discovery.

## Verified vs unsupported
An MCP handshake/list-tools round trip and generation of `RIS_MCP_Smoke.alp` (~34 kB on the verified machine) proved the basic MCP package can write a simplistic queue model. Third-party package tests: 48 passing. There has NOT been an independently observed AnyLogic GUI opening/compilation/run of that file. Source/Queue/Delay/Sink cannot represent robot footprint, battery/charging, navigation, safe clearance or conveyor handshakes. For robot modelling use native AnyLogic components with manual API/documentation verification and a model-level regression harness.

## Workflow for site uploads
Store the upload separately from editable geometry. Require image-to-meter calibration (at least two reference points or imported CAD units). Require interactive correction of walls, shelf/obstacle rectangles, doors, pickup and dropoff, charger and robot-start positions. Only after geometry is validated, construct AnyLogic navigable space. A schematic 1-m grid is not proof that a 1.2-m-wide robot fits a 1.0-m aisle. If the user adds/removes an obstruction, invalidate all old routes, rendered traces, KPIs and ROI; never update only the animation.

## Version/seed KPI contract
Record a model version and input hash for each run. Define task state machine (created→queued→assigned→pickup→transport→dropoff→completed/failed), route and resource ownership and charger state. Each frame needs t [seconds], robotId, x/y meters, taskId, state and battery. For deterministic runs, repeat identical inputs and compare counters/trace hashes. For stochastic runs, use multiple independent seeds and report distributions. Ensure counters reconcile (created ≥ completed+remaining+failed, with exact accounting under the chosen horizon), no obstacle penetration and energy usage nonnegative. A completed engine run missing any required report or trajectory is an error; do not turn empty output into success.

## Finance and acceptance
Use identical incoming task streams for baseline and alternative; report unit CAPEX, installation, chargers, site construction, integration, maintenance per robot, electricity price, retained human resources and throughput effect. ROI/NPV need evidence for actual monetary savings and common annual demand. Compare 1/2/4 robots, test 125% peak only as stress scenario, and distinguish aggregate statistics from individual robot trajectories. If an API license is absent, keep the Cloud route disabled while allowing local development, never inject a sample result.

## Failures and next action
* MCP handshake exits immediately with AttributeError Server.list_tools → isolate dependency version `mcp==1.30.0`, rerun handshake, do not downgrade the AnyLogic desktop installation.
* Valid XML but AnyLogic refuses to open .alp → compare generator's target AnyLogic minor version, open minimal model, inspect actual app log; do not call file existence a validation.
* Native model loads but 2D robot moves through wall → stop KPI/ROI reporting; repair geometry, collision rules and route constraints before any performance comparison.
* Cloud token missing or online editor has no API entitlement → no Cloud API calls; use local tests and acquire explicit rights if needed.
* Tool reports synthetic KPI without trajectory or baseline → mark it as demonstration only and block finance.
* A PLE license is present for a commercial client-facing deployment → do not use that license for production; confirm commercial/hosted terms with licensor and use a suitable license or an alternative permitted engine.

## Hand-off minimum
Specify exact machine, AnyLogic edition/version, skill version, MCP source commit, virtualenv version, actual model path, compile/run proof, API entitlement, accepted input/trace/KPI schema and unresolved limitations. Include unsuccessful checks; never report a tested robot digital twin on the basis of a queueing file.
