export function createRealtimeBus({ now = () => new Date().toISOString() } = {}) {
  const clients = new Map()
  let revision = 0

  const setFor = (workspaceId) => {
    const key = String(workspaceId || 'default')
    let set = clients.get(key)
    if (!set) { set = new Set(); clients.set(key, set) }
    return set
  }

  const encode = (type, payload) => {
    const id = String(++revision)
    return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ ...payload, revision, at: now() })}\n\n`
  }

  const send = (res, type, payload) => {
    if (!res || res.destroyed || res.writableEnded) return false
    try { res.write(encode(type, payload)); return true } catch { return false }
  }

  const subscribe = (workspaceId, res) => {
    const key = String(workspaceId || 'default')
    const set = setFor(key)
    set.add(res)
    send(res, 'realtime.ready', { workspaceId: key })
    return () => {
      set.delete(res)
      if (!set.size) clients.delete(key)
    }
  }

  const publish = (workspaceId, type = 'communications.changed', payload = {}) => {
    const key = String(workspaceId || 'default')
    const set = clients.get(key)
    if (!set?.size) return 0
    let delivered = 0
    for (const res of [...set]) {
      if (send(res, type, { workspaceId: key, ...payload })) delivered += 1
      else set.delete(res)
    }
    if (!set.size) clients.delete(key)
    return delivered
  }

  const publishAll = (type = 'communications.changed', payload = {}) => {
    let delivered = 0
    for (const workspaceId of [...clients.keys()]) delivered += publish(workspaceId, type, payload)
    return delivered
  }

  const heartbeat = () => {
    for (const [workspaceId, set] of clients) {
      for (const res of [...set]) {
        if (!res || res.destroyed || res.writableEnded) { set.delete(res); continue }
        try { res.write(`: heartbeat ${now()}\n\n`) } catch { set.delete(res) }
      }
      if (!set.size) clients.delete(workspaceId)
    }
  }

  const stats = () => ({ workspaces: clients.size, subscribers: [...clients.values()].reduce((n, set) => n + set.size, 0), revision })
  const closeAll = () => {
    for (const set of clients.values()) for (const res of set) { try { res.end() } catch {} }
    clients.clear()
  }

  return { subscribe, publish, publishAll, heartbeat, stats, closeAll }
}
