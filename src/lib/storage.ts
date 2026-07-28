const memory = new Map<string, string>()
let lastStorageError: string | null = null
let persistentAvailable: boolean | null = null

const browserStorage = (): Storage | null => {
  if (persistentAvailable === false) return null
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const storage = window.localStorage
    const probe = '__crm_v100_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    persistentAvailable = true
    lastStorageError = null
    return storage
  } catch (error) {
    persistentAvailable = false
    lastStorageError = error instanceof Error ? error.message : 'Armazenamento persistente indisponível.'
    return null
  }
}

export interface StorageDiagnostics {
  persistent: boolean
  fallbackActive: boolean
  estimatedBytes: number
  lastError: string | null
}

const estimateBytes = (storage: Storage | null) => {
  if (!storage) return [...memory.entries()].reduce((total, [key, value]) => total + ((key.length + value.length) * 2), 0)
  let total = 0
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key) continue
      total += (key.length + (storage.getItem(key)?.length ?? 0)) * 2
    }
  } catch { return 0 }
  return total
}

export const safeStorage = {
  getItem(key: string): string | null {
    // A memória é a fonte mais recente quando a persistência falha (quota,
    // modo privado ou bloqueio do navegador). Ler o localStorage primeiro faria
    // a interface voltar silenciosamente para um valor antigo.
    if (memory.has(key)) return memory.get(key) ?? null
    const storage = browserStorage()
    if (storage) {
      try { return storage.getItem(key) }
      catch (error) { lastStorageError = error instanceof Error ? error.message : 'Falha ao ler o armazenamento.' }
    }
    return null
  },
  setItem(key: string, value: string): void {
    const storage = browserStorage()
    if (storage) {
      try {
        if (storage.getItem(key) === value) {
          memory.delete(key)
          lastStorageError = null
          return
        }
        storage.setItem(key, value)
        memory.delete(key)
        lastStorageError = null
        return
      } catch (error) {
        lastStorageError = error instanceof Error ? error.message : 'Falha ao salvar no armazenamento persistente.'
      }
    }
    memory.set(key, value)
  },
  removeItem(key: string): void {
    const storage = browserStorage()
    if (storage) {
      try { storage.removeItem(key) }
      catch (error) { lastStorageError = error instanceof Error ? error.message : 'Falha ao remover do armazenamento.' }
    }
    memory.delete(key)
  },
  clear(): void {
    const storage = browserStorage()
    if (storage) {
      try { storage.clear() }
      catch (error) { lastStorageError = error instanceof Error ? error.message : 'Falha ao limpar o armazenamento.' }
    }
    memory.clear()
  },
  diagnostics(): StorageDiagnostics {
    const storage = browserStorage()
    return {
      persistent: Boolean(storage),
      fallbackActive: !storage || memory.size > 0,
      estimatedBytes: estimateBytes(storage),
      lastError: lastStorageError,
    }
  },
}
