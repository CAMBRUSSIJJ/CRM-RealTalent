import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const sync=read('src/services/prospecting-workspace.ts')
const page=read('src/features/prospecting/prospecting-page.tsx')
const syncMethod=sync.slice(sync.indexOf('const syncRemote = '),sync.indexOf('const uniqueById ='))
assert.ok(syncMethod.includes('upsert('))
assert.doesNotMatch(syncMethod,/\.delete\(/,'a snapshot sync may never issue a DELETE')
assert.match(sync,/deleteProspectingRecords\(workspaceId: string, selectedIds: string\[\]\)/)
assert.match(sync,/\.in\('id', ids\)\.select\('id'\)/)
assert.match(page,/cacheProspectingStateLocally\(workspaceId, scopedRemote\)/)
assert.match(page,/await deleteProspectingRecords\(workspaceId, allowedIds\)/)
assert.match(sync,/JSON\.stringify\(before\.get\(item\.id\)\)/)
console.log('RC1 H1: explicit-scoped deletes, change-only upserts, safe remote hydration OK')
