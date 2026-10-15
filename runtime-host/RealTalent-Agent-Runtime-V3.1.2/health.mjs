const url = `http://${process.env.REALTALENT_AGENT_HOST || '127.0.0.1'}:${process.env.REALTALENT_AGENT_PORT || '8791'}/health`
try {
  const response = await fetch(url)
  console.log(JSON.stringify(await response.json(), null, 2))
  process.exit(response.ok ? 0 : 1)
} catch (error) {
  console.error(`Agent Runtime indisponível: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
