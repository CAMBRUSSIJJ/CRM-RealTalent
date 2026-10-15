#!/usr/bin/env node
import { createRealtimeBus } from './communications-realtime-bus.mjs'
const writes=[]
const fake={destroyed:false,writableEnded:false,write(chunk){writes.push(String(chunk));return true},end(){this.writableEnded=true}}
const bus=createRealtimeBus({now:()=> '2026-10-02T12:00:00.000Z'})
const checks=[]; const ok=(n,v)=>{checks.push([n,Boolean(v)]);console.log(`${v?'OK  ':'FAIL'} ${n}`)}
const unsub=bus.subscribe('ws-1',fake)
ok('subscribe envia ready',writes.some(x=>x.includes('event: realtime.ready')))
const before=writes.length
const delivered=bus.publish('ws-1','communications.changed',{reason:'message'})
ok('publish entrega ao workspace',delivered===1&&writes.length===before+1)
ok('payload contém reason',writes.at(-1).includes('"reason":"message"'))
ok('stats contam subscriber',bus.stats().subscribers===1&&bus.stats().workspaces===1)
bus.heartbeat(); ok('heartbeat enviado',writes.some(x=>x.startsWith(': heartbeat')))
unsub(); ok('unsubscribe remove subscriber',bus.stats().subscribers===0)
bus.publish('ws-1','communications.changed',{}); ok('não entrega após unsubscribe',bus.stats().subscribers===0)
console.log(`\nV101.8.4-H12 realtime bus smoke: ${checks.filter(([,v])=>v).length}/${checks.length}`)
if(checks.some(([,v])=>!v))process.exit(1)
