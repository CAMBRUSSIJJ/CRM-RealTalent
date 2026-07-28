import { ArrowLeft, ArrowRight, CheckCircle2, Database, KeyRound, LockKeyhole, MailCheck, Sparkles, Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/button'
import { useAuth } from './auth-context'
import { APP_VERSION_LABEL } from '../../lib/app-version'

type AuthMode = 'login' | 'signup' | 'forgot' | 'confirmation' | 'recovery'

export function AuthPage() {
  const auth = useAuth()
  const [mode, setMode] = useState<AuthMode>(auth.recoveryMode ? 'recovery' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'login') await auth.signIn(email, password)
      else if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error('As senhas não são iguais.')
        const result = await auth.signUp(email, password, displayName)
        if (result.confirmationRequired) { setMode('confirmation'); setMessage('Enviamos um link de confirmação para o seu e-mail.') }
      } else if (mode === 'forgot') {
        await auth.requestPasswordReset(email); setMessage('Enviamos um link para redefinir sua senha.')
      } else if (mode === 'recovery') {
        if (password !== confirmPassword) throw new Error('As senhas não são iguais.')
        await auth.updatePassword(password); setMode('login'); setMessage('Senha atualizada. Você já pode entrar.')
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível continuar.')
    } finally { setLoading(false) }
  }

  const title = mode === 'login' ? 'Entrar no CRM' : mode === 'signup' ? 'Criar sua conta' : mode === 'forgot' ? 'Recuperar acesso' : mode === 'recovery' ? 'Definir nova senha' : 'Confirme seu e-mail'

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand"><span><Zap size={22} fill="currentColor" /></span><div><strong>RealTalent</strong><small>CRM {APP_VERSION_LABEL}</small></div></div>
        <div className="auth-showcase__copy"><span className="eyebrow"><Sparkles size={15} /> Pronto para produção</span><h1>Operação comercial organizada para crescer.</h1><p>React, TypeScript e Supabase com autenticação, workspaces, permissões e dados isolados por empresa.</p></div>
        <div className="auth-benefits"><span><CheckCircle2 /> Recuperação de acesso</span><span><CheckCircle2 /> Equipes e permissões</span><span><CheckCircle2 /> Backups exportáveis</span></div>
        <div className="auth-architecture"><span><Database /> PostgreSQL</span><span><LockKeyhole /> RLS</span><span><Zap /> Tempo real</span></div>
      </section>
      <section className="auth-form-area">
        <form className="auth-card" onSubmit={submit}>
          <div><span className="eyebrow">Acesso seguro</span><h2>{title}</h2><p>{mode === 'confirmation' ? 'Abra o link recebido e depois volte para entrar.' : mode === 'forgot' ? 'Informe o e-mail usado no CRM.' : mode === 'recovery' ? 'Escolha uma senha nova e segura.' : 'Use suas credenciais protegidas pelo Supabase.'}</p></div>
          {mode === 'confirmation' ? <div className="auth-confirmation"><MailCheck size={42} /><strong>Verifique sua caixa de entrada</strong><p>{message || `Enviamos a confirmação para ${email}.`}</p><Button type="button" variant="secondary" loading={loading} onClick={async () => { setLoading(true); try { await auth.resendConfirmation(email); setMessage('E-mail reenviado.') } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao reenviar.') } finally { setLoading(false) } }}>Reenviar confirmação</Button></div> : null}
          {mode === 'signup' ? <label className="field"><span>Seu nome</span><input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Camila Coelho" /></label> : null}
          {mode !== 'recovery' && mode !== 'confirmation' ? <label className="field"><span>E-mail</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label> : null}
          {['login', 'signup', 'recovery'].includes(mode) ? <label className="field"><span>{mode === 'recovery' ? 'Nova senha' : 'Senha'}</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /></label> : null}
          {mode === 'recovery' || mode === 'signup' ? <label className="field"><span>{mode === 'signup' ? 'Confirmar senha' : 'Confirmar nova senha'}</span><input required minLength={8} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repita a senha" /></label> : null}
          {error ? <div className="form-error">{error}</div> : null}
          {message && mode !== 'confirmation' ? <div className="form-success">{message}</div> : null}
          {mode !== 'confirmation' ? <Button size="lg" loading={loading} type="submit">{mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : mode === 'forgot' ? 'Enviar recuperação' : 'Atualizar senha'} {mode === 'forgot' ? <KeyRound size={18} /> : <ArrowRight size={18} />}</Button> : null}
          {mode === 'login' ? <button className="auth-switch" type="button" onClick={() => setMode('forgot')}>Esqueci minha senha</button> : null}
          <button className="auth-switch" type="button" onClick={() => { setError(''); setMessage(''); setMode(mode === 'login' ? 'signup' : 'login') }}>{mode === 'login' ? 'Ainda não possui conta? Criar conta' : <><ArrowLeft size={15} /> Voltar para entrar</>}</button>
        </form>
      </section>
    </main>
  )
}
