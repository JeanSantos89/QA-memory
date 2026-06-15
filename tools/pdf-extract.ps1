<#
.SYNOPSIS
  Extracao token-zero de PDF. Roda local, gera .txt e um relatorio de triagem
  para o Claude ler so o texto (barato) em vez do PDF rasterizado (caro).

.EXEMPLO
  .\pdf-extract.ps1 .\meu-doc.pdf
  .\pdf-extract.ps1 .\meu-doc.pdf -OutDir .\extraidos
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Pdf,
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Pdf)) { throw "PDF nao encontrado: $Pdf" }
$pdfItem = Get-Item -LiteralPath $Pdf
if (-not $OutDir) { $OutDir = $pdfItem.DirectoryName }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$base = [IO.Path]::GetFileNameWithoutExtension($pdfItem.Name)
$txt  = Join-Path $OutDir "$base.txt"

# -layout preserva colunas/tabelas; melhor para docs de spec/QA
pdftotext -layout -enc UTF-8 -- $pdfItem.FullName $txt

if (-not (Test-Path -LiteralPath $txt)) { throw "Falha na extracao (pdftotext nao gerou saida)." }

$content   = Get-Content -LiteralPath $txt -Raw -Encoding UTF8
$chars     = $content.Length
$words     = ($content -split '\s+' | Where-Object { $_ -ne '' }).Count
# pdftotext separa paginas com form-feed (\f)
$pages     = ([regex]::Matches($content, "`f")).Count + 1
$tokensEst = [math]::Round($chars / 4)   # ~4 chars/token

# Heuristica de PDF escaneado: muita pagina, pouquissimo texto
$charsPerPage = if ($pages -gt 0) { [math]::Round($chars / $pages) } else { 0 }
$scanned = $charsPerPage -lt 50

Write-Host ""
Write-Host "=== TRIAGEM PDF ===" -ForegroundColor Cyan
Write-Host "Arquivo  : $($pdfItem.Name)"
Write-Host "Texto    : $txt"
Write-Host "Paginas  : ~$pages"
Write-Host "Palavras : $words"
Write-Host "Chars    : $chars"
Write-Host "Tokens   : ~$tokensEst (lendo o .txt)"
Write-Host "Custo se rasterizasse tudo: ~$($pages * 1600) tokens" -ForegroundColor DarkGray
if ($scanned) {
  Write-Host "AVISO: ~$charsPerPage chars/pagina -> provavelmente ESCANEADO." -ForegroundColor Yellow
  Write-Host "       Sem tesseract instalado nao da p/ OCR local. Opcoes:" -ForegroundColor Yellow
  Write-Host "       1) instalar tesseract  2) rasterizar so paginas-chave" -ForegroundColor Yellow
} else {
  Write-Host "OK: texto extraivel. Manda o .txt pro Claude (nao o PDF)." -ForegroundColor Green
}
Write-Host ""
