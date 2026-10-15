const DATABASE = 'realtalent-crm-media-v1'
const STORE = 'call-recordings'

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador não oferece armazenamento local de áudio.')); return }
  const request = indexedDB.open(DATABASE, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o armazenamento de áudio.'))
})

const transaction = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE, mode)
    const request = operation(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Falha no armazenamento de áudio.'))
    tx.oncomplete = () => database.close()
    tx.onerror = () => { database.close(); reject(tx.error ?? new Error('Falha no armazenamento de áudio.')) }
  })
}

export const saveLocalRecording = (callId: string, blob: Blob) => transaction('readwrite', (store) => store.put(blob, callId))
export const readLocalRecording = (callId: string) => transaction<Blob | undefined>('readonly', (store) => store.get(callId))
export const deleteLocalRecording = (callId: string) => transaction('readwrite', (store) => store.delete(callId))


const CHUNK_SEPARATOR = '::chunk::'
const chunkKey = (recordingKey: string, index: number) => `${recordingKey}${CHUNK_SEPARATOR}${String(index).padStart(8, '0')}`

export const saveLocalRecordingChunk = (recordingKey: string, index: number, blob: Blob) =>
  transaction('readwrite', (store) => store.put(blob, chunkKey(recordingKey, index)))

export const readLocalRecordingChunks = async (recordingKey: string): Promise<Blob[]> => {
  const database = await openDatabase()
  return new Promise<Blob[]>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const prefix = `${recordingKey}${CHUNK_SEPARATOR}`
    const chunks: Array<{ key: string; blob: Blob }> = []
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const key = String(cursor.key)
      if (key.startsWith(prefix) && cursor.value instanceof Blob) chunks.push({ key, blob: cursor.value })
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('Falha ao recuperar chunks de áudio.'))
    tx.oncomplete = () => { database.close(); resolve(chunks.sort((a, b) => a.key.localeCompare(b.key)).map((item) => item.blob)) }
    tx.onerror = () => { database.close(); reject(tx.error ?? new Error('Falha ao recuperar chunks de áudio.')) }
  })
}

export const deleteLocalRecordingChunks = async (recordingKey: string): Promise<void> => {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const prefix = `${recordingKey}${CHUNK_SEPARATOR}`
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (String(cursor.key).startsWith(prefix)) cursor.delete()
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('Falha ao remover chunks de áudio.'))
    tx.oncomplete = () => { database.close(); resolve() }
    tx.onerror = () => { database.close(); reject(tx.error ?? new Error('Falha ao remover chunks de áudio.')) }
  })
}
