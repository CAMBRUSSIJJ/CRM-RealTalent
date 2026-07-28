import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root=process.cwd()
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'realtalent-backup-test-'))
const bin=path.join(temp,'bin'); const backups=path.join(temp,'backups')
fs.mkdirSync(bin); fs.mkdirSync(backups)
const dump=path.join(bin,'pg_dump')
const restore=path.join(bin,'pg_restore')
fs.writeFileSync(dump,`#!/bin/sh
FILE=''
PREV=''
for ARG in "$@"; do if [ "$PREV" = "--file" ]; then FILE="$ARG"; fi; PREV="$ARG"; done
[ -n "$FILE" ] || exit 2
printf 'REALTALENT_TEST_BACKUP' > "$FILE"
`)
fs.writeFileSync(restore,`#!/bin/sh
exit 0
`)
fs.chmodSync(dump,0o755); fs.chmodSync(restore,0o755)
const env={...process.env,PATH:`${bin}:${process.env.PATH}`,SUPABASE_DB_URL:'postgresql://test:test@localhost:5432/staging',BACKUP_DIR:backups}
const backup=spawnSync(process.execPath,['scripts/backup_database.mjs'],{cwd:root,env,encoding:'utf8'})
if(backup.status!==0) throw new Error(`Dry-run de backup falhou: ${backup.stderr || backup.stdout}`)
const file=fs.readdirSync(backups).find(name=>name.endsWith('.dump'))
if(!file) throw new Error('Backup de teste não foi criado.')
const restoreRun=spawnSync(process.execPath,['scripts/restore_database.mjs'],{cwd:root,env:{...env,RESTORE_DATABASE_URL:'postgresql://test:test@localhost:5432/restore_staging',BACKUP_FILE:path.join(backups,file)},encoding:'utf8'})
if(restoreRun.status!==0) throw new Error(`Dry-run de restauração falhou: ${restoreRun.stderr || restoreRun.stdout}`)
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const label=`V${pkg.version.replace(/\.0$/,'').replaceAll('.','-')}`
const report={version:pkg.version,generatedAt:new Date().toISOString(),passed:true,backupFile:file,checksumManifest:fs.existsSync(path.join(backups,`${file}.json`)),restoreProtected:true}
fs.writeFileSync(path.join(root,`BACKUP-RESTORE-DRY-RUN-${label}.json`),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
fs.rmSync(temp,{recursive:true,force:true})
