param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z]{20}$')][string]$ProjectRef,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'

# Uses the existing CLI login. Never prints, exports or persists credentials.
# Only appends desktop redirects and creates missing worker/region secrets.
# This does not restore a project, pay invoices, deploy SQL or change RTC keys.
if (-not ('MeeWav.CliCredential' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace MeeWav {
  public static class CliCredential {
    [StructLayout(LayoutKind.Sequential)] struct Credential {
      public uint Flags, Type; public IntPtr Target, Comment; public long Written;
      public uint Size; public IntPtr Blob; public uint Persist, Count;
      public IntPtr Attributes, Alias, User;
    }
    [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool Read(string target, uint type, uint flags, out IntPtr value);
    [DllImport("advapi32.dll")] static extern void CredFree(IntPtr value);
    public static string ReadToken() {
      foreach (var target in new[] { "Supabase CLI:supabase", "Supabase CLI:access-token" }) {
        IntPtr pointer;
        if (!Read(target, 1, 0, out pointer)) continue;
        byte[] bytes = null;
        try {
          var record = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
          bytes = new byte[record.Size];
          Marshal.Copy(record.Blob, bytes, 0, bytes.Length);
          return Encoding.UTF8.GetString(bytes).TrimEnd('\0');
        } finally { if (bytes != null) Array.Clear(bytes, 0, bytes.Length); CredFree(pointer); }
      }
      return null;
    }
  }
}
'@
}
Add-Type -AssemblyName System.Net.Http
$token = $env:SUPABASE_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) { $token = [MeeWav.CliCredential]::ReadToken() }
if ($token -notmatch '^sbp_(oauth_|v0_)?[a-f0-9]{40}$') { throw 'Session Supabase CLI absente ou format non reconnu. Aucun changement.' }
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(45)
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $token)
$token = $null

function Invoke-Management([string]$Method, [string]$Suffix, $Payload = $null) {
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::new($Method), "https://api.supabase.com/v1/projects/$ProjectRef$Suffix")
    $response = $null
    try {
        if ($null -ne $Payload) {
            $body = ConvertTo-Json -InputObject $Payload -Depth 10 -Compress
            $request.Content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, 'application/json')
            $body = $null
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) { throw "API Supabase $Method $Suffix : HTTP $([int]$response.StatusCode). Aucun contenu sensible affiche." }
        $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        return ConvertFrom-Json -InputObject $raw
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}

try {
    $project = Invoke-Management 'GET' ''
    if ($project.id -ne $ProjectRef -or $project.name -ne 'Meewav Dev') { throw 'Le projet ne correspond pas a Meewav Dev. Aucun changement.' }
    Write-Output "Projet : $($project.name). Etat : $($project.status). Appliquer : $([bool]$Apply)."
    $issues = 0
    try {
        $auth = Invoke-Management 'GET' '/config/auth'
        $existing = @(([string]$auth.uri_allow_list -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        $required = @('meewav://app/auth/callback', 'meewav://app/auth/update-password')
        $missing = @($required | Where-Object { $existing -cnotcontains $_ })
        Write-Output "Redirections desktop manquantes : $($missing.Count)."
        if ($Apply -and $missing.Count -gt 0) {
            $null = Invoke-Management 'PATCH' '/config/auth' @{ uri_allow_list = (@($existing) + @($missing)) -join ',' }
            $confirmed = Invoke-Management 'GET' '/config/auth'
            $configured = @(([string]$confirmed.uri_allow_list -split ',') | ForEach-Object { $_.Trim() })
            if (@($required | Where-Object { $configured -cnotcontains $_ }).Count -gt 0) { throw 'Verification des redirections incomplete.' }
            Write-Output 'Redirections desktop ajoutees et verifiees ; redirections existantes conservees.'
        }
    } catch { $issues++; Write-Output "Configuration auth non finalisee : $($_.Exception.Message)" }

    try {
        # Management responses may contain secret values. Keep only names.
        $names = @((Invoke-Management 'GET' '/secrets') | ForEach-Object { $_.name })
        $pending = @()
        foreach ($name in @('LIVEKIT_REVOCATION_WORKER_SECRET', 'LIVE_CALL_REVOCATION_WORKER_SECRET', 'BYTEPLUS_RTC_REGION')) {
            if ($names -ccontains $name) { continue }
            Write-Output "Configuration manquante : $name."
            if (-not $Apply) { continue }
            if ($name -eq 'BYTEPLUS_RTC_REGION') { $value = 'ap-singapore-1' }
            else {
                $bytes = New-Object byte[] 32
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
                try { $rng.GetBytes($bytes); $value = -join ($bytes | ForEach-Object { $_.ToString('x2') }) }
                finally { $rng.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
            }
            $pending += @{ name = $name; value = $value }
            $value = $null
        }
        if ($Apply -and $pending.Count -gt 0) {
            $null = Invoke-Management 'POST' '/secrets' $pending
            $confirmedNames = @((Invoke-Management 'GET' '/secrets') | ForEach-Object { $_.name })
            if (@($pending | Where-Object { $confirmedNames -cnotcontains $_.name }).Count -gt 0) { throw 'Verification des noms de secrets incomplete.' }
            Write-Output "Configurations creees et verifiees : $($pending.Count). Aucune valeur existante remplacee."
        }
        $pending = $null
        foreach ($name in @('BYTEPLUS_ACCESS_KEY_ID', 'BYTEPLUS_SECRET_ACCESS_KEY')) {
            Write-Output "$name present : $($names -ccontains $name)."
        }
    } catch { $issues++; Write-Output "Configuration secrets non finalisee : $($_.Exception.Message)" }
    if ($issues -gt 0) { exit 1 }
} finally { $client.Dispose() }
