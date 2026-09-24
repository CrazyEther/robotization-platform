# Install the educational AnyLogic PLE MCP in an isolated, ignored virtualenv.
# It generates Source/Queue/Delay/Sink .alp models only, NOT robot-navigation simulations.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tool = Join-Path $root '.tools\anylogicPLE-mcp'
$venv = Join-Path $root '.tools\anylogic-mcp-venv'
$exe = Join-Path $venv 'Scripts\anylogic-mcp.exe'
$py = Join-Path $venv 'Scripts\python.exe'
$models = Join-Path $root '.tools\anylogic-ple-models'
$revision = '2464973134c10cb5abbc6ff22dbf96bbab0dd99e'
New-Item -Force -ItemType Directory (Join-Path $root '.tools') | Out-Null
if (-not (Test-Path $tool)) {
  git clone https://github.com/umbaman/anylogicPLE-mcp.git $tool
  if ($LASTEXITCODE -ne 0) { throw 'MCP clone failed' }
}
$actual = (git -C $tool rev-parse HEAD).Trim()
if ($actual -ne $revision) {
  git -C $tool cat-file -e "$revision^{commit}"
  if ($LASTEXITCODE -ne 0) { git -C $tool fetch origin $revision }
  if ($LASTEXITCODE -ne 0) { throw 'Cannot verify pinned MCP revision' }
  if ((git -C $tool status --porcelain).Length -ne 0) { throw 'MCP source has local changes; cannot switch revisions safely' }
  git -C $tool checkout --detach $revision
  if ($LASTEXITCODE -ne 0) { throw 'Cannot use pinned MCP revision' }
}
if (-not (Test-Path $py)) {
  python -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ is required to set up the isolated MCP environment' }
}
& $py -m pip install --disable-pip-version-check --no-input -e $tool 'mcp==1.30.0' 'pytest>=7,<10'
if ($LASTEXITCODE -ne 0) { throw 'MCP dependencies failed to install' }
& $py -m pytest (Join-Path $tool 'tests') -q
if ($LASTEXITCODE -ne 0) { throw 'Third-party MCP tests failed' }
New-Item -Force -ItemType Directory $models | Out-Null
$config = Join-Path $root '.mcp.json'
if (-not (Test-Path $config)) {
  $json = @{mcpServers=@{anylogic=@{command=$exe;args=@();env=@{ALP_OUTPUT_DIR=$models}}}} | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($config, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Output ('Created local MCP config: '+$config)
} else {
  Write-Output ('Existing MCP config preserved: '+$config)
}
Write-Output ('AnyLogic PLE MCP executable: '+$exe)
Write-Output 'Reload the supported coding host to register this local MCP. It is NOT auto-connected to ChatGPT.'
