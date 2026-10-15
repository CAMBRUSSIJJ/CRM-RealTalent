import { recordPageRegistry } from './record-page-registry'

export const inspectRecordPages = () => {
  const definitions = recordPageRegistry.list()
  return {
    version: '101.9.2' as const,
    definitionCount: definitions.length,
    surfaces: [...new Set(definitions.map((definition) => definition.surface))],
    definitions,
  }
}

declare global {
  interface Window {
    __REALTALENT_RECORD_PAGES__?: {
      version: '101.9.2'
      inspect: () => ReturnType<typeof inspectRecordPages>
      get: (id: string) => ReturnType<typeof recordPageRegistry.get>
    }
  }
}

export const installRecordPageInspector = () => {
  if (typeof window === 'undefined') return
  window.__REALTALENT_RECORD_PAGES__ = {
    version: '101.9.2',
    inspect: inspectRecordPages,
    get: (id) => recordPageRegistry.get(id),
  }
}
