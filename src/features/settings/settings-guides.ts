/** Contextual help is intentionally short: configuration is a tool, not a tutorial. */
export type SettingsSectionId=
  'account'|'appearance'|'experience'|'pages'|'notifications'|'company'|'navigation'|
  'team'|'commercial'|'ai'|'calendar'|'whatsapp'|'integrations'|'maps'|'audit'|'data'
export interface SettingsGuide{title:string;description:string;scope:string}
export const SETTINGS_GUIDES:Record<SettingsSectionId,SettingsGuide>={
  account:{title:'Acesso e identidade',description:'Atualize seus dados e recupere acesso sem misturar preferências de aparência.',scope:'Conta pessoal'},
  appearance:{title:'Personalização com prévia ao vivo',description:'Escolha cores, tema e densidade. Alterações visuais podem ser salvas automaticamente.',scope:'Visual do workspace'},
  experience:{title:'Experiência sob medida',description:'Ajustes pessoais são salvos independentemente das regras da organização.',scope:'Apenas você'},
  pages:{title:'Organize suas páginas',description:'Mostre, oculte ou reorganize blocos. As preferências de página salvam automaticamente.',scope:'Apenas você'},
  notifications:{title:'Avisos relevantes, sem ruído',description:'Ative canais, defina eventos e estabeleça horários de silêncio.',scope:'Apenas você'},
  company:{title:'Identidade institucional',description:'Configure marca e fuso do workspace. Confirme as alterações antes de aplicá-las.',scope:'Todo o workspace'},
  navigation:{title:'Menu adaptado ao trabalho',description:'Reorganize, renomeie ou oculte ferramentas e acompanhe a prévia da sidebar.',scope:'Navegação do workspace'},
  team:{title:'Pessoas e autorização',description:'Gerencie convites e funções com as permissões efetivas visíveis.',scope:'Administradores'},
  commercial:{title:'Regras de vendas com controle',description:'Ajuste Pipeline, SLA e inteligência comercial; confirme alterações que afetam a equipe.',scope:'Operação comercial'},
  ai:{title:'Inteligência realmente conectada',description:'Verifique o modelo, o gateway e as ferramentas. Indicadores precisam ser confirmados por diagnóstico.',scope:'Agent local'},
  calendar:{title:'Agenda conectada e verificável',description:'Selecione a conta, configure a direção da sincronização e acompanhe conflitos.',scope:'Integração externa'},
  whatsapp:{title:'Canal comercial em um lugar',description:'Conecte, organize templates e confira o estado operacional. Diagnósticos ficam separados.',scope:'Canal compartilhado'},
  integrations:{title:'Contas conectadas antes da infraestrutura',description:'Conexões e acessos no painel principal; filas e detalhes técnicos sob demanda.',scope:'Conexões externas'},
  maps:{title:'Território e Garimpo',description:'Verifique os providers ativos e a precisão de geocodificação antes de pesquisar.',scope:'Busca territorial'},
  audit:{title:'Implementação não é disponibilidade',description:'Compare maturidade funcional com a disponibilidade real das integrações.',scope:'Diagnóstico'},
  data:{title:'Proteja os dados do CRM',description:'Valide backups e restaurações antes de aplicar preferências. Exclusões exigem confirmação.',scope:'Administração crítica'},
}
