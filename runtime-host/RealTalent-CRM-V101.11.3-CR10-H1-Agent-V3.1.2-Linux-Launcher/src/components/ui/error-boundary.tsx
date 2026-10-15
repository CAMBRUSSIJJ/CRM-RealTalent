import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './button'
import { recordDiagnostic } from '../../lib/diagnostics'

interface Props { children: ReactNode }
interface State { error: Error | null; reference: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reference: '' }

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: `RT-${Date.now().toString(36).toUpperCase()}` }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado no CRM', { error, info, reference: this.state.reference })
    recordDiagnostic({ severity: 'error', source: 'interface', message: error.message, reference: this.state.reference, route: window.location.hash, workspaceId: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-state"><AlertTriangle size={46} /><h1>O CRM encontrou um problema inesperado</h1><p>A tela foi interrompida para evitar novas alterações. Recarregue a aplicação, confirme os últimos dados salvos e informe a referência <strong>{this.state.reference}</strong> caso o erro se repita.</p><details><summary>Detalhes técnicos</summary><code>{this.state.error.message}</code></details><Button onClick={() => window.location.reload()}><RefreshCw size={17} /> Recarregar aplicação</Button></main>
  }
}
