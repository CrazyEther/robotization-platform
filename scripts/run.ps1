param([ValidateSet('dev','build','start','test','typecheck','lint','data:verify','test:e2e','db:start')][string]$Task='dev')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$runtime=(Get-Command node -ErrorAction SilentlyContinue).Source
if($runtime){$major=[int]((& $runtime -p 'process.versions.node.split(".")[0]') | Select-Object -First 1)}else{$major=0}
if($major -lt 24){
 $candidates=Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\npm-cache\_npx" -Directory -ErrorAction SilentlyContinue
 $runtime=$null
 foreach($candidate in $candidates){$path=Join-Path $candidate.FullName 'node_modules\node\bin\node.exe';if(Test-Path -LiteralPath $path){$version=[int]((& $path -p 'process.versions.node.split(".")[0]') | Select-Object -First 1);if($version -ge 24){$runtime=$path;break}}}
 if(-not $runtime){throw 'Нужен Node.js 24+. Установите его, затем повторите запуск.'}
}
$env:PATH=(Split-Path -Parent $runtime)+';'+$env:PATH
$npmCommand=(Get-Command npm.cmd -ErrorAction Stop).Source
$npmCli=Join-Path (Split-Path -Parent $npmCommand) 'node_modules\npm\bin\npm-cli.js'
if(-not(Test-Path -LiteralPath $npmCli)){throw 'Не найден npm-cli.js рядом с npm.cmd.'}
& $runtime $npmCli run $Task
exit $LASTEXITCODE
