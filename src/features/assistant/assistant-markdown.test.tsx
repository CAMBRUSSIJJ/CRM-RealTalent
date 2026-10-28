import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {AssistantMarkdown} from './assistant-markdown'
describe('Assistant Markdown view',()=>{
  it('renders headings and strong text without literal hashes or asterisks',()=>{
    const html=renderToStaticMarkup(<AssistantMarkdown text={'## 1. **Abordagem Tradicional (B2B)**\n\nPara **jardineiros** que atendem condomínios:\n- **Vantagem:** relacionamento longo\n- **Desafio:** proposta técnica'}/>)
    expect(html).toContain('<h3>')
    expect(html).toContain('<strong>Abordagem Tradicional (B2B)</strong>')
    expect(html).toContain('<strong>jardineiros</strong>')
    expect(html).not.toContain('## 1.')
    expect(html).not.toContain('**')
  })
  it('does not render untrusted HTML, images or javascript URLs',()=>{
    const html=renderToStaticMarkup(<AssistantMarkdown text={'<script>alert(1)</script> [X](javascript:alert(1)) ![pixel](https://tracker.example/x) **texto**'}/>)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:')
  })
  it('links citation numbers to permitted sources',()=>{
    const html=renderToStaticMarkup(<AssistantMarkdown text={'Análise baseada em [1].'} sources={[{title:'Fonte pública',url:'https://example.org/source'}]}/>)
    expect(html).toContain('href="https://example.org/source"')
    expect(html).toContain('[1]</a>')
  })
  it('renders Markdown tables in a scrollable table',()=>{
    const html=renderToStaticMarkup(<AssistantMarkdown text={'| A | B |\n| --- | --- |\n| **Teste** | Valor |'}/>)
    expect(html).toContain('<table>')
    expect(html).toContain('<strong>Teste</strong>')
  })
})
