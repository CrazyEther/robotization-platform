$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$source = Join-Path $tools 'anylogicPLE-mcp'
$venv = Join-Path $tools 'anylogic-mcp-venv'
$output = Join-Path $tools 'anylogic-ple-models'
$repo = 'https://github.com/umbaman/anylogicPLE-mcp.git'
$commit = '2464973134c10cb5abbc6ff22dbf96bbab0dd99e'

New-Item -ItemType Directory -Force -Path $tools,$output | Out-Null
if (-not (Test-Path (Join-Path $source '.git'))) {
  git clone $repo $source
}
git -C $source fetch --depth 1 origin $commit
git -C $source checkout --detach $commit

$pythonCandidates = @('C:\Python312\python.exe','py')
$python = $null
foreach ($candidate in $pythonCandidates) {
  try {
    if ($candidate -eq 'py') { & py -3.12 --version *> $null; if ($LASTEXITCODE -eq 0) { $python = 'py -3.12'; break } }
    elseif (Test-Path $candidate) { $python = $candidate; break }
  } catch {}
}
if (-not $python) { throw 'Python 3.12 is required for the isolated AnyLogic MCP environment.' }

if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
  if ($python -eq 'py -3.12') { & py -3.12 -m venv $venv } else { & $python -m venv $venv }
}
$venvPython = Join-Path $venv 'Scripts\python.exe'
& $venvPython -m pip install --disable-pip-version-check --no-input -e $source 'mcp>=1.10,<2' 'pytest>=7,<10'
& $venvPython -m pytest (Join-Path $source 'tests') -q

$mcpConfig = @{
  mcpServers = @{
    anylogic_ple = @{
      command = (Join-Path $venv 'Scripts\anylogic-mcp.exe')
      args = @()
      env = @{ ALP_OUTPUT_DIR = $output }
    }
  }
}
$mcpConfig | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $root '.mcp.json') -Encoding UTF8
Write-Output ('ANYLOGIC_MCP_READY ' + (Join-Path $venv 'Scripts\anylogic-mcp.exe'))
Write-Output ('MCP_CONFIG ' + (Join-Path $root '.mcp.json'))
Write-Output ('ALP_OUTPUT_DIR ' + $output)
