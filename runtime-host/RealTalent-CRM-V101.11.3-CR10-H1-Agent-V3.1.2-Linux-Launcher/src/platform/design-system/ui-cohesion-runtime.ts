const UI_COHESION_BUILD = '101.11.3-h20.7'

const canonicalTokens: Record<string, string> = {
  '--rt-color-brand': '#315BD8',
  '--rt-color-brand-hover': '#274CC5',
  '--rt-color-brand-strong': '#173B91',
  '--rt-color-brand-soft': '#EEF3FF',
  '--rt-color-success': '#1D9E75',
  '--rt-color-success-soft': '#EAF8F3',
  '--rt-primary': '#315BD8',
  '--rt-primary-soft': '#EEF3FF',
  '--blue': '#315BD8',
  '--blue-2': '#274CC5',
  '--blue-soft': '#EEF3FF',
  '--accent': '#315BD8',
  '--accent-soft': '#EEF3FF',
  '--primary': '#315BD8',
  '--primary-soft': '#EEF3FF',
}

const criticalCss = `
html[data-ui-cohesion="h20.7"] body [data-rt-primitive="button"]{border-radius:var(--rt-radius-md);box-shadow:none}
html[data-ui-cohesion="h20.7"] body [data-rt-primitive="button"].rt-button--primary{background:var(--rt-color-brand);border-color:var(--rt-color-brand);color:#fff}
html[data-ui-cohesion="h20.7"] body [data-rt-primitive="input"],html[data-ui-cohesion="h20.7"] body [data-rt-primitive="select"],html[data-ui-cohesion="h20.7"] body [data-rt-primitive="textarea"]{border-color:var(--rt-color-border);border-radius:var(--rt-radius-md);background:var(--rt-color-surface);color:var(--rt-color-text)}
html[data-ui-cohesion="h20.7"] body [data-rt-layout="page-header"]{border-bottom-color:var(--rt-color-border)}
html[data-ui-cohesion="h20.7"] body [data-rt-layout="view-strip"],html[data-ui-cohesion="h20.7"] body [data-rt-layout="command-bar"],html[data-ui-cohesion="h20.7"] body [data-rt-layout="summary-strip"]{border-color:var(--rt-color-border)}
html[data-ui-cohesion="h20.7"] body .topbar.global-appbar-v10162{background:var(--rt-shell-topbar)!important;color:var(--rt-shell-topbar-text)!important;border-bottom-color:var(--rt-shell-topbar-border)!important}
html[data-ui-cohesion="h20.7"] body .global-search [data-rt-primitive="input"]{background:transparent!important;border:0!important;box-shadow:none!important;color:var(--rt-shell-topbar-text)!important}
html[data-ui-cohesion="h20.7"] body .sidebar{background:var(--rt-shell-sidebar)!important;color:var(--rt-shell-sidebar-text)!important}
html[data-ui-cohesion="h20.7"] body .sidebar__item.is-active{background:var(--rt-shell-sidebar-active)!important;color:var(--rt-shell-sidebar-active-text)!important}
`

function applyCanonicalTokens() {
  const root = document.documentElement
  root.dataset.uiCohesion = 'h20.7'
  root.dataset.uiCohesionBuild = UI_COHESION_BUILD
  for (const [name, value] of Object.entries(canonicalTokens)) {
    if (!root.style.getPropertyValue(name).trim()) root.style.setProperty(name, value)
  }
}

export function installUiCohesionRuntime() {
  if (typeof document === 'undefined') return
  applyCanonicalTokens()
  const head = document.head
  let guard = document.getElementById('rt-h20-cascade-guard') as HTMLStyleElement | null
  if (!guard) {
    guard = document.createElement('style')
    guard.id = 'rt-h20-cascade-guard'
    guard.dataset.uiCohesion = UI_COHESION_BUILD
    guard.textContent = criticalCss
    head.appendChild(guard)
  }
  const keepGuardLast = () => {
    applyCanonicalTokens()
    if (guard && head.lastElementChild !== guard) head.appendChild(guard)
  }
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.addedNodes.length > 0)) return
    queueMicrotask(keepGuardLast)
  })
  observer.observe(head, { childList: true })
  window.addEventListener('pageshow', keepGuardLast)
}
