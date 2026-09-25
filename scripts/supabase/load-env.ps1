$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$EnvFile = Join-Path $Root ".env.local"

if (-not (Test-Path $EnvFile)) {
  throw "Missing .env.local at $EnvFile"
}

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $parts = $line -split "=", 2
  if ($parts.Length -eq 2) {
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
  }
}

$required = @(
  "SUPABASE_PROJECT_REF",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_DB_URL"
)

foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
    throw "Missing required environment variable: $name"
  }
}
