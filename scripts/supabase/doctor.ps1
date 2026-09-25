. "$PSScriptRoot/load-env.ps1"

Write-Host "Supabase project: $env:SUPABASE_PROJECT_REF"
Write-Host "Supabase URL: $env:SUPABASE_URL"

npx supabase --version

npx supabase db query `
  --db-url $env:SUPABASE_DB_URL `
  --output table `
  "select current_database() as database_name, current_user as user_name;"

npx supabase db query `
  --db-url $env:SUPABASE_DB_URL `
  --output table `
  "select count(*) as auth_users from auth.users;"

npx supabase db query `
  --db-url $env:SUPABASE_DB_URL `
  --output table `
  "select count(*) as profiles from public.profiles;"
