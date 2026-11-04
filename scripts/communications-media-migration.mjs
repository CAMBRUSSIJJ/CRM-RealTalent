import fs from 'node:fs'
import path from 'node:path'

// Restore only files referenced by the local CRM store. Never copy unrelated
// WhatsApp media across installations or overwrite the current user's files.
export function restoreReferencedCommunicationMedia(root, candidates = []) {
  const storeFile = path.join(root, '.realtalent-communications-store.json')
  if (!fs.existsSync(storeFile)) return { restored: 0, missing: 0 }
  let snapshot
  try { snapshot = JSON.parse(fs.readFileSync(storeFile, 'utf8')) } catch { return { restored: 0, missing: 0 } }
  const ids = new Set((Array.isArray(snapshot.events) ? snapshot.events : [])
    .map(item => item?.metadata?.attachment?.id)
    .filter(id => typeof id === 'string' && /^[0-9a-f-]{16,64}$/i.test(id)))
  if (!ids.size) return { restored: 0, missing: 0 }
  const dest = path.join(root, '.realtalent-communications-media')
  let restored = 0
  for (const candidate of new Set(candidates)) {
    if (path.resolve(candidate) === path.resolve(root)) continue
    const src = path.join(candidate, '.realtalent-communications-media')
    if (!fs.existsSync(src)) continue
    let entries = []
    try { entries = fs.readdirSync(src, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const index = entry.name.indexOf('--')
      const id = index > 0 ? entry.name.slice(0, index) : ''
      if (!ids.has(id)) continue
      const target = path.join(dest, entry.name)
      if (fs.existsSync(target)) continue
      try {
        fs.mkdirSync(dest, { recursive: true, mode: 0o700 })
        fs.copyFileSync(path.join(src, entry.name), target, fs.constants.COPYFILE_EXCL)
        fs.chmodSync(target, 0o600)
        restored++
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
      }
    }
  }
  let missing = 0
  for (const id of ids) {
    try {
      if (!fs.readdirSync(dest).some(name => name.startsWith(`${id}--`))) missing++
    } catch { missing++ }
  }
  return { restored, missing }
}
