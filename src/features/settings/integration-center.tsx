import type { WorkspaceMember } from '../../domain/types'
import type { CrmPreferences } from './preferences-context'
import { IntegrationFrameworkPanel } from './integration-framework-panel'
import { useApp } from '../../app/app-context'

interface IntegrationCenterProps {
  preferences: CrmPreferences['integrations']
  members: WorkspaceMember[]
  onPreferencesChange(patch: Partial<CrmPreferences['integrations']>): void
}

export function IntegrationCenter(props: IntegrationCenterProps) {
  const { setRoute } = useApp()
  return <div className="page-stack">
    <article className="panel page-stack" style={{ padding: 22 }}>
      <div className="panel__heading"><div><span className="eyebrow">WhatsApp · WAHA GOWS</span><h3>Conexão direta sem Supabase</h3></div></div>
      <p>O WAHA mantém sua sessão no Linux. O CRM acessa as conversas por uma ponte local autenticada, sem alterar o QR ou usar o banco para transportar mensagens.</p>
      <div><button className="btn btn--primary" type="button" onClick={() => setRoute('communications')}>Abrir Comunicações</button></div>
      <small>O computador Linux precisa estar ligado. Nenhuma chave do WAHA deve ser colocada no navegador.</small>
    </article>
    <IntegrationFrameworkPanel {...props} />
  </div>
}
