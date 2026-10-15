class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() {
    for (const key of this.values.keys()) delete (this as unknown as Record<string, unknown>)[key]
    this.values.clear()
  }
  getItem(key: string) { return this.values.get(String(key)) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) {
    const normalized = String(key)
    this.values.delete(normalized)
    delete (this as unknown as Record<string, unknown>)[normalized]
  }
  setItem(key: string, value: string) {
    const normalized = String(key)
    const serialized = String(value)
    this.values.set(normalized, serialized)
    Object.defineProperty(this, normalized, { configurable: true, enumerable: true, writable: true, value: serialized })
  }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
