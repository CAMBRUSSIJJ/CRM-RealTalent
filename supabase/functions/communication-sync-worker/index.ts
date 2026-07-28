const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-integration-worker-secret' }
Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response(null, { status: 204, headers: cors })
  : new Response(JSON.stringify({ error: 'Worker misto aposentado na V100.45. Use os workers Google ou Microsoft.' }), { status: 410, headers: { ...cors, 'content-type': 'application/json' } }))
