import fs from 'node:fs'
import path from 'node:path'

/**
 * A port can be reclaimed only from a known RealTalent Vite UI process.
 * The current checkout can have an arbitrary folder name; legacy release
 * directories remain supported to preserve safe cleanup of old previews.
 * This must never match a random node service or a third-party Vite app.
 */
export function isTrustedRealTalentViteProcess({ cwd, appRoot, cmdline }) {
  if (!cwd || !appRoot || !cmdline) return false
  try {
    const sameCheckout = fs.realpathSync(cwd) === fs.realpathSync(appRoot)
    const knownLegacyCheckout = /^RealTalent-CRM-V/i.test(path.basename(cwd))
    const viteProcess = /(?:^|[\s/])vite(?:\.js)?\s+(?:preview|--host)|node_modules\/vite\/bin\/vite\.js/.test(cmdline)
    return (sameCheckout || knownLegacyCheckout) && viteProcess
  } catch { return false }
}
