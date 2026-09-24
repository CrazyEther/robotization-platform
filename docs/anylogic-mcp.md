# AnyLogic PLE MCP and RIS skill

## What is actually installed

A third-party MIT-licensed `anylogicPLE-mcp` prototype from https://github.com/umbaman/anylogicPLE-mcp at commit `2464973134c10cb5abbc6ff22dbf96bbab0dd99e`. It generates educational Source/Queue/Delay/Sink AnyLogic 8.9 PLE `.alp` flowcharts. It is **not** an agent-based warehouse robot simulator, a 3D physics engine, or a replacement for the professional RIS process model.

In a Windows PowerShell terminal at the repository root:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-anylogic-mcp.ps1
& .\.tools\anylogic-mcp-venv\Scripts\python.exe scripts\smoke-anylogic-mcp.py
```
The setup checks out the reviewed upstream source revision, installs dependencies including `mcp==1.30.0` in an isolated environment, runs upstream tests and writes `./.mcp.json` only if one does not exist. The MCP major version is pinned because the current upstream server uses the MCP Python 1.x `@app.list_tools()` API and fails under 2.x. `.tools/` and `.mcp.json` are excluded from Git; generated files stay local in `.tools/anylogic-ple-models/`.

Open the repository in a compatible coding host (such as Codex/VS Code with project MCP support) and approve/reload its configured `anylogic` server. This step is specific to that host; adding a local stdio MCP on a remote computer does not register a new ChatGPT tool. For this conversation, the connected Remote Desktop Commander can invoke the server through the project-local smoke client; ChatGPT can also read `.agents/skills/ris-anylogic/SKILL.md` through authorized project tools.

## Evidence and limitations

The verified linked Windows computer has AnyLogic 8.9 PLE installed. The MCP dependency's **48 unit tests passed**, MCP initialize/list-tools succeeded and its generator produced a ~34 kB `RIS_MCP_Smoke.alp` file. Opening/compiling/executing that specific `.alp` in the AnyLogic GUI, controlling physical AGV navigation, tracking 2D/3D robot trajectories and deriving verified ROI were NOT demonstrated by these checks. Treat the example as a minimal queueing prototype only.

AnyLogic Online is a distinct editable web environment that can create and run models. Using AnyLogic PLE or signing into AnyLogic Online does not automatically grant a commercial SaaS deployment license or full Cloud API rights. Before a public RIS launch, confirm the applicable license and API entitlement.

The RIS-specific project skill is stored under `.agents/skills/ris-anylogic/` with a substantial validation reference and semantic eval cases. It is a draft workflow/agent instruction, not a compiled AnyLogic binary. Re-check actual feature support and model evidence at each implementation step.
