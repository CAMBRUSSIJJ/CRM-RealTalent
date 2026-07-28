import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { fileURLToPath } from 'node:url'
import ts from '../vendor/typescript/typescript.cjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'src')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})
const files = walk(srcRoot).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')).sort()
const idOf = (f) => path.relative(root, f).split(path.sep).join('/')
const modules = Object.create(null)
const diagnostics = []
const envValues = {
  VITE_APP_NAME: 'RealTalent CRM', VITE_DATA_MODE: 'local', VITE_SUPABASE_URL: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_RELEASE_CHANNEL: 'test', VITE_COMMIT_SHA: 'test',
}
for (const file of files) {
  const id = idOf(file)
  let source = fs.readFileSync(file, 'utf8')
  source = source.replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, '')
  source = source.replace(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g, (_, key) => JSON.stringify(envValues[key] ?? ''))
  const out = ts.transpileModule(source, {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10, jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true, allowSyntheticDefaultImports: true, isolatedModules: true,
    },
  })
  for (const d of out.diagnostics || []) if (d.category === ts.DiagnosticCategory.Error) diagnostics.push(`${id}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
  modules[id] = out.outputText
}
if (diagnostics.length) throw new Error(diagnostics.join('\n'))

class MemoryStorage {
  #values = new Map()
  get length() { return this.#values.size }
  clear() { this.#values.clear() }
  getItem(k) { return this.#values.has(String(k)) ? this.#values.get(String(k)) : null }
  key(i) { return [...this.#values.keys()][i] ?? null }
  removeItem(k) { this.#values.delete(String(k)) }
  setItem(k, v) { this.#values.set(String(k), String(v)) }
}
globalThis.localStorage = new MemoryStorage()
globalThis.sessionStorage = new MemoryStorage()
globalThis.window = globalThis
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'RealTalent homologation runner' }, configurable: true })

const ASYM = Symbol('asymmetric')
const subsetMatch = (actual, expected) => {
  if (expected && expected[ASYM]) return expected.test(actual)
  if (expected instanceof RegExp) return typeof actual === 'string' && expected.test(actual)
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false
    if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((v, i) => subsetMatch(actual[i], v))
    return Object.entries(expected).every(([k, v]) => subsetMatch(actual[k], v))
  }
  return Object.is(actual, expected)
}
const equal = (a, b) => b && b[ASYM] ? b.test(a) : util.isDeepStrictEqual(a, b)
const format = (v) => util.inspect(v, { depth: 6, colors: false })
const fail = (message) => { throw new Error(message) }
const throwsMatch = async (value, expected) => {
  let error
  try {
    if (typeof value === 'function') value()
    else await value
  } catch (e) { error = e }
  if (!error) return { ok: false, detail: 'não lançou erro' }
  const message = String(error?.message ?? error)
  if (expected === undefined) return { ok: true }
  if (expected instanceof RegExp) return { ok: expected.test(message), detail: message }
  if (typeof expected === 'string') return { ok: message.includes(expected), detail: message }
  if (typeof expected === 'function') return { ok: error instanceof expected, detail: message }
  return { ok: false, detail: message }
}
function matchers(actual, negated = false, promiseMode = null) {
  const assert = (condition, message) => {
    const pass = negated ? !condition : condition
    if (!pass) fail(`${negated ? 'Negação falhou: ' : ''}${message}`)
  }
  const api = {
    get not() { return matchers(actual, !negated, promiseMode) },
    get rejects() { return matchers(actual, negated, 'rejects') },
    toBe(expected) { assert(Object.is(actual, expected), `esperado ${format(expected)}, recebido ${format(actual)}`) },
    toEqual(expected) { assert(equal(actual, expected), `esperado igualdade com ${format(expected)}, recebido ${format(actual)}`) },
    toMatchObject(expected) { assert(subsetMatch(actual, expected), `esperado objeto compatível com ${format(expected)}, recebido ${format(actual)}`) },
    toHaveLength(expected) { assert(actual?.length === expected, `comprimento esperado ${expected}, recebido ${actual?.length}`) },
    toContain(expected) { assert(typeof actual === 'string' ? actual.includes(expected) : Array.isArray(actual) && actual.includes(expected), `esperado conter ${format(expected)}`) },
    toContainEqual(expected) { assert(Array.isArray(actual) && actual.some((v) => equal(v, expected)), `esperado conter valor equivalente a ${format(expected)}`) },
    toBeGreaterThan(expected) { assert(actual > expected, `esperado > ${expected}, recebido ${actual}`) },
    toBeGreaterThanOrEqual(expected) { assert(actual >= expected, `esperado >= ${expected}, recebido ${actual}`) },
    toBeLessThanOrEqual(expected) { assert(actual <= expected, `esperado <= ${expected}, recebido ${actual}`) },
    toBeNull() { assert(actual === null, `esperado null, recebido ${format(actual)}`) },
    toBeTruthy() { assert(Boolean(actual), `esperado valor verdadeiro, recebido ${format(actual)}`) },
    toMatch(expected) { assert(expected instanceof RegExp ? expected.test(String(actual)) : String(actual).includes(String(expected)), `esperado corresponder a ${expected}`) },
    toThrow(expected) {
      if (promiseMode === 'rejects') return throwsMatch(Promise.resolve(actual), expected).then((result) => assert(result.ok, `esperado lançar ${format(expected)}; ${result.detail || ''}`))
      let error
      try { actual() } catch (e) { error = e }
      const message = String(error?.message ?? error ?? '')
      const ok = Boolean(error) && (expected === undefined || (expected instanceof RegExp ? expected.test(message) : typeof expected === 'string' ? message.includes(expected) : typeof expected === 'function' ? error instanceof expected : false))
      assert(ok, `esperado lançar ${format(expected)}; ${message || 'não lançou erro'}`)
    },
  }
  return api
}
const expect = (actual) => matchers(actual)
expect.arrayContaining = (items) => ({ [ASYM]: true, test: (actual) => Array.isArray(actual) && items.every((item) => actual.some((v) => equal(v, item))) })
expect.objectContaining = (object) => ({ [ASYM]: true, test: (actual) => subsetMatch(actual, object) })

const tests = []
const suiteStack = []
const beforeEachStack = []
const describe = (name, fn) => {
  suiteStack.push(name); beforeEachStack.push([])
  try { fn() } finally { beforeEachStack.pop(); suiteStack.pop() }
}
const beforeEach = (fn) => { if (!beforeEachStack.length) throw new Error('beforeEach fora de describe'); beforeEachStack.at(-1).push(fn) }
const it = (name, fn) => tests.push({ name: [...suiteStack, name].join(' > '), fn, hooks: beforeEachStack.flat().slice() })
const vitest = { describe, it, test: it, beforeEach, expect, vi: { unstubAllGlobals() {}, stubGlobal(k, v) { globalThis[k] = v } } }
const react = {
  __esModule: true,
  default: {}, StrictMode: Symbol('StrictMode'), Fragment: Symbol('Fragment'),
  createContext: (value) => ({ _currentValue: value, Provider: Symbol('Provider'), Consumer: Symbol('Consumer') }),
  useContext: (ctx) => ctx?._currentValue,
  useEffect() {}, useLayoutEffect() {}, useMemo: (fn) => fn(), useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }), useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useReducer: (_r, v) => [v, () => {}], lazy: (fn) => fn, Suspense: Symbol('Suspense'),
}
const jsxRuntime = { __esModule: true, Fragment: react.Fragment, jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
const externals = {
  vitest,
  react,
  'react/jsx-runtime': jsxRuntime,
  'react-dom/client': { __esModule: true, createRoot: () => ({ render() {} }) },
  'lucide-react': new Proxy({ __esModule: true }, { get: (t, p) => p in t ? t[p] : () => null }),
  '@supabase/supabase-js': { __esModule: true, createClient: () => ({}) },
}
const cache = Object.create(null)
const suffixes = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
const normalize = (value) => {
  const out = []
  for (const p of value.split('/')) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p) }
  return out.join('/')
}
const resolve = (from, request) => {
  if (externals[request]) return request
  if (!request.startsWith('.')) throw new Error(`Externo não suportado: ${request}`)
  const base = from.slice(0, from.lastIndexOf('/') + 1)
  const candidate = normalize(base + request)
  for (const suffix of suffixes) if (modules[candidate + suffix]) return candidate + suffix
  throw new Error(`Não encontrado: ${request} de ${from}`)
}
const load = (id) => {
  if (externals[id]) return externals[id]
  if (cache[id]) return cache[id].exports
  const code = modules[id]
  if (!code) throw new Error(`Módulo ausente: ${id}`)
  const module = { exports: {} }; cache[id] = module
  const factory = new Function('module', 'exports', 'require', code)
  factory(module, module.exports, (r) => load(resolve(id, r)))
  return module.exports
}

load('src/test/setup.ts')
const testFiles = files.map(idOf).filter((id) => /\.test\.(ts|tsx)$/.test(id))
for (const file of testFiles) load(file)
if (process.env.DEBUG_INIT === '1') {
  load('src/lib/storage.ts').safeStorage.clear()
  const { LocalCrmRepository, LOCAL_DATABASE_STORAGE_KEY } = load('src/repositories/local-crm-repository.ts')
  const repository = new LocalCrmRepository()
  await repository.initialize()
  const raw1 = localStorage.getItem(LOCAL_DATABASE_STORAGE_KEY)
  await repository.initialize()
  const raw2 = localStorage.getItem(LOCAL_DATABASE_STORAGE_KEY)
  const a = JSON.parse(raw1), b = JSON.parse(raw2)
  const diff = (x, y, p = '') => {
    if (Object.is(x, y)) return null
    if (typeof x !== typeof y || x === null || y === null || typeof x !== 'object') return { path: p, a: x, b: y }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)])
    for (const k of keys) { const d = diff(x[k], y[k], p ? `${p}.${k}` : k); if (d) return d }
    return null
  }
  console.log(JSON.stringify({ equal: raw1 === raw2, firstDiff: diff(a, b), len1: raw1.length, len2: raw2.length }, null, 2))
  process.exit(0)
}
let passed = 0
const failures = []
for (const test of tests) {
  try {
    load('src/lib/storage.ts').safeStorage.clear()
    for (const hook of test.hooks) await hook()
    await test.fn()
    passed += 1
  } catch (error) {
    failures.push({ test: test.name, error: String(error?.stack || error) })
  }
}
const report = { version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, generatedAt: new Date().toISOString(), runner: 'registry-independent', files: testFiles.length, tests: tests.length, passed, failed: failures.length, failures }
const reportLabel = `V${report.version.replace(/\.0$/, '').replaceAll('.', '-')}`
fs.writeFileSync(path.join(root, `TEST-REPORT-${reportLabel}.json`), JSON.stringify(report, null, 2) + '\n')
console.log(`${passed}/${tests.length} testes aprovados em ${testFiles.length} arquivos.`)
if (failures.length) { for (const f of failures) console.error(`\nFALHA — ${f.test}\n${f.error}`); process.exit(1) }
