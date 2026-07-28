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
