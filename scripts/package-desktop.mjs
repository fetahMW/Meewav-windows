import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

// Electron's archive extraction renames its staging directory. Desktop folder
// watchers can hold that directory open on Windows; stage in the OS temp area.
const prefix = join(resolve(tmpdir()), 'meewav-package-');
const staging = await mkdtemp(prefix);
const releaseRoot = resolve('release/windows');
const buildId = `build-${new Date().toISOString().replace(/[-:.]/g, '')}-${basename(staging).slice(-6)}`;
// A previous installed or QA executable may still hold its DLLs open. Every
// export is immutable; the latest manifest points to the completed build.
const output = join(releaseRoot, buildId);
const args = [resolve('node_modules/electron-builder/out/cli/cli.js'), '--config', 'electron-builder.config.cjs',
  '--win', `--config.directories.output=${staging}`];
if (!process.argv.includes('--installer')) args.push('--dir');
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(`Empaquetage interrompu. Diagnostic conservé dans ${staging}`);
  process.exitCode = result.status ?? 1;
} else {
  await mkdir(output, { recursive: true });
  for (const name of await readdir(staging)) {
    await cp(join(staging, name), join(output, name), { recursive: true });
  }
  const files = await readdir(output);
  await writeFile(join(releaseRoot, 'latest.json'), JSON.stringify({ buildId,
    executable: join(buildId, 'win-unpacked', 'Meewav Studio.exe'),
    installer: files.find(name => name.endsWith('.exe')) ? join(buildId, files.find(name => name.endsWith('.exe'))) : null,
  }, null, 2) + '\n');
  console.log(`Application Windows prête : ${output}`);
  // Remove only the unique staging directory allocated above, after export.
  const target = resolve(staging);
  if (!target.startsWith(prefix) || target.includes(`${sep}..${sep}`)) throw new Error('Invalid staging path');
  await rm(target, { recursive: true, force: true }).catch(() => console.warn(`Staging temporaire conservé : ${target}`));
}
