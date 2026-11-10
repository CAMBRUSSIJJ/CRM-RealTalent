import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {pinnedHttpsV60} from './crm-web-reader-v60.mjs'

const html='<html><body><p>Conteúdo público da instituição de ensino.</p></body></html>'
async function simulateHttpsLookup({all=true,addresses=[{address:'1.1.1.1',family:4}]}={}){
  let called=false,got=null
  const fakeRequest=(url,options,onResponse)=>{
    const req=new EventEmitter()
    req.destroy=e=>req.emit('error',e)
    queueMicrotask(()=>{
      options.lookup('www.furg.br',{all},(error,result,family)=>{
        called=true
        got={error,result,family}
        if(error){req.emit('error',error);return}
        const response=new EventEmitter()
        response.statusCode=200
        response.headers={'content-type':'text/html'}
        response.resume=()=>{}
        onResponse(response)
        queueMicrotask(()=>{
          response.emit('data',Buffer.from(html))
          response.emit('end')
        })
      })
    })
    return req
  }
  try{
    const result=await pinnedHttpsV60(new URL('https://www.furg.br'),{
      resolve:async()=>addresses,request:fakeRequest
    })
    return {result,called,got}
  }catch(error){
    return {error,called,got}
  }
}

test('Node 22 all:true returns an array of pinned public addresses',async()=>{
  const value=await simulateHttpsLookup()
  assert.equal(value.called,true)
  assert.equal(value.error,undefined)
  assert.deepEqual(value.got.result,[{address:'1.1.1.1',family:4}])
  assert.equal(value.got.family,undefined)
  assert.equal(value.result.html,html)
})

test('Node 22 all:false preserves address and family callback signature',async()=>{
  const value=await simulateHttpsLookup({all:false})
  assert.equal(value.error,undefined)
  assert.equal(value.got.result,'1.1.1.1')
  assert.equal(value.got.family,4)
  assert.equal(value.result.html,html)
})

test('private DNS records never reach the HTTPS request, even with all:true',async()=>{
  const value=await simulateHttpsLookup({all:true,addresses:[
    {address:'127.0.0.1',family:4},{address:'192.168.1.10',family:4}
  ]})
  assert.equal(value.called,true)
  assert.equal(value.got.error.message,'private_address_blocked')
  assert.equal(value.error.message,'private_address_blocked')
})

test('mixed DNS results include only the validated public IP',async()=>{
  const value=await simulateHttpsLookup({all:true,addresses:[
    {address:'10.0.0.1',family:4},{address:'2606:4700:4700::1111',family:6},
    {address:'127.0.0.1',family:4}
  ]})
  assert.equal(value.error,undefined)
  assert.deepEqual(value.got.result,[{address:'2606:4700:4700::1111',family:6}])
  assert.equal(value.result.html,html)
})
