import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = path.join(root, 'quality', 'typecheck-baseline.json')
const tscPath = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const result = spawnSync(
  process.execPath,
  [tscPath, '--noEmit', '--pretty', 'false'],
  { cwd: root, encoding: 'utf8' },
)

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const diagnosticPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm
const diagnostics = [...output.matchAll(diagnosticPattern)].map((match) => ({
  file: match[1].replaceAll('\\', '/'),
  line: Number(match[2]),
  column: Number(match[3]),
  code: match[4],
  message: match[5],
}))

if (result.status === 0) {
  console.log('TypeScript: aucun diagnostic.')
  process.exit(0)
}

if (diagnostics.length === 0) {
  process.stderr.write(output)
  console.error('TypeScript a échoué sans diagnostic analysable.')
  process.exit(result.status ?? 1)
}

const current = new Map()
for (const diagnostic of diagnostics) {
  const key = `${diagnostic.file}::${diagnostic.code}`
  current.set(key, (current.get(key) ?? 0) + 1)

  if (process.env.GITHUB_ACTIONS) {
    console.log(
      `::warning file=${diagnostic.file},line=${diagnostic.line},col=${diagnostic.column},title=${diagnostic.code} hérité::${diagnostic.message}`,
    )
  } else {
    console.warn(
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code} (hérité) ${diagnostic.message}`,
    )
  }
}

const regressions = []
for (const [key, count] of current) {
  const separator = key.lastIndexOf('::')
  const file = key.slice(0, separator)
  const code = key.slice(separator + 2)
  const allowed = baseline[file]?.[code] ?? 0

  if (count > allowed) {
    regressions.push(`${file} ${code}: ${count} diagnostic(s), seuil hérité ${allowed}`)
  }
}

if (regressions.length > 0) {
  console.error('\nRégression TypeScript détectée :')
  for (const regression of regressions) console.error(`- ${regression}`)
  process.exit(1)
}

console.log(
  `\nTypeScript: ${diagnostics.length} diagnostic(s) hérité(s), aucune nouvelle erreur.`,
)
