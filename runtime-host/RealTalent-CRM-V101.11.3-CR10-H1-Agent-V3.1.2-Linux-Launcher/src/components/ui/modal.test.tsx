import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Modal } from './modal'

describe('Modal accessibility contract', () => {
  it('renders an explicitly modal, labelled dialog with an accessible close control', () => {
    const html = renderToStaticMarkup(<Modal open title="Editar lead" subtitle="Dados comerciais" onClose={() => undefined}><button type="button" onClick={() => undefined}>Salvar</button></Modal>)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('aria-label="Fechar"')
  })
})
