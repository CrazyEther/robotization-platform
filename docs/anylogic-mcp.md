# AnyLogic MCP and Desktop automation for RIS

## Purpose

RIS uses three separate layers and they must not be conflated:

1. **AnyLogic Desktop 8.9 PLE** — the actual modelling environment currently installed on the authorized Windows workstation.
2. **AnyLogic Design-Time Python API** — bundled with Desktop and exposed through Py4J. This is the preferred path for programmatically creating/editing real AnyLogic workspace elements after the desktop application is open.
3. **Third-party `anylogicPLE-mcp`** — a pinned helper that can generate simple PLE-compliant `.alp` queue/process prototypes. It is useful for MCP orchestration and validation but is **not** a mobile-robot simulator.

The RIS browser 2D/3D editor is a scenario authoring and replay UI. It must not invent physics or KPIs and must never be labelled AnyLogic execution unless the values came from an actual AnyLogic run.

## Reproducible setup

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-anylogic-mcp.ps1
```

The script:

- clones `umbaman/anylogicPLE-mcp` at commit `2464973134c10cb5abbc6ff22dbf96bbab0dd99e`;
- creates an isolated Python 3.12 virtual environment under ignored `.tools/`;
- pins the Python MCP SDK to major version 1 because the generator is incompatible with MCP 2.x;
- runs the upstream test suite;
- writes ignored `.mcp.json` with a local stdio server definition;
- stores generated `.alp` prototypes under ignored `.tools/anylogic-ple-models/`.

No AnyLogic Cloud key is required for local `.alp` generation. Do not place cloud credentials into `.mcp.json`.

## Verification gates

A successful MCP handshake proves only that the helper process can receive tool calls. A generated `.alp` proves only that a file was emitted. Before treating a model as evidence for robotization, verify separately:

1. the model opens in the installed AnyLogic Desktop;
2. it compiles;
3. the model contains the required Material Handling / navigation logic rather than a Source/Queue/Delay stand-in;
4. a live run produces timestamped robot positions and job states;
5. the same run produces queue, throughput, utilization, traffic, charging, distance and energy KPIs;
6. RIS replay uses those returned coordinates;
7. baseline and robot alternatives share the same demand and geometry;
8. CAPEX/OPEX inputs are independently sourced before ROI/NPV are enabled.

## Design-Time API

The installed AnyLogic includes `anylogic_design_time_api` and a Py4J gateway client. It exposes model, agent and workspace element operations. RIS automation must inspect the real installed generated classes before calling methods. Never invent method names or edit proprietary `.alp` XML from guesses.

This API is the intended extension point for the RIS-specific builder that will create site geometry, paths, stations and model parameters in an opened Desktop workspace.

## Licensing

PLE is appropriate for development and learning. Do not assume it permits commercial hosted RIS execution. Production licensing, Cloud/Online API rights and redistribution must be verified separately before public deployment.
