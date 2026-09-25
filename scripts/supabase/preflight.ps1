[CmdletBinding()]
param(
  [ValidateSet("local", "staging", "production")]
  [string]$Environment = "local",

  [string]$EnvFile,

  [string]$ExpectedProjectRef,

  [switch]$Execute,

  [switch]$AllowProduction
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
    [string]$TargetEnvironment,
    [PSCustomObject]$Repository
  )

  if ($ExplicitPath) {
    if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) {
      throw "Env file not found: $ExplicitPath"
    }
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $candidatePaths = New-Object System.Collections.Generic.List[string]
  $roots = @($Repository.WorktreeRoot, $Repository.MainRoot) | Select-Object -Unique

  if ($TargetEnvironment -ne "local") {
    foreach ($root in $roots) {
      $candidatePaths.Add((Join-Path $root ".env.$TargetEnvironment.local"))
    }
  }

  foreach ($root in $roots) {
    $candidatePaths.Add((Join-Path $root ".env.local"))
  }

  foreach ($candidate in $candidatePaths) {
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

function Get-EnvironmentValue {
  param([string]$Name)
  return [Environment]::GetEnvironmentVariable($Name, "Process")
}

function Invoke-SupabaseCheck {
  param(
    [string[]]$Arguments,
    [string]$SafeDisplay
  )

  Write-Host "  npx supabase $SafeDisplay"
  & npx "supabase" @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase preflight command failed: $SafeDisplay"
  }
}

if ($Environment -eq "production" -and -not $AllowProduction) {
  throw "Production refused. Re-run with -AllowProduction and -ExpectedProjectRef after an explicit release decision."
}

if ($Environment -ne "local" -and -not $ExpectedProjectRef) {
  throw "Remote preflight requires -ExpectedProjectRef to prevent staging/production mix-ups."
}

$repository = Get-RepositoryContext
$resolvedEnvFile = Resolve-MeewavEnvFile -ExplicitPath $EnvFile -TargetEnvironment $Environment -Repository $repository

if ($resolvedEnvFile) {
  Import-MeewavEnvFile -Path $resolvedEnvFile
}
elseif ($Environment -ne "local") {
  throw "No environment file found. Pass -EnvFile or create the environment file in the worktree/main checkout root."
}

$projectRef = Get-EnvironmentValue -Name "SUPABASE_PROJECT_REF"
$dbUrl = Get-EnvironmentValue -Name "SUPABASE_DB_URL"
$declaredEnvironment = Get-EnvironmentValue -Name "MEEWAV_BACKEND_ENVIRONMENT"

if ($declaredEnvironment -and $declaredEnvironment -ne $Environment) {
  throw "Environment marker mismatch: requested '$Environment', env file declares '$declaredEnvironment'."
}

if ($Environment -ne "local") {
  if (-not $projectRef) {
    throw "SUPABASE_PROJECT_REF is required for a remote preflight."
  }
  if (-not $dbUrl) {
    throw "SUPABASE_DB_URL is required for a remote preflight."
  }
  if ($projectRef -ne $ExpectedProjectRef) {
    throw "Project-ref mismatch. Refusing to inspect the wrong Supabase project."
  }
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "npx is required but was not found on PATH."
}

Write-Host "Meewav Supabase preflight"
Write-Host "  Environment : $Environment"
Write-Host "  Worktree    : $($repository.WorktreeRoot)"
Write-Host "  Main root   : $($repository.MainRoot)"
if ($resolvedEnvFile) {
  Write-Host "  Env file    : $resolvedEnvFile (values hidden)"
} else {
  Write-Host "  Env file    : none (local defaults only)"
}
if ($Environment -ne "local") {
  Write-Host "  Project ref : $projectRef"
}

Write-Host "Checks:"
if ($Environment -eq "local") {
  Write-Host "  npx supabase --version"
  Write-Host "  npx supabase db push --local --dry-run --include-all"
  Write-Host "  npx supabase db lint --local --level warning --fail-on error"
} else {
  Write-Host "  npx supabase --version"
  Write-Host "  npx supabase db push --db-url <redacted> --dry-run --include-all"
  Write-Host "  npx supabase db lint --db-url <redacted> --level warning --fail-on error"
}

if (-not $Execute) {
  Write-Host "Dry-run plan only. Add -Execute to run these non-deploying checks."
  exit 0
}

Push-Location $repository.WorktreeRoot
try {
  Invoke-SupabaseCheck -Arguments @("--version") -SafeDisplay "--version"

  if ($Environment -eq "local") {
    Invoke-SupabaseCheck -Arguments @("db", "push", "--local", "--dry-run", "--include-all") -SafeDisplay "db push --local --dry-run --include-all"
    Invoke-SupabaseCheck -Arguments @("db", "lint", "--local", "--level", "warning", "--fail-on", "error") -SafeDisplay "db lint --local --level warning --fail-on error"
  } else {
    Invoke-SupabaseCheck -Arguments @("db", "push", "--db-url", $dbUrl, "--dry-run", "--include-all") -SafeDisplay "db push --db-url <redacted> --dry-run --include-all"
    Invoke-SupabaseCheck -Arguments @("db", "lint", "--db-url", $dbUrl, "--level", "warning", "--fail-on", "error") -SafeDisplay "db lint --db-url <redacted> --level warning --fail-on error"
  }
}
finally {
  Pop-Location
}

Write-Host "Preflight passed. No migration was applied."
