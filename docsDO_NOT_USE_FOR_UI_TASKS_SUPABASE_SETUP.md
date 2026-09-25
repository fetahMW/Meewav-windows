# SETUP ONLY — Supabase/Web handoff

This file is only for initial project setup, Supabase configuration, backend schema work, migrations, environment variables, and repository creation.

Do not read or use this file for normal frontend/UI tasks.

For UI fixes, CSS changes, visual components, popups, auth page layout, buttons, animations, or small React changes:
- ignore this file;
- do not run Git because of this file;
- do not inspect Supabase because of this file;
- do not follow the setup workflow in this file;
- work only on the directly relevant frontend files.

Use this file only if the user explicitly asks for:
- Supabase setup;
- database inspection;
- migrations;
- RLS/security;
- `.env.local`;
- GitHub repo creation;
- backend/auth infrastructure.
# Meewav Web Agent Handoff

This document is for a Codex coding agent working on the Meewav web app from a fresh Windows machine.

The goal is to let the agent create/manage the web repo and work with the existing Supabase backend without asking the human to manually copy SQL into the Supabase dashboard.

## Architecture Decision

Use the same Supabase project for iOS and Web.

Do not create a separate Supabase project for the web app if it is the same Meewav product. iOS and Web must share:

- the same `auth.users`
- the same `public.profiles`
- the same profile visibility rules
- the same rooms, messaging, media, notifications, follows, and future product tables

Creating a separate Supabase project for Web would create duplicate users, duplicate profiles, duplicated auth state, and inconsistent product data.

Recommended GitHub structure:

- iOS app repo: keep the existing iOS repo separate.
- Web app repo: create a separate web repo.
- Supabase project: shared between iOS and Web.

Do not put the web app inside the iOS Swift repo unless the project intentionally becomes a monorepo later.

For backend/schema changes, use migrations. Do not make dashboard-only schema changes that are not captured in Git.

## Git Workflow For The Web Repo

The web repo should use the same clean branch model, without worktrees:

```text
main
  feature/auth
    task/auth/signup-form
    task/auth/google-login
  feature/profile
    task/profile/edit-profile
  feature/messaging
    task/messaging/conversation-list
```

Rules:

- `main` is the stable web app.
- `feature/<feature>` is the integration branch for a full feature.
- `task/<feature>/<task>` is where the agent actually codes.
- Do not code directly in `main`.
- Do not code directly in `feature/*`.
- Merge validated task branches into their feature branch.
- Merge a feature branch into `main` only when the whole feature is validated.

Example:

```bash
git checkout main
git pull
git checkout -b feature/auth
git push -u origin feature/auth

git checkout feature/auth
git pull
git checkout -b task/auth/signup-form
```

After the task is finished:

```bash
git push -u origin HEAD
git checkout feature/auth
git pull
git merge --no-ff task/auth/signup-form
git push
```

When the full feature is validated:

```bash
git checkout main
git pull
git merge --no-ff feature/auth
git push
```

Keep the `feature/*` branches alive. They are the stable integration branches for each feature.

## Create The Web Repo With GitHub CLI

GitHub CLI is already installed on the Windows machine.

From PowerShell:

```powershell
mkdir Meewav-Web
cd Meewav-Web
git init
gh repo create Meewav-Web --private --source=. --remote=origin
git checkout -b main
```

Add the first project files, then:

```powershell
git add .
git commit -m "chore(project): Initialize Meewav web app"
git push -u origin main
```

If the owner wants the repo under a specific GitHub account or organization, create it with:

```powershell
gh repo create OWNER/Meewav-Web --private --source=. --remote=origin
```

## Windows Prerequisites

Install:

- Git
- GitHub CLI
- Node.js 20 or later
- Docker Desktop for Windows, only required for local Supabase
- Supabase CLI

Supabase CLI install options:

Option A, project-local CLI:

```powershell
npm install --save-dev supabase
npx supabase --help
```

Option B, global CLI via Scoop:

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --version
```

Do not install Supabase CLI globally with:

```powershell
npm install -g supabase
```

That global npm installation method is not supported by Supabase.

## Supabase Project

Use the existing shared Meewav Supabase project:

```text
SUPABASE_PROJECT_REF=dqabekaqpznjsagoxzwc
SUPABASE_URL=https://dqabekaqpznjsagoxzwc.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_B3gdxSXt-ngCtm-i31lySw_l2sKbzlD
```

Remote database host:

```text
db.dqabekaqpznjsagoxzwc.supabase.co:5432/postgres
```

Important:

- The publishable key can be used in frontend code.
- The database password must stay in `.env.local`.
- Do not commit `.env.local`.
- Do not put a service-role key in frontend code.
- Do not ask for credentials before checking `.env.local`.

## Create `.env.local`

Create `.env.local` at the root of the web repo.

The database password must be provided by the project owner or copied from the trusted existing dev environment. If the password contains special characters like `@`, URL-encode it before putting it inside `SUPABASE_DB_URL`.

Template:

```env
SUPABASE_PROJECT_REF=dqabekaqpznjsagoxzwc
SUPABASE_URL=https://dqabekaqpznjsagoxzwc.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_B3gdxSXt-ngCtm-i31lySw_l2sKbzlD

SUPABASE_DB_PASSWORD=<PASTE_DEV_DATABASE_PASSWORD>
SUPABASE_DB_URL=postgresql://postgres:<URL_ENCODED_DATABASE_PASSWORD>@db.dqabekaqpznjsagoxzwc.supabase.co:5432/postgres

SUPABASE_LOCAL_URL=http://127.0.0.1:54321
SUPABASE_LOCAL_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_LOCAL_STUDIO_URL=http://127.0.0.1:54323
SUPABASE_LOCAL_INBUCKET_URL=http://127.0.0.1:54324

GOOGLE_OAUTH_WEB_CLIENT_ID=564355860261-2uio35rvlgjaf2b7j55qht85a95tvdkf.apps.googleusercontent.com
GOOGLE_OAUTH_WEB_CLIENT_SECRET=<PASTE_ONLY_IF_BACKEND_OR_SUPABASE_CONFIG_NEEDS_IT>
```

PowerShell helper to URL-encode the password:

```powershell
$raw = "<PASTE_DEV_DATABASE_PASSWORD>"
[uri]::EscapeDataString($raw)
```

Add `.env.local` to `.gitignore`:

```gitignore
.env.local
supabase/.temp/
```

## Login And Link Supabase

From the web repo:

```powershell
npx supabase login
npx supabase init
npx supabase link --project-ref dqabekaqpznjsagoxzwc
```

If using global Scoop install, use `supabase` instead of `npx supabase`.

## Recommended PowerShell Scripts

Create `scripts/supabase/load-env.ps1`:

```powershell
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
```

Create `scripts/supabase/query-remote.ps1`:

```powershell
param(
  [Parameter(Mandatory = $true)]
  [string]$Sql
)

. "$PSScriptRoot/load-env.ps1"

npx supabase db query `
  --db-url $env:SUPABASE_DB_URL `
  --output table `
  $Sql
```

Create `scripts/supabase/doctor.ps1`:

```powershell
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
```

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase/doctor.ps1
powershell -ExecutionPolicy Bypass -File scripts/supabase/query-remote.ps1 "select table_name from information_schema.tables where table_schema = 'public' order by table_name;"
```

## Local Supabase

Remote database inspection does not require Docker.

Docker Desktop is required only if the agent wants to run a full local Supabase stack:

```powershell
npx supabase start
npx supabase status
```

Local URLs:

```text
Local Studio: http://127.0.0.1:54323
Local API: http://127.0.0.1:54321
Local DB: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Local Inbucket: http://127.0.0.1:54324
```

## Backend Rules

Before changing schema:

```powershell
npx supabase db pull --schema public
```

Inspect first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase/query-remote.ps1 "select table_name from information_schema.tables where table_schema = 'public' order by table_name;"
powershell -ExecutionPolicy Bypass -File scripts/supabase/query-remote.ps1 "select tablename, policyname, cmd, roles::text from pg_policies where schemaname = 'public' order by tablename, policyname;"
```

For schema changes:

```powershell
npx supabase migration new <clear_migration_name>
```

Edit the generated SQL migration, test locally if Docker is available, then push only after review:

```powershell
npx supabase db push
```

Rules:

- Do not make blind schema changes.
- Do not weaken RLS to unblock frontend work.
- Do not add blanket public profile reads.
- Do not expose `profiles.email` directly to anonymous frontend code.
- Username login must use `public.resolve_profile_email_for_username(p_username text)`.
- New profiles must remain private by default:
  - `is_ghost_mode = true`
  - `show_on_public_profile = false`

## Existing Remote Schema Snapshot

The shared Supabase project currently includes:

- `auth.users`
- `public.profiles`
- `public.media_files`
- `public.notifications`
- `public.follows`
- `public.rooms_v2`
- `public.room_messages_v2`
- `public.room_participants_v2`
- additional `room_*_v2` tables
- profile extension tables like badges, contracts, hardware, transactions

Auth providers already used:

```text
email
google
```

The web app should build on this existing model instead of creating a parallel model.

## Google OAuth Notes For Web

Supabase Google provider callback URL:

```text
https://dqabekaqpznjsagoxzwc.supabase.co/auth/v1/callback
```

OAuth Web client:

```text
GOOGLE_OAUTH_WEB_CLIENT_ID=564355860261-2uio35rvlgjaf2b7j55qht85a95tvdkf.apps.googleusercontent.com
```

The web frontend normally signs in through Supabase Auth OAuth APIs. The Google client secret must stay in Supabase Dashboard or server-side env only, not in browser code.

## Final Rule For The Agent

The web app and iOS app are separate codebases, but they are one product.

Use separate GitHub repos for app code.
Use the same Supabase project for product data.
Use migrations for backend changes.
Never use dashboard-only backend edits as the final source of truth.

## Official References

- Supabase CLI getting started: https://supabase.com/docs/guides/local-development/cli/getting-started
- Supabase local development and CLI: https://supabase.com/docs/guides/local-development
- Supabase migrations workflow: https://supabase.com/docs/guides/cli/local-development
