# =============================================================================
# PowerShell Aliases - Translated from zsh-aliases.zsh
# =============================================================================

# --- Navigation ---
# Note: '.' (pwd) cannot be aliased — it is the dot-source operator in PowerShell
# Note: '~' already works natively in PowerShell (cd ~)
# Note: .2-.9 (zsh directory stack) have no direct PowerShell equivalent
function ..     { Set-Location .. }
function ...    { Set-Location ..\.. }
function ....   { Set-Location ..\..\.. }
function .....  { Set-Location ..\..\..\.. }
function ...... { Set-Location ..\..\..\..\.. }

function ~ { Set-Location ~ }

# Project directory shortcuts
function dev { Set-Location /workspace }
function ws  { Set-Location /workspace }

# --- Directory listing ---
# l  : long format
# ll : long format, include hidden files (all except . and ..)
# la : long format, include all files (same as ll in PowerShell)
# lsd: directories only
function l {
    Get-ChildItem @args | Format-Table Mode, LastWriteTime,
        @{ N = 'Size'; E = { if ($_.PSIsContainer) { '<DIR>' } else { '{0,10:N0}' -f $_.Length } } },
        Name -AutoSize
}

function ll {
    Get-ChildItem -Force @args | Format-Table Mode, LastWriteTime,
        @{ N = 'Size'; E = { if ($_.PSIsContainer) { '<DIR>' } else { '{0,10:N0}' -f $_.Length } } },
        Name -AutoSize
}

function la {
    Get-ChildItem -Force @args | Format-Table Mode, LastWriteTime,
        @{ N = 'Size'; E = { if ($_.PSIsContainer) { '<DIR>' } else { '{0,10:N0}' -f $_.Length } } },
        Name -AutoSize
}

function lsd {
    Get-ChildItem @args | Where-Object PSIsContainer | Format-Table Mode, LastWriteTime, Name -AutoSize
}

function ls {
    Get-ChildItem @args
}

# --- Linux tools via C:\xbin (pass-through with default flags) ---
# Remove built-in wget alias (Invoke-WebRequest) to use the real wget
Remove-Item Alias:wget -ErrorAction SilentlyContinue

function du   { du -h @args }
function df   { df -h @args }
function wget { wget -c @args }

# --- Miscellaneous utilities ---
function epoch { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

# mkdir: PowerShell's New-Item creates parent dirs with -Force (equivalent to mkdir -p)
function mkdir { New-Item -ItemType Directory -Force -Path @args }

# --- IP address utilities ---
function whatsmyip { (Invoke-RestMethod -Uri 'https://api.ipify.org').Trim() }
function ifconfigme { (Invoke-RestMethod -Uri 'https://ifconfig.me').Trim() }
function ips {
    Get-NetIPAddress |
        Where-Object { $_.AddressState -eq 'Preferred' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -ExpandProperty IPAddress
}

# --- Hex dump ---
Set-Alias -Name hd -Value Format-Hex

# --- Hash utilities ---
Set-Alias -Name md5sum  -Value md5sum
Set-Alias -Name sha1sum -Value sha1sum
function sha256sum { Get-FileHash -Algorithm SHA256 @args | Select-Object Hash, Path }

# --- map (like xargs -n1: apply a command to each piped item) ---
# Usage: Get-ChildItem . -Name | map { param($f) Write-Host $f }
#    or: 'path1','path2' | map Split-Path
function map {
    $cmd = $args[0]
    $input | ForEach-Object { & $cmd $_ }
}
