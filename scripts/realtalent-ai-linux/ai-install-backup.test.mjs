import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'

const path='scripts/realtalent-ai-linux/start-linux.sh'
const script=readFileSync(path,'utf8')

test('Linux setup is syntactically valid',()=>{
  execFileSync('bash',['-n',path])
})
test('modified local Agent checkout is moved to a private dated backup before clone',()=>{
  assert.match(script,/git -C "\$ROOT\/repo" status --porcelain/)
  assert.match(script,/BACKUP="\$ROOT\/repo-backup-/)
  assert.match(script,/mv -- "\$ROOT\/repo" "\$BACKUP"/)
  assert.match(script,/git clone --depth 1 --single-branch --branch "\$REPO_BRANCH"/)
  const move=script.indexOf('mv -- "$ROOT/repo" "$BACKUP"')
  const reclone=script.indexOf('if ! git clone --depth 1 --single-branch')
  assert.ok(move>0&&reclone>move,'back up first, reclone only after preserving the old installation')
})
test('failed clone restores the old directory rather than removing it',()=>{
  assert.match(script,/Falha no download do repositório\. Restaurando/)
  assert.match(script,/mv -- "\$BACKUP" "\$ROOT\/repo"/)
  assert.doesNotMatch(script,/git reset --hard|git clean -fd|rm -rf "\$ROOT\/repo"/)
})
