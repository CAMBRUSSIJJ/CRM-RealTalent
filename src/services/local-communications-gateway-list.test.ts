import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGatewayAccounts, loadGatewayCommunicationEvents } from './local-communications-gateway'

describe('gateway sem a lista na resposta', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('devolve lista vazia quando o endereço responde 200 sem JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await expect(loadGatewayCommunicationEvents('w1')).resolves.toEqual([])
    await expect(loadGatewayAccounts('w1')).resolves.toEqual([])
  })
})
