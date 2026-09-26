import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadEnv, resolveConfig } from 'vite';

const config = await resolveConfig({ mode: 'production' }, 'build');
const env = { ...loadEnv('production', config.envDir, 'VITE_'), ...process.env };
if (!env.VITE_SUPABASE_ANON_KEY || !env.VITE_SUPABASE_URL) {
  throw new Error('Configuration de production manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont nécessaires pour construire le studio.');
}
if (new URL(env.VITE_SUPABASE_URL).protocol !== 'https:') {
  throw new Error('Le studio distribué nécessite une URL Supabase HTTPS.');
}
const result=spawnSync(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'build','--outDir','dist-desktop'],{
  stdio:'inherit', env:{...process.env,VITE_MEEWAV_STUDIO_DESKTOP:'false',VITE_ROOMS_WORKSPACE_PREVIEW:'false',
    VITE_ROOMS_HOME_WORKSPACE_PREVIEW:'false',VITE_CLASSE_WORKSPACE_PREVIEW:'false'},
});
if(result.error) throw result.error;
process.exitCode=result.status??1;
