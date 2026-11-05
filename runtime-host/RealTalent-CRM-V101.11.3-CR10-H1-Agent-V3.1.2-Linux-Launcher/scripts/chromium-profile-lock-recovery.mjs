import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Chrome's ProcessSingleton persists three bookkeeping files inside
// whatsapp-web.js LocalAuth's userDataDir. They are NOT WhatsApp credentials.
export const chromiumProfileLockFailure = error => /process_singleton_posix|profile appears to be in use|chromium has locked the profile|singletonlock/i
  .test(String(error?.message || error || ''))

function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH' // EPERM and unknown results are treated as alive.
  }
}

/**
 * Only recover a verified stale Chromium ProcessSingleton. Do not delete
 * LocalAuth data, IndexedDB, cookies, history, or any WhatsApp session.
 *
 * allowForeignHost must be enabled ONLY for single-replica runtimes with
 * no overlapping deployment instances. Other machines cannot be probed
 * via process.kill(pid,0); conservatively refuse unless explicitly allowed.
 */
export function recoverStaleChromiumProfileLock(
  profileDirectory, { allowForeignHost = false, hostname = os.hostname(), isPidAlive = pidAlive } = {},
) {
  const dir = path.resolve(String(profileDirectory || ''))
  const lockFile = path.join(dir, 'SingletonLock')
  let owner
  let lockStat
  try {
    const parent = fs.lstatSync(dir)
    if (!parent.isDirectory() || parent.isSymbolicLink())
      return { recovered: false, reason: 'unsafe_profile_directory' }
    lockStat = fs.lstatSync(lockFile)
    if (!lockStat.isSymbolicLink())
      return { recovered: false, reason: 'unrecognized_lock_type' }
    owner = fs.readlinkSync(lockFile)
  } catch (error) {
    return { recovered: false, reason: error?.code === 'ENOENT' ? 'no_lock' : 'lock_unreadable' }
  }

  // Chromium lock target: <host name>-<pid>. Never guess about ownership.
  const match = /^(.+)-([1-9][0-9]{0,9})$/.exec(owner)
  if (!match) return { recovered: false, reason: 'unrecognized_lock_owner' }
  const [, lockHost, pidText] = match
  const ownerPid = Number(pidText)
  if (!Number.isSafeInteger(ownerPid))
    return { recovered: false, reason: 'unrecognized_lock_owner' }
  if (lockHost !== hostname && !allowForeignHost)
    return { recovered: false, reason: 'foreign_host_not_verified' }
  if (lockHost === hostname && isPidAlive(ownerPid))
    return { recovered: false, reason: 'active_chromium_process' }

  // Abort if the lock changed while we verified the owner.
  try {
    const current = fs.lstatSync(lockFile)
    if (!current.isSymbolicLink() || current.ino !== lockStat.ino || fs.readlinkSync(lockFile) !== owner)
      return { recovered: false, reason: 'lock_changed' }
    fs.unlinkSync(lockFile)
    for (const name of ['SingletonCookie', 'SingletonSocket']) {
      const file = path.join(dir, name)
      try {
        const stat = fs.lstatSync(file)
        if (stat.isSymbolicLink() || stat.isFile()) fs.unlinkSync(file)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    return { recovered: true, reason: lockHost === hostname ? 'stale_local_pid' : 'stale_previous_container' }
  } catch (error) {
    return { recovered: false, reason: error?.code === 'ENOENT' ? 'lock_changed' : 'cleanup_failed' }
  }
}
