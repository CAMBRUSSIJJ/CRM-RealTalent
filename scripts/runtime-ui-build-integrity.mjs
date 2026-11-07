import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Hashes the actual frontend source tree, not historical release strings.
// Release ZIPs have no git metadata, so this also works outside git clones.
const TRACKED_ROOTS = ['src', 'public']
const TRACKED_FILES = ['index.html', 'package.json', 'package-lock.json',
  'vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs',
  'tsconfig.json', 'tsconfig.typecheck.json']
const STAMP_PATH = 'dist/rt-ui-build.json'
const BUILD_SCHEMA = 'realtalent-ui-source-v1'

function includeFiles(root, relative, output) {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) return
  const stat = fs.lstatSync(absolute)
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute).sort()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
      includeFiles(root, path.join(relative, entry), output)
    }
  } else if (stat.isFile()) output.push(relative)
}

export function computeUiSourceFingerprint(root) {
  const hash = crypto.createHash('sha256').update(BUILD_SCHEMA)
  const files = []
  for (const directory of TRACKED_ROOTS) includeFiles(root, directory, files)
  for (const file of TRACKED_FILES) includeFiles(root, file, files)
  // Vite can embed VITE_* variables during compilation. Track changes without
  // putting the plaintext of .env files into the public build manifest.
  for (const envName of ['.env.local', '.env.production', '.env.production.local']) {
    const p = path.join(root, envName)
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const stat = fs.statSync(p)
      hash.update('env:' + envName + ':' + stat.size + ':' + stat.mtimeMs + '\n')
    }
  }
  for (const relative of [...new Set(files)].sort()) {
    hash.update(relative.replace(/\\/g, '/') + '\0')
    hash.update(fs.readFileSync(path.join(root, relative)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function inspectUiBuild(root) {
  const sourceFingerprint = computeUiSourceFingerprint(root)
  let stamp = null
  try {
    stamp = JSON.parse(fs.readFileSync(path.join(root, STAMP_PATH), 'utf8'))
  } catch { /* build absent/old/invalid */ }
  return {
    sourceFingerprint,
    builtFingerprint: stamp?.sourceFingerprint ?? null,
    builtAt: stamp?.builtAt ?? null,
    fresh: stamp?.schema === BUILD_SCHEMA && stamp.sourceFingerprint === sourceFingerprint,
  }
}

export function writeUiBuildStamp(root) {
  const sourceFingerprint = computeUiSourceFingerprint(root)
  const dist = path.join(root, 'dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('A compilação deve existir antes do carimbo de integridade.')
  const info = {
    schema: BUILD_SCHEMA,
    sourceFingerprint,
    builtAt: new Date().toISOString(),
    communicationsUi: 'waha-default-local-v102',
    callingFlow: 'realtalent-flow-v20261107',
  }
  fs.writeFileSync(path.join(dist, 'rt-ui-build.json'), JSON.stringify(info, null, 2) + '\n')
  return info
}
