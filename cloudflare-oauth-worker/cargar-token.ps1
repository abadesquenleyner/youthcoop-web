# Carga el token de GitHub del panel en el Worker de Cloudflare (no lo guarda en ningún archivo).
# Uso: powershell -ExecutionPolicy Bypass -File <ruta>\cargar-token.ps1
Set-Location $PSScriptRoot
Write-Host ""
Write-Host "Copia el token en GitHub (empieza con github_pat_) y pegalo aqui con clic derecho." -ForegroundColor Yellow
$t = (Read-Host "Token").Trim()
if ($t -notmatch '^github_pat_[A-Za-z0-9_]{20,}$') {
  Write-Host "Eso no es un token de GitHub (debe empezar con github_pat_). No se cargo nada." -ForegroundColor Red
  exit 1
}
$t | npx wrangler secret put GITHUB_REPO_TOKEN
Remove-Variable t
Write-Host "Listo." -ForegroundColor Green
