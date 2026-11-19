/**
 * Filtro "goo" do efeito de bolhas (port do Blue Ocean). Montado uma única vez no documento:
 * ele funde as bolhas e deixa a borda do preenchimento orgânica.
 */
let mounted = false

export function ensureBlobFilter() {
  if (mounted || typeof document === 'undefined' || document.getElementById('rt-blob-goo')) {
    mounted = true
    return
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('id', 'rt-blob-goo')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0', overflow: 'hidden' })
  svg.innerHTML = `<defs>
    <filter id="rt-goo">
      <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
      <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
      <feBlend in="SourceGraphic" in2="goo"/>
    </filter>
  </defs>`
  document.body.appendChild(svg)
  mounted = true
}
