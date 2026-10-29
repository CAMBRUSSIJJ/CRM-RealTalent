# RealTalent CRM — Configurações S1/S2 (29/10/2026)

## Objetivo
Padronizar o layout das 16 áreas de Configurações sem remover capacidades e
automatizar as ações seguras com confirmação real de gravação.

## O que foi entregue
- CSS exclusivo das Configurações: fontes legíveis (rótulos e campos normalmente
  13–14px), espaçamento consistente, controles maiores e adaptações responsivas.
- Ajuda contextual curta em todas as 16 seções, com indicação do escopo afetado.
- Minha Conta simplificada: controles de tema/densidade não ficam duplicados;
  botão leva à Aparência.
- Aparência e Navegação: prévia preservada, gravação automática após 1,1s sem
  edição, com opção de desativar. A preview da sidebar mostra o nome real.
- As demais configurações do workspace (comercial, empresa, segurança, integração)
  continuam exigindo confirmação explícita.
- Páginas, Experiência e Notificações continuam usando o autosave específico do
  contexto individual. Notificações do navegador têm teste opt-in quando a
  permissão já foi concedida.
- Lead Score e Deal Intelligence: pesos e limites avançados recolhidos por padrão
  (details nativo); bloqueia peso total zero ou faixas não crescentes antes de
  salvar. Padrões de scoring agora são objetos independentes entre instâncias.
- IA: healthcheck real do gateway Ollama/modelo e botão Verificar; descrição
  estática não é usada como indicador de disponibilidade.
- Diagnóstico do workspace: seção sob demanda que verifica Ollama, Garimpo,
  gateway de Comunicação e gateway de Mapas. Resultado descreve serviço, não
  sucesso de busca, mensagem ou sincronização.
- Persistência confiável: novo savePreferencesChecked espera confirmação da
  operação remota antes de apresentar sucesso; erro fica visível, com botão
  de tentar novamente. A API antiga é preservada para compatibilidade.
- Backup: restauração de registros antes das preferências. Falha posterior das
  preferências é relatada como restauração parcial; não como perda total.
- Restaurar padrões usa o mesmo caminho confirmado de persistência, não apenas
  remoção do cache local.

## Fluxos de salvamento
- Ajustes individuais: persistência do contexto Experience, independente.
- Visual do workspace: autosave com debounce (pode desligar), prévia imediata.
- Empresa, regras comerciais, permissões e segurança: aplicar explicitamente.
- Integrações/serviços: chamadas e confirmações nativas do respectivo provider.
- Operações destrutivas: confirmação separada, nunca automatizada.

## Limitações
- Não foi realizado teste de interface gráfica no computador do usuário. QA de
  responsividade real deve ser feito no Firefox (1280×720 e full HD).
- Sincronização depende da presença real do Supabase; modo local é informado.
- O status do WhatsApp e do Mapa indica apenas disponibilidade dos respectivos
  gateways; canal/número e precisão da busca ainda precisam ser testados neles.
- O reset remoto exige permissão de configuração; bloqueio será mostrado.
- Notificação de teste depende de permissão do navegador e não envia WhatsApp/e-mail.
- Não reestrutura fluxos de equipes nem muda políticas de CRM sem autorização.

## QA automatizada
Workflow: .github/workflows/garimpo-g1g2-qa.yml
91 testes Vitest + 18 Node, TypeScript, sintaxe, instaladores e build.
CI: https://github.com/CAMBRUSSIJJ/CRM-RealTalent/actions/runs/40895751540

## Linux (branch independente)
- Branch: feat/realtalent-settings-s1s2-automation-ux-20261029
- Inicializador: scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh
- Endereço CRM: http://127.0.0.1:4197
- A V6.4 na porta 4196 continua intocada.
- PR #20 sobre a PR #19 (R1), ambas sem merge em production.

## Aceite manual
1. Navegar pelas 16 seções; validar fontes e espaçamento em 1280×720.
2. Alterar cor em Aparência; aguardar salvamento; recarregar e conferir.
3. Alterar Navegação com autosave desligado; verificar barra de alterações.
4. Desligar Supabase durante Aplicar; verificar erro em vez de sucesso falso.
5. Reiniciar e comparar preferências após Restaurar padrões.
6. Testar notificação do navegador (com permissão).
7. Verificar Ollama desligado e ligado no painel AI.
8. Abrir Diagnóstico; verificar Garimpo/WhatsApp/Mapas disponíveis ou não.
9. Testar backup válido e inválido; certificar que falha não muda preferências.
10. Confirmar que regras comerciais não são salvas automaticamente.
