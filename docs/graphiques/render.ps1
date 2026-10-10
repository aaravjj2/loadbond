# Renders deck.html to slides/NN.png (1920x1080) and deck.pdf with headless Chrome.
param([string]$Browser = "C:\Program Files\Google\Chrome\Application\chrome.exe", [int]$Slides = 12)
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$deck = (Join-Path $here "deck.html") -replace '\\', '/'
$out = Join-Path $here "slides"
New-Item -ItemType Directory -Force $out | Out-Null
$profile = Join-Path $env:TEMP "loadbond-deck-profile"
foreach ($n in 1..$Slides) {
    $png = Join-Path $out ("{0:D2}.png" -f $n)
    & $Browser --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" --allow-file-access-from-files `
        --window-size=1920,1080 --screenshot="$png" "file:///$deck`?s=$n" 2>$null | Out-Null
}
& $Browser --headless=new --disable-gpu --user-data-dir="$profile" --no-pdf-header-footer `
    --print-to-pdf="$(Join-Path $here 'deck.pdf')" "file:///$deck" 2>$null | Out-Null
Get-ChildItem $out, (Join-Path $here "deck.pdf") | Select-Object Name, Length
