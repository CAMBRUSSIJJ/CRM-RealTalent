import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromiumProfileLockFailure, recoverStaleChromiumProfileLock } from './chromium-profile-lock-recovery.mjs'

const sourceRoot='scripts/whatsapp-browser-qr-bridge.mjs'
const sourceHosted='runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/whatsapp-browser-qr-bridge.mjs'
const helperHosted='runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts/chromium-profile-lock-recovery.mjs'

function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-whatsapp-lock-'))
  const dir=path.join(root,'.realtalent-whatsapp-browser','session-test')
  fs.mkdirSync(dir,{recursive:true})
  const credential=path.join(dir,'Default')
  fs.mkdirSync(credential)
  fs.writeFileSync(path.join(credential,'Local State'), 'keep-whatsapp-auth-forever')
  try { fn(dir) } finally { fs.rmSync(root,{recursive:true,force:true}) }
}

test('recognizes real Chromium ProcessSingleton profile-lock failure only', () => {
  assert.equal(chromiumProfileLockFailure(new Error('The profile appears to be in use by another Chromium process (5553) on another computer')),true)
  assert.equal(chromiumProfileLockFailure(new Error('ERROR:chrome/browser/process_singleton_posix.cc(367): Chromium has locked the profile')),true)
  assert.equal(chromiumProfileLockFailure(new Error('WhatsApp timed out')),false)
})

test('foreign pod lock is left untouched without explicit one-replica recovery', () => fixture(dir => {
  fs.symlinkSync('former-container-5553',path.join(dir,'SingletonLock'))
  fs.symlinkSync('temp-socket',path.join(dir,'SingletonSocket'))
  fs.writeFileSync(path.join(dir,'SingletonCookie'),'old')
  const result=recoverStaleChromiumProfileLock(dir,{hostname:'new-container'})
  assert.equal(result.recovered,false)
  assert.equal(result.reason,'foreign_host_not_verified')
  assert.ok(fs.lstatSync(path.join(dir,'SingletonLock')).isSymbolicLink())
  assert.equal(fs.readFileSync(path.join(dir,'Default','Local State'),'utf8'),'keep-whatsapp-auth-forever')
}))

test('explicit singleton recovery clears ONLY three stale lock files, not LocalAuth credentials', () => fixture(dir => {
  fs.symlinkSync('former-container-5553',path.join(dir,'SingletonLock'))
  fs.symlinkSync('temp-socket',path.join(dir,'SingletonSocket'))
  fs.writeFileSync(path.join(dir,'SingletonCookie'),'cookie')
  fs.writeFileSync(path.join(dir,'SingletonOther'), 'keep')
  const result=recoverStaleChromiumProfileLock(dir,{hostname:'new-container',allowForeignHost:true})
  assert.deepEqual(result,{recovered:true,reason:'stale_previous_container'})
  for(const name of ['SingletonLock','SingletonSocket','SingletonCookie'])assert.equal(fs.existsSync(path.join(dir,name)),false)
  assert.equal(fs.readFileSync(path.join(dir,'Default','Local State'),'utf8'),'keep-whatsapp-auth-forever')
  assert.equal(fs.readFileSync(path.join(dir,'SingletonOther'),'utf8'),'keep')
  assert.equal(recoverStaleChromiumProfileLock(dir,{hostname:'new-container',allowForeignHost:true}).reason,'no_lock')
}))

test('live Chromium on this host cannot be unlocked, even in opt-in recovery mode', () => fixture(dir => {
  fs.symlinkSync('same-container-123',path.join(dir,'SingletonLock'))
  const x=recoverStaleChromiumProfileLock(dir,{hostname:'same-container',allowForeignHost:true,isPidAlive:()=>true})
  assert.equal(x.reason,'active_chromium_process')
  assert.ok(fs.lstatSync(path.join(dir,'SingletonLock')).isSymbolicLink())
}))

test('dead local Chromium PID is recoverable', () => fixture(dir => {
  fs.symlinkSync('same-container-98765',path.join(dir,'SingletonLock'))
  const x=recoverStaleChromiumProfileLock(dir,{hostname:'same-container',isPidAlive:()=>false})
  assert.deepEqual(x,{recovered:true,reason:'stale_local_pid'})
  assert.equal(fs.readFileSync(path.join(dir,'Default','Local State'),'utf8'),'keep-whatsapp-auth-forever')
}))

test('unexpected Chromium lock files are never removed', () => fixture(dir => {
  fs.writeFileSync(path.join(dir,'SingletonLock'), 'unknown owner')
  assert.equal(recoverStaleChromiumProfileLock(dir,{allowForeignHost:true}).reason,'unrecognized_lock_type')
  assert.equal(fs.readFileSync(path.join(dir,'SingletonLock'),'utf8'),'unknown owner')
}))

test('refuse to follow a symlinked profile directory', () => fixture(dir => {
  const link=path.join(path.dirname(dir),'forged-dir')
  fs.symlinkSync(dir,link,'dir')
  assert.equal(recoverStaleChromiumProfileLock(link,{allowForeignHost:true}).reason,'unsafe_profile_directory')
}))

test('root/hosted bridge and recovery modules are identical and gated by env', () => {
  const root=fs.readFileSync(sourceRoot,'utf8')
  const hosted=fs.readFileSync(sourceHosted,'utf8')
  assert.equal(root,hosted)
  assert.equal(fs.readFileSync('scripts/chromium-profile-lock-recovery.mjs','utf8'),fs.readFileSync(helperHosted,'utf8'))
  assert.match(hosted,/process\.env\.REALTALENT_WHATSAPP_SINGLETON_RECOVERY === '1'/)
  assert.match(hosted,/if \(lockResult\?\.recovered\) scheduleReconnect/)
  assert.match(hosted,/else if \(!qrExpired && !profileLocked\) scheduleReconnect/)
})
