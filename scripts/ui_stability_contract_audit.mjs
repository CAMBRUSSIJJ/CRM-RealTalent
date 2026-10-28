import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')
const a=read('src/app/overlay-manager.ts'),m=read('src/components/ui/modal.tsx'),d=read('src/components/ui/drawer.tsx'),n=read('src/components/layout/mobile-nav.tsx'),t=read('src/components/layout/topbar.tsx'),q=read('src/features/tasks/tasks-page.tsx'),s=read('src/styles/ui-stability.css'),boot=read('src/main.tsx')
const cases=[
['shared stacking',a.includes('syncOverlayLayers')&&a.includes('13200 + 10 * rank')],
['modal stack',m.includes('isTopOverlay(')&&m.includes('data-overlay-id=')&&!m.includes('modalStack')],
['drawer stack',d.includes('isTopOverlay(')&&d.includes('rt-drawer-layer')],
['mobile settings',n.includes('secondaryItems.length > 0 || canOpenSettings')],
['mobile Escape',n.includes("event.key === 'Escape'")],
['hotkeys',t.includes('activeOverlayCount() > 0')],
['Kanban drag/drop',q.includes("setData('application/x-realtalent-task-id'")&&q.includes('onDrop={(event)=>moveTask(event,column.status)}')],
['CSS imported',boot.includes("import './styles/ui-stability.css'")],
['responsive rules',s.includes('max-width:760px')&&s.includes('max-width:520px')]]
for(const [name,ok] of cases)console.log((ok?'PASS':'FAIL')+' '+name)
assert(cases.every(x=>x[1]),'UI stability static contract failed')
console.log(cases.length+'/'+cases.length+' PASS — static contracts, NOT browser E2E.')
