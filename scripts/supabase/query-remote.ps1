param(
  [Parameter(Mandatory = $true)]
  [string]$Sql
)

. "$PSScriptRoot/load-env.ps1"

npx supabase db query `
  --db-url $env:SUPABASE_DB_URL `
  --output table `
  $Sql
