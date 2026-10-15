import { NativeSelectionSelect } from '../../components/selection'
import { Check, Monitor, Palette, RotateCcw, Sidebar as SidebarIcon, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Button } from '../../components/ui/button'
import {
  APPEARANCE_PRESETS,
  appearanceColorsForPreset,
  contrastTextColor,
  isHexColor,
  type AppearanceColorPreset,
} from '../../platform/design-system/appearance-theme'
import type { CrmPreferences } from './preferences-context'

type AppearancePreferences = CrmPreferences['appearance']

interface AppearanceSettingsPanelProps {
  value: AppearancePreferences
  onChange(patch: Partial<AppearancePreferences>): void
  onRestoreDefault(): void
}

const colorFields: Array<{ key: keyof Pick<AppearancePreferences, 'accentColor' | 'topbarColor' | 'sidebarColor' | 'canvasColor' | 'surfaceColor'>; label: string; detail: string }> = [
  { key: 'accentColor', label: 'Destaque', detail: 'Botões, seleção, links e elementos ativos.' },
  { key: 'topbarColor', label: 'Barra superior', detail: 'Fundo da busca e ações globais.' },
  { key: 'sidebarColor', label: 'Barra lateral', detail: 'Fundo da navegação principal.' },
  { key: 'canvasColor', label: 'Fundo das páginas', detail: 'Cor do canvas atrás de cards e módulos.' },
  { key: 'surfaceColor', label: 'Cards e painéis', detail: 'Superfície principal dos blocos de conteúdo.' },
]

export function AppearanceSettingsPanel({ value, onChange, onRestoreDefault }: AppearanceSettingsPanelProps) {
  const applyPreset = (preset: AppearanceColorPreset) => {
    const colors = appearanceColorsForPreset(preset, value)
    onChange({ colorPreset: preset, ...colors })
  }

  const changeColor = (key: (typeof colorFields)[number]['key'], color: string) => {
    onChange({ colorPreset: 'custom', [key]: color })
  }

  const previewStyle = {
    '--appearance-preview-topbar': value.topbarColor,
    '--appearance-preview-topbar-text': contrastTextColor(value.topbarColor),
    '--appearance-preview-sidebar': value.sidebarColor,
    '--appearance-preview-sidebar-text': contrastTextColor(value.sidebarColor),
    '--appearance-preview-canvas': value.canvasColor,
    '--appearance-preview-surface': value.surfaceColor,
    '--appearance-preview-accent': value.accentColor,
  } as CSSProperties

  return <>
    <article className="panel appearance-studio-h4">
      <div className="panel__heading"><div><span className="eyebrow">Workspace Appearance</span><h3>Identidade visual do CRM</h3><p>Escolha um preset ou personalize cada superfície. O verde deixa de ser obrigatório.</p></div><Palette size={22} /></div>
      <div className="appearance-studio-h4__theme-row">
        <div className="settings-choice-grid appearance-studio-h4__themes">
          <label className={`settings-choice ${value.theme === 'light' ? 'is-active' : ''}`}><input type="radio" name="appearance-theme" checked={value.theme === 'light'} onChange={() => onChange({ theme: 'light' })} /><strong>Claro</strong><span>Usa exatamente as cores escolhidas.</span></label>
          <label className={`settings-choice ${value.theme === 'dark' ? 'is-active' : ''}`}><input type="radio" name="appearance-theme" checked={value.theme === 'dark'} onChange={() => onChange({ theme: 'dark' })} /><strong>Escuro</strong><span>Deriva superfícies escuras preservando o accent.</span></label>
          <label className={`settings-choice ${value.theme === 'system' ? 'is-active' : ''}`}><input type="radio" name="appearance-theme" checked={value.theme === 'system'} onChange={() => onChange({ theme: 'system' })} /><strong>Automático</strong><span>Acompanha o sistema operacional.</span></label>
        </div>
      </div>
    </article>

    <article className="panel appearance-studio-h4">
      <div className="panel__heading"><div><span className="eyebrow">Presets</span><h3>Escolha uma base visual</h3><p>O preset muda somente a aparência; seus dados e layouts permanecem intactos.</p></div><Sparkles size={22} /></div>
      <div className="appearance-preset-grid-h4">
        {APPEARANCE_PRESETS.map((preset) => <button type="button" key={preset.id} className={`appearance-preset-card-h4 ${value.colorPreset === preset.id ? 'is-active' : ''}`} onClick={() => applyPreset(preset.id)}>
          <span className="appearance-preset-card-h4__mini" style={{ background: preset.canvasColor }}>
            <i style={{ background: preset.sidebarColor }} />
            <b style={{ background: preset.topbarColor }} />
            <em style={{ background: preset.accentColor }} />
          </span>
          <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
          {value.colorPreset === preset.id ? <Check size={16} /> : null}
        </button>)}
        <button type="button" className={`appearance-preset-card-h4 ${value.colorPreset === 'custom' ? 'is-active' : ''}`} onClick={() => onChange({ colorPreset: 'custom' })}>
          <span className="appearance-preset-card-h4__custom"><Palette size={18} /></span><span><strong>Personalizado</strong><small>Use suas próprias cores nas superfícies abaixo.</small></span>{value.colorPreset === 'custom' ? <Check size={16} /> : null}
        </button>
      </div>
    </article>

    <article className="panel appearance-studio-h4">
      <div className="panel__heading"><div><span className="eyebrow">Cores</span><h3>Personalizar superfícies</h3><p>Texto e ícones escolhem automaticamente a cor clara ou escura de maior contraste.</p></div><Monitor size={22} /></div>
      <div className="appearance-color-grid-h4">
        {colorFields.map((field) => <label className="appearance-color-field-h4" key={field.key}><span><strong>{field.label}</strong><small>{field.detail}</small></span><span className="appearance-color-field-h4__controls"><input type="color" value={value[field.key]} onChange={(event) => changeColor(field.key, event.target.value.toUpperCase())} /><input key={`${field.key}-${value[field.key]}`} defaultValue={value[field.key]} maxLength={7} onBlur={(event) => { const color = event.target.value.toUpperCase(); if (isHexColor(color)) changeColor(field.key, color); else event.target.value = value[field.key] }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></span></label>)}
      </div>
      <div className="settings-form-grid settings-form-grid--3 appearance-studio-h4__behavior">
        <label className="field"><span>Densidade</span><NativeSelectionSelect value={value.density} onChange={(event) => onChange({ density: event.target.value as AppearancePreferences['density'] })}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></NativeSelectionSelect></label>
        <label className="field"><span>Menu lateral</span><NativeSelectionSelect value={value.sidebar} onChange={(event) => onChange({ sidebar: event.target.value as AppearancePreferences['sidebar'] })}><option value="expanded">Sempre expandido</option><option value="compact">Sempre compacto</option><option value="auto">Automático por espaço</option></NativeSelectionSelect></label>
        <label className="settings-toggle"><input type="checkbox" checked={value.reduceMotion} onChange={(event) => onChange({ reduceMotion: event.target.checked })} /><span><strong>Reduzir animações</strong><small>Remove movimentos não essenciais.</small></span></label>
      </div>
      <div className="settings-actions"><Button variant="secondary" onClick={onRestoreDefault}><RotateCcw size={16} /> Restaurar visual padrão</Button><span className="settings-copy">As alterações aparecem imediatamente como prévia. Use “Aplicar configurações” para persistir no workspace.</span></div>
    </article>

    <article className="panel appearance-studio-h4">
      <div className="panel__heading"><div><span className="eyebrow">Prévia ao vivo</span><h3>Como o CRM vai conversar visualmente</h3><p>Topbar, sidebar, canvas e cards usam a mesma composição.</p></div><SidebarIcon size={22} /></div>
      <div className="appearance-preview-h4" style={previewStyle}>
        <aside><div className="appearance-preview-h4__logo">RT</div><span className="is-active">Meu Dia</span><span>Contatos</span><span>Pipeline</span><span>Comunicação</span></aside>
        <section><header><span>Encontrar no RealTalent</span><b>Assistente</b><i>Perfil</i></header><main><article><small>Meu Dia</small><strong>Prioridades comerciais</strong><p>Conteúdo sobre a superfície escolhida.</p><span className="appearance-preview-h4__button">Ação principal</span></article><article><small>Pipeline</small><strong>Negócios em andamento</strong><p>O accent aparece apenas onde ajuda a orientar.</p></article></main></section>
      </div>
    </article>
  </>
}
