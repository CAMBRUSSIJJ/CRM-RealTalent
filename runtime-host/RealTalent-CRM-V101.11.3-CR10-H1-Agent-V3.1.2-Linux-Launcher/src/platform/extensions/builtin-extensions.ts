import type { ExtensionManifest } from './types'

const manifest = (value: Omit<ExtensionManifest, 'schemaVersion'>): ExtensionManifest => ({ ...value, schemaVersion: '101.9.7' })

export const builtinExtensionManifests: ExtensionManifest[] = [
  manifest({
    id: 'google-workspace', version: '1.0.0', label: 'Google Workspace', providerId: 'google', oauthProvider: 'google', kind: 'oauth', enabledByDefault: true,
    description: 'Gmail e Google Calendar oficiais com OAuth PKCE e sincronização incremental.',
    scopes: [
      { id: 'openid', label: 'Identidade OpenID', permissionAction: 'read' },
      { id: 'email', label: 'E-mail da conta', permissionAction: 'read' },
      { id: 'profile', label: 'Perfil da conta', permissionAction: 'read' },
      { id: 'gmail.send', label: 'Enviar Gmail', permissionAction: 'execute' },
      { id: 'gmail.readonly', label: 'Ler Gmail', permissionAction: 'read' },
      { id: 'calendar.events', label: 'Gerenciar eventos', permissionAction: 'execute' },
      { id: 'calendar.calendarlist.readonly', label: 'Ler calendários', permissionAction: 'read' },
    ],
    capabilities: [
      { id: 'email_send', label: 'Enviar e-mail' }, { id: 'email_read', label: 'Ler Gmail' },
      { id: 'calendar_read', label: 'Ler agenda' }, { id: 'calendar_write', label: 'Criar e editar eventos' },
      { id: 'mail_sync', label: 'Sincronizar e-mail' }, { id: 'calendar_sync', label: 'Sincronizar agenda' },
      { id: 'incremental_sync', label: 'Sincronização incremental' }, { id: 'webhooks', label: 'Notificações do provedor' },
    ],
    jobs: [
      { id: 'google_mail_pull', label: 'Sincronizar Gmail', default: true }, { id: 'google_calendar_pull', label: 'Importar agenda' },
      { id: 'google_calendar_push', label: 'Publicar agenda' }, { id: 'google_subscription_renew', label: 'Renovar subscription' },
      { id: 'credential_refresh', label: 'Renovar credencial' }, { id: 'account_health_check', label: 'Verificar conta' },
    ],
    commands: [
      { id: 'google.connect', label: 'Conectar Google', action: 'manage', resource: 'integration' },
      { id: 'google.sync.mail', label: 'Sincronizar Gmail', action: 'execute', resource: 'integration', capability: 'mail_sync', requiredScopes: ['gmail.readonly'], jobType: 'google_mail_pull' },
      { id: 'google.sync.calendar', label: 'Sincronizar Google Calendar', action: 'execute', resource: 'integration', capability: 'calendar_sync', requiredScopes: ['calendar.calendarlist.readonly'], jobType: 'google_calendar_pull' },
      { id: 'google.send.email', label: 'Enviar e-mail pelo Gmail', action: 'execute', resource: 'integration', capability: 'email_send', requiredScopes: ['gmail.send'] },
    ],
    featureFlags: [
      { key: 'oauth_connect', label: 'OAuth', defaultEnabled: true }, { key: 'mail_sync', label: 'Sincronização de e-mail', defaultEnabled: true },
      { key: 'calendar_sync', label: 'Sincronização de agenda', defaultEnabled: true }, { key: 'provider_webhooks', label: 'Webhooks', defaultEnabled: true },
    ],
    lifecycleHooks: ['beforeConnect', 'afterConnect', 'beforeSync', 'afterSync', 'onError'],
  }),
  manifest({
    id: 'microsoft-365', version: '1.0.0', label: 'Microsoft 365', providerId: 'microsoft', oauthProvider: 'microsoft', kind: 'oauth', enabledByDefault: true,
    description: 'Outlook e Microsoft Calendar via Microsoft Graph com sincronização incremental.',
    scopes: [
      { id: 'openid', label: 'Identidade OpenID', permissionAction: 'read' }, { id: 'profile', label: 'Perfil da conta', permissionAction: 'read' },
      { id: 'email', label: 'E-mail da conta', permissionAction: 'read' }, { id: 'offline_access', label: 'Renovação offline', permissionAction: 'configure' },
      { id: 'Calendars.ReadWrite', label: 'Ler e gravar agenda', permissionAction: 'execute' }, { id: 'Mail.Read', label: 'Ler Outlook', permissionAction: 'read' },
      { id: 'Mail.Send', label: 'Enviar Outlook', permissionAction: 'execute' },
    ],
    capabilities: [
      { id: 'email_send', label: 'Enviar e-mail' }, { id: 'email_read', label: 'Ler Outlook' },
      { id: 'calendar_read', label: 'Ler agenda' }, { id: 'calendar_write', label: 'Criar e editar eventos' },
      { id: 'mail_sync', label: 'Sincronizar e-mail' }, { id: 'calendar_sync', label: 'Sincronizar agenda' },
      { id: 'incremental_sync', label: 'Sincronização incremental' }, { id: 'webhooks', label: 'Microsoft Graph subscriptions' },
    ],
    jobs: [
      { id: 'microsoft_mail_pull', label: 'Sincronizar Outlook', default: true }, { id: 'microsoft_calendar_pull', label: 'Importar agenda' },
      { id: 'microsoft_calendar_push', label: 'Publicar agenda' }, { id: 'microsoft_subscription_renew', label: 'Renovar subscription' },
      { id: 'credential_refresh', label: 'Renovar credencial' }, { id: 'account_health_check', label: 'Verificar conta' },
    ],
    commands: [
      { id: 'microsoft.connect', label: 'Conectar Microsoft', action: 'manage', resource: 'integration' },
      { id: 'microsoft.sync.mail', label: 'Sincronizar Outlook', action: 'execute', resource: 'integration', capability: 'mail_sync', requiredScopes: ['Mail.Read'], jobType: 'microsoft_mail_pull' },
      { id: 'microsoft.sync.calendar', label: 'Sincronizar Microsoft Calendar', action: 'execute', resource: 'integration', capability: 'calendar_sync', requiredScopes: ['Calendars.ReadWrite'], jobType: 'microsoft_calendar_pull' },
      { id: 'microsoft.send.email', label: 'Enviar e-mail pelo Outlook', action: 'execute', resource: 'integration', capability: 'email_send', requiredScopes: ['Mail.Send'] },
    ],
    featureFlags: [
      { key: 'oauth_connect', label: 'OAuth', defaultEnabled: true }, { key: 'mail_sync', label: 'Sincronização de e-mail', defaultEnabled: true },
      { key: 'calendar_sync', label: 'Sincronização de agenda', defaultEnabled: true }, { key: 'provider_webhooks', label: 'Subscriptions', defaultEnabled: true },
    ],
    lifecycleHooks: ['beforeConnect', 'afterConnect', 'beforeSync', 'afterSync', 'onError'],
  }),
  manifest({
    id: 'meta-business', version: '1.0.0', label: 'Meta Business', providerId: 'meta', oauthProvider: 'meta', kind: 'oauth', enabledByDefault: true,
    description: 'Facebook, Instagram profissional e Lead Ads.',
    scopes: [
      { id: 'public_profile', label: 'Perfil público', permissionAction: 'read' }, { id: 'pages_show_list', label: 'Listar páginas', permissionAction: 'read' },
      { id: 'leads_retrieval', label: 'Importar Lead Ads', permissionAction: 'execute' }, { id: 'instagram_basic', label: 'Instagram básico', permissionAction: 'read' },
      { id: 'instagram_manage_messages', label: 'Mensagens do Instagram', permissionAction: 'execute' },
    ],
    capabilities: [
      { id: 'lead_ads', label: 'Importar Lead Ads' }, { id: 'pages', label: 'Páginas do Facebook' }, { id: 'instagram', label: 'Instagram profissional' },
      { id: 'instagram_messages', label: 'Mensagens do Instagram' }, { id: 'facebook_messages', label: 'Mensagens do Facebook/Messenger' }, { id: 'webhooks', label: 'Eventos Meta' },
    ],
    jobs: [
      { id: 'meta_account_sync', label: 'Sincronizar conta Meta', default: true }, { id: 'meta_leads_pull', label: 'Importar Lead Ads' },
      { id: 'credential_refresh', label: 'Renovar credencial' }, { id: 'account_health_check', label: 'Verificar conta' },
    ],
    commands: [
      { id: 'meta.connect', label: 'Conectar Meta', action: 'manage', resource: 'integration' },
      { id: 'meta.sync.account', label: 'Sincronizar conta Meta', action: 'execute', resource: 'integration', capability: 'pages', jobType: 'meta_account_sync' },
      { id: 'meta.pull.leads', label: 'Importar Lead Ads', action: 'execute', resource: 'integration', capability: 'lead_ads', requiredScopes: ['leads_retrieval'], jobType: 'meta_leads_pull' },
    ],
    featureFlags: [{ key: 'oauth_connect', label: 'OAuth', defaultEnabled: true }, { key: 'lead_ads', label: 'Lead Ads', defaultEnabled: true }],
    lifecycleHooks: ['beforeConnect', 'afterConnect', 'beforeSync', 'afterSync', 'onError'],
  }),
  manifest({
    id: 'whatsapp-cloud', version: '1.0.0', label: 'WhatsApp Cloud', providerId: 'whatsapp_cloud', oauthProvider: 'whatsapp_cloud', kind: 'oauth', enabledByDefault: true,
    description: 'WhatsApp Business Platform oficial com templates, mensagens e status.',
    scopes: [
      { id: 'business_management', label: 'Gerenciar Business', permissionAction: 'manage' },
      { id: 'whatsapp_business_management', label: 'Gerenciar WhatsApp Business', permissionAction: 'manage' },
      { id: 'whatsapp_business_messaging', label: 'Enviar mensagens oficiais', permissionAction: 'execute' },
    ],
    capabilities: [
      { id: 'messages', label: 'Mensagens oficiais' }, { id: 'templates', label: 'Templates aprovados' },
      { id: 'delivery_status', label: 'Entrega e leitura' }, { id: 'webhooks', label: 'Eventos WhatsApp' },
    ],
    jobs: [
      { id: 'whatsapp_account_sync', label: 'Sincronizar conta WhatsApp', default: true }, { id: 'whatsapp_template_sync', label: 'Sincronizar templates' },
      { id: 'credential_refresh', label: 'Renovar credencial' }, { id: 'account_health_check', label: 'Verificar conta' },
    ],
    commands: [
      { id: 'whatsapp.connect', label: 'Conectar WhatsApp Cloud', action: 'manage', resource: 'integration' },
      { id: 'whatsapp.sync.account', label: 'Sincronizar WhatsApp', action: 'execute', resource: 'integration', capability: 'messages', jobType: 'whatsapp_account_sync' },
      { id: 'whatsapp.sync.templates', label: 'Sincronizar templates', action: 'execute', resource: 'integration', capability: 'templates', requiredScopes: ['whatsapp_business_management'], jobType: 'whatsapp_template_sync' },
      { id: 'whatsapp.send.message', label: 'Enviar mensagem oficial', action: 'execute', resource: 'integration', capability: 'messages', requiredScopes: ['whatsapp_business_messaging'] },
    ],
    featureFlags: [{ key: 'official_messaging', label: 'Mensageria oficial', defaultEnabled: true }, { key: 'template_sync', label: 'Templates', defaultEnabled: true }],
    lifecycleHooks: ['beforeConnect', 'afterConnect', 'beforeSync', 'afterSync', 'onError'],
  }),
  manifest({
    id: 'realtalent-connect', version: '1.0.0', label: 'RealTalent Connect', providerId: 'realtalent_connect', kind: 'voice', enabledByDefault: true,
    description: 'Bridge de telefonia RealTalent, pareamento móvel e One-Tap para iPhone.', scopes: [],
    capabilities: [
      { id: 'call_dispatch', label: 'Disparo de chamadas' }, { id: 'mobile_presence', label: 'Presença do celular' },
      { id: 'one_tap_ios', label: 'One-Tap iPhone' }, { id: 'power_queue', label: 'Fila de ligações' },
    ], jobs: [],
    commands: [
      { id: 'realtalent_connect.call', label: 'Iniciar chamada', action: 'execute', resource: 'call', capability: 'call_dispatch' },
      { id: 'realtalent_connect.test', label: 'Testar conexão', action: 'manage', resource: 'call', capability: 'mobile_presence' },
    ],
    featureFlags: [{ key: 'one_tap_ios', label: 'One-Tap iPhone', defaultEnabled: true }, { key: 'power_queue', label: 'Power Queue', defaultEnabled: true }],
    lifecycleHooks: ['beforeSync', 'afterSync', 'onError'],
  }),
  manifest({
    id: 'realtalent-capture', version: '1.0.0', label: 'RealTalent Capture', providerId: 'realtalent_capture', kind: 'browser-extension', enabledByDefault: true,
    description: 'Extensão de garimpo para Maps, pesquisa, Instagram e CNPJ.', scopes: [],
    capabilities: [
      { id: 'google_maps', label: 'Captura Google Maps' }, { id: 'google_search', label: 'Captura Google Search' },
      { id: 'instagram', label: 'Captura Instagram' }, { id: 'cnpj', label: 'Enriquecimento CNPJ' },
    ], jobs: [],
    commands: [
      { id: 'realtalent_capture.ingest', label: 'Receber captura', action: 'execute', resource: 'integration' },
      { id: 'realtalent_capture.retry', label: 'Reprocessar captura', action: 'manage', resource: 'integration' },
    ],
    featureFlags: [{ key: 'guided_review', label: 'Revisão guiada', defaultEnabled: true }, { key: 'remote_settings', label: 'Configuração remota', defaultEnabled: true }],
    lifecycleHooks: ['onEnable', 'onDisable', 'onError'],
  }),
]
