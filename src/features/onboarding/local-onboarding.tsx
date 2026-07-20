import { Building2, CheckCircle2, Database, HardDrive, Rocket, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { APP_VERSION_LABEL } from '../../lib/app-version'
import type { LocalExperienceMode } from '../../lib/local-experience'
import { configureLocalExperience } from '../../repositories/local-crm-repository'

interface LocalOnboardingProps { onComplete(): Promise<void> | void }

export function LocalOnboarding({ onComplete }: LocalOnboardingProps) {
  const [displayName, setDisplayName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<LocalExperienceMode>('demo')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = () => {
    setSaving(true); setError('')
    try {
      configureLocalExperience({ displayName, companyName, email, mode })
      window.dispatchEvent(new CustomEvent('crm:local-profile-changed'))
      void Promise.resolve(onComplete()).catch((completeError) => {
        setError(completeError instanceof Error ? completeError.message : 'Não foi possível abrir o CRM.')
        setSaving(false)
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível preparar o CRM.')
      setSaving(false)
    }
  }

  return <main className="local-onboarding">
    <section className="local-onboarding__showcase">
      <div className="local-onboarding__brand"><span><Rocket size={23} /></span><div><strong>RealTalent CRM</strong><small>{APP_VERSION_LABEL}</small></div></div>
      <div className="local-onboarding__copy"><span className="eyebrow"><Sparkles size={15} /> Primeiro acesso</span><h1>Prepare o CRM para a sua operação.</h1><p>Escolha entre conhecer o fluxo com exemplos ou começar com uma base vazia. Nada será enviado para a internet nesta versão local.</p></div>
      <div className="local-onboarding__trust"><span><HardDrive /> Dados neste navegador</span><span><ShieldCheck /> Sem senhas ou cobrança</span><span><Database /> Backup exportável</span></div>
    </section>
    <section className="local-onboarding__form-area">
      <div className="local-onboarding__card">
        <div><span className="eyebrow">Configuração inicial</span><h2>Como você quer começar?</h2><p>Essas informações personalizam o perfil, a empresa e os responsáveis dos exemplos.</p></div>
        <div className="local-onboarding__fields">
          <label className="field"><span>Seu nome</span><div className="input-with-icon"><UserRound size={17} /><input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Camila Coelho" /></div></label>
          <label className="field"><span>Nome da empresa</span><div className="input-with-icon"><Building2 size={17} /><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Ex.: RealTalent" /></div></label>
          <label className="field"><span>E-mail de identificação <small>(opcional)</small></span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label>
        </div>
        <div className="local-onboarding__modes" role="radiogroup" aria-label="Tipo de base inicial">
          <button type="button" role="radio" aria-checked={mode === 'demo'} className={mode === 'demo' ? 'is-selected' : ''} onClick={() => setMode('demo')}>
            <span className="local-onboarding__mode-icon"><Sparkles size={20} /></span><span><strong>Conhecer com exemplos</strong><small>Leads, atividades, agenda e métricas prontas para explorar.</small></span>{mode === 'demo' ? <CheckCircle2 size={19} /> : null}
          </button>
          <button type="button" role="radio" aria-checked={mode === 'clean'} className={mode === 'clean' ? 'is-selected' : ''} onClick={() => setMode('clean')}>
            <span className="local-onboarding__mode-icon"><Database size={20} /></span><span><strong>Começar com base vazia</strong><small>Somente o Pipeline padrão, pronto para cadastrar dados reais.</small></span>{mode === 'clean' ? <CheckCircle2 size={19} /> : null}
          </button>
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="local-onboarding__notice"><HardDrive size={18} /><span><strong>Versão local:</strong> os dados ficam salvos apenas neste navegador. Use o backup antes de trocar de computador ou limpar os dados do navegador.</span></div>
        <Button size="lg" loading={saving} disabled={displayName.trim().length < 2 || companyName.trim().length < 2} onClick={submit}><Rocket size={18} /> Entrar no CRM</Button>
      </div>
    </section>
  </main>
}
