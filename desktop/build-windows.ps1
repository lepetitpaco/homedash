# Construit l'appli de bureau homedash sur ce PC Windows, comme build-local.sh
# sur un Mac. Il ne faut que Docker Desktop (lancé) : tout se passe dans un
# container (desktop/windows-build.sh).
#
#   powershell -ExecutionPolicy Bypass -File desktop\build-windows.ps1            → construit
#   powershell -ExecutionPolicy Bypass -File desktop\build-windows.ps1 -Install   → et l'installe
#
# Construite sur le PC même, l'appli n'est pas « téléchargée » : Windows ne
# l'arrête pas au premier lancement.
param([switch]$Install)
$ErrorActionPreference = 'Stop'
$desktop = $PSScriptRoot
$public = Join-Path (Split-Path $desktop -Parent) 'public'

docker run --rm -v "${desktop}:/b" -v "${public}:/public:ro" node:22-bookworm sh /b/windows-build.sh
if ($LASTEXITCODE -ne 0) { throw "La construction a échoué (code $LASTEXITCODE)." }

$version = (Get-Content (Join-Path $desktop 'package.json') -Raw | ConvertFrom-Json).version
$setup = Join-Path $desktop "dist.noindex\homedash-$version-win-x64-setup.exe"
if ($Install) {
  # /S : installation silencieuse (menu Démarrer, Bureau, désinstalleur), puis lancement
  Start-Process -FilePath $setup -ArgumentList '/S' -Wait
  Start-Process (Join-Path $env:LOCALAPPDATA 'Programs\homedash\homedash.exe')
  Write-Host "✓ homedash installé : menu Démarrer → homedash"
} else {
  Write-Host "✓ $setup"
}
