import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

// Read-only readiness inventory. No linking, restore, secret changes or deploy.
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
if (!url) throw new Error('URL Supabase absente de la configuration du studio.');
const urlRef = new URL(url).hostname.split('.')[0];
const ref = env.SUPABASE_PROJECT_REF || urlRef;
if (!/^[a-z]{20}$/.test(ref) || ref !== urlRef) throw new Error('Les références Supabase du studio ne concordent pas.');
if (!process.env.npm_execpath) throw new Error('Lance ce contrôle avec npm run backend:check.');

function cli(args) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package=supabase@2.118.0', '--', 'supabase', ...args, '--output-format', 'json'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Le contrôle Supabase ${args.slice(0, 2).join(' ')} a échoué. Vérifie la session CLI existante.`);
  // Never echo CLI output: the secrets inventory includes digests, which the
  // report deliberately discards together with all unknown fields.
  const data = JSON.parse(result.stdout);
  return Array.isArray(data) ? data : data.projects ?? data.functions ?? data.secrets ?? data.data ?? [];
}

const project = cli(['projects', 'list']).find(item => (item.id ?? item.ref) === ref);
if (!project) throw new Error('Le compte CLI ne voit pas le projet configuré dans le studio.');
const functions = cli(['functions', 'list', '--project-ref', ref]);
const secrets = new Set(cli(['secrets', 'list', '--project-ref', ref]).map(item => item.name));
const requiredFunctions = ['byteplus-token', 'messaging-call-token', 'rooms-live-call-token', 'livekit-revocation-worker', 'rooms-live-call-revocation-worker'];
const requiredSecrets = ['BYTEPLUS_RTC_APP_ID', 'BYTEPLUS_RTC_APP_KEY', 'BYTEPLUS_ACCESS_KEY_ID', 'BYTEPLUS_SECRET_ACCESS_KEY',
  'BYTEPLUS_RTC_REGION', 'LIVEKIT_REVOCATION_WORKER_SECRET', 'LIVE_CALL_REVOCATION_WORKER_SECRET'];
const report = { project: project.name, status: project.status,
  functions: Object.fromEntries(requiredFunctions.map(name => [name, functions.some(item => (item.slug ?? item.name) === name)])),
  secretNamesPresent: Object.fromEntries(requiredSecrets.map(name => [name, secrets.has(name)])),
  scope: 'Métadonnées uniquement : ne valide ni les migrations, ni le contenu des fonctions, ni les connexions RTC.',
};
console.log(JSON.stringify(report, null, 2));
if (project.status !== 'ACTIVE_HEALTHY' || Object.values(report.functions).some(value => !value) || Object.values(report.secretNamesPresent).some(value => !value)) process.exitCode = 1;
