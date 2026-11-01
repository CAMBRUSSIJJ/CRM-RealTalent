import { proxyRuntime } from './runtime/_proxy.mjs'

function runtimePath(req){
  const url=new URL(String(req.url||'/'),'http://127.0.0.1')
  const queryPath=String(req.query?.__rt_path ?? url.searchParams.get('__rt_path') ?? req.query?.path ?? url.searchParams.get('path') ?? '').replace(/^\/+/, '')
  // Vercel's route matcher may also expose :path* as a query parameter.
  // Do not pass its internal routing argument to an Agent with exact routes.
  url.searchParams.delete('__rt_path')
  if(url.searchParams.get('path')===queryPath)url.searchParams.delete('path')
  const search=url.searchParams.toString()
  return `/${queryPath}${search?`?${search}`:''}`
}

export default function handler(req,res){
  req.__realtalentRuntimePath=runtimePath(req)
  return proxyRuntime(req,res,'agent')
}
