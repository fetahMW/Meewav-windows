$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$webRoot = (Resolve-Path (Join-Path $studioRoot '..\..')).Path
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$entryPoint = Join-Path $studioRoot 'dev.mjs'
$iconPath = Join-Path $studioRoot 'assets\meewav.ico'
if (-not (Test-Path -LiteralPath $iconPath)) { throw 'Icône Meewav absente.' }
$desktopDirectory = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDirectory 'Meewav.lnk'
$quotedNode = $nodeExecutable.Replace("'", "''")
$quotedEntry = $entryPoint.Replace("'", "''")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -Command `"& '$quotedNode' '$quotedEntry'`""
$shortcut.WorkingDirectory = $webRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Ouvrir Meewav localement'
$shortcut.Save()
Write-Output $shortcutPath
