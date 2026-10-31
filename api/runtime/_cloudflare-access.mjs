const clean=(value)=>String(value||'').trim()

/**
 * Only the Vercel server attaches Cloudflare Access credentials.
 * Browser code must never access these keys or a runtime secret.
 * If only one credential is present, fail closed instead of silently
 * bypassing Access on the upstream route.
 */
export function cloudflareAgentAccessHeaders(env=process.env){
  const id=clean(env.REALTALENT_CF_ACCESS_CLIENT_ID)
  const secret=clean(env.REALTALENT_CF_ACCESS_CLIENT_SECRET)
  if(!id&&!secret)return {}
  if(!id||!secret)throw new Error('cloudflare_access_not_configured')
  return {'CF-Access-Client-Id':id,'CF-Access-Client-Secret':secret}
}
