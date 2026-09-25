[CmdletBinding()]
param(
  [string]$EnvFile,

  [string[]]$TestPath = @("supabase/tests/database"),

  [switch]$Execute,

  [switch]$SkipStart,

  [switch]$SkipReset,

  [switch]$NoSeed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepositoryContext {
  $fallbackRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
  $worktreeRoot = $fallbackRoot
  $mainRoot = $fallbackRoot

  if (Get-Command git -ErrorAction SilentlyContinue) {
    $topLevel = & git -C $fallbackRoot rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $topLevel) {
      $worktreeRoot = [System.IO.Path]::GetFullPath([string]($topLevel | Select-Object -First 1))
    }

    $commonDirectory = & git -C $worktreeRoot rev-parse --path-format=absolute --git-common-dir 2>$null
    if ($LASTEXITCODE -eq 0 -and $commonDirectory) {
      $commonPath = [System.IO.Path]::GetFullPath([string]($commonDirectory | Select-Object -First 1))
      if ((Split-Path -Leaf $commonPath) -eq ".git") {
        $mainRoot = Split-Path -Parent $commonPath
      }
    }
  }

  [PSCustomObject]@{
    WorktreeRoot = $worktreeRoot
    MainRoot = $mainRoot
  }
}

function Resolve-MeewavEnvFile {
  param(
    [string]$ExplicitPath,
    [PSCustomObject]$Repository
  )

  if ($ExplicitPath) {
    if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) {
      throw "Env file not found: $ExplicitPath"
    }
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  foreach ($root in @($Repository.WorktreeRoot, $Repository.MainRoot) | Select-Object -Unique) {
    $candidate = Join-Path $root ".env.local"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Import-MeewavEnvFile {
  param([string]$Path)

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    if ($line.StartsWith("export ")) {
      $line = $line.Substring(7).Trim()
    }

    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) {
      continue
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
      throw "Invalid environment variable name in $Path."
    }

    if ($value.Length -ge 2) {
      $isDoubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
      $isSingleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
      if ($isDoubleQuoted -or $isSingleQuoted) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Invoke-LocalSupabase {
  param(
    [string[]]$Arguments,
    [string]$Display,
    [switch]$SuppressOutput
  )

  if ($Arguments -contains "--linked") {
    throw "Safety guard: linked Supabase commands are forbidden in the local test runner."
  }

  Write-Host "  npx supabase $Display"
  if ($SuppressOutput) {
    & npx "supabase" @Arguments *> $null
  } else {
    & npx "supabase" @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Local Supabase command failed: $Display"
  }
}

$repository = Get-RepositoryContext
$resolvedEnvFile = Resolve-MeewavEnvFile -ExplicitPath $EnvFile -Repository $repository
if ($resolvedEnvFile) {
  Import-MeewavEnvFile -Path $resolvedEnvFile
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "npx is required but was not found on PATH."
}

foreach ($path in $TestPath) {
  $absoluteTestPath = Join-Path $repository.WorktreeRoot $path
  if (-not (Test-Path -LiteralPath $absoluteTestPath)) {
    throw "Database test path not found: $absoluteTestPath"
  }
}

Write-Host "Meewav local Supabase test suite"
Write-Host "  Worktree  : $($repository.WorktreeRoot)"
Write-Host "  Main root : $($repository.MainRoot)"
if ($resolvedEnvFile) {
  Write-Host "  Env file  : $resolvedEnvFile (values hidden)"
} else {
  Write-Host "  Env file  : none (Supabase local defaults only)"
}

Write-Host "Plan:"
if (-not $SkipStart) {
  Write-Host "  npx supabase start"
}
if (-not $SkipReset) {
  $resetDisplay = "db reset --local"
  if ($NoSeed) {
    $resetDisplay += " --no-seed"
  }
  Write-Host "  npx supabase $resetDisplay"
}
Write-Host "  npx supabase db lint --local --level warning --fail-on error"
Write-Host "  npx supabase test db --local $($TestPath -join ' ')"

if (-not $Execute) {
  Write-Host "Dry-run plan only. Add -Execute to run against the local Docker stack."
  exit 0
}

Push-Location $repository.WorktreeRoot
try {
  if (-not $SkipStart) {
    # `supabase start` normally prints local development keys. Keep its output hidden.
    Invoke-LocalSupabase -Arguments @("start") -Display "start (output hidden)" -SuppressOutput
  }

  if (-not $SkipReset) {
    $resetArguments = @("db", "reset", "--local")
    if ($NoSeed) {
      $resetArguments += "--no-seed"
    }
    Invoke-LocalSupabase -Arguments $resetArguments -Display ($resetArguments -join " ")
  }

  Invoke-LocalSupabase -Arguments @("db", "lint", "--local", "--level", "warning", "--fail-on", "error") -Display "db lint --local --level warning --fail-on error"

  $testArguments = @("test", "db", "--local") + $TestPath
  Invoke-LocalSupabase -Arguments $testArguments -Display ("test db --local " + ($TestPath -join " "))
}
finally {
  Pop-Location
}

Write-Host "Local database suite passed. No linked or remote database was modified."
