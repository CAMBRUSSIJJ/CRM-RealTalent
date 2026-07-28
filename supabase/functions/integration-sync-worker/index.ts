const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-integration-worker-secret' }
Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response(null, { status: 204, headers: cors })
  : new Response(JSON.stringify({ error: 'Worker genérico aposentado na V100.45. Use o worker específico do provedor.' }), { status: 410, headers: { ...cors, 'content-type': 'application/json' } }))
