import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
export const COMMUNICATIONS_RUNTIME_DIR = path.join(ROOT, 'runtime', 'communications')
export const COMMUNICATIONS_RUNTIME_PACKAGE = path.join(COMMUNICATIONS_RUNTIME_DIR, 'package.json')
const runtimeRequire = createRequire(COMMUNICATIONS_RUNTIME_PACKAGE)

export const COMMUNICATIONS_RUNTIME_DEPENDENCIES = Object.freeze({
  '@whiskeysockets/baileys': '7.0.0-rc14',
  qrcode: '1.5.4',
  'whatsapp-web.js': '1.34.7',
})

export function resolveCommunicationsPackage(name) {
  return runtimeRequire.resolve(name)
}

export function requireCommunicationsPackage(name) {
  return runtimeRequire(name)
}

export async function importCommunicationsPackage(name) {
  return import(pathToFileURL(resolveCommunicationsPackage(name)).href)
}

export function communicationsRuntimeDependenciesPresent() {
  try {
    for (const name of Object.keys(COMMUNICATIONS_RUNTIME_DEPENDENCIES)) resolveCommunicationsPackage(name)
    return true
  } catch {
    return false
  }
}
