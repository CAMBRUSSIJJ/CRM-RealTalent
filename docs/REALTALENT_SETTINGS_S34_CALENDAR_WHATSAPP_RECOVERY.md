# RealTalent Configurações S3.4 — Calendar e WhatsApp (29/10/2026)

Branch: fix/realtalent-settings-s34-calendar-whatsapp-20261029
Base: feat/realtalent-settings-s331-pipeline-editor-20261029
PR #24 — homologação, sem merge ou deploy Production.

## Problema observado nas capturas
- Na Agenda, a instalação estava em modo local e exibia 0 contas, 0 jobs,
  0 conflitos e botões de conexão que não podiam iniciar a sincronização
  de calendário da plataforma v100.84. Toasts HTTP 502 estavam visíveis,
  mas não é possível determinar o endpoint apenas pelas capturas.
- O WhatsApp indicava gateway indisponível, mas havia vários botões de
  recuperação e a geração de QR podia acionar uma recuperação oculta.
- O launcher Garimpo anterior iniciava 4197 + 4320 + 8804, mas não
  iniciava Communications (3002) nem Runtime Control (3003).
  O proxy Vite tem encaminhamentos a essas portas, então 502 era esperado
  quando não havia serviço escutando. Esta é uma causa concreta de falha
  de conexão, embora não prove que cada 502 tenha a mesma origem.

## Mudanças
1. Agenda local:
   - estado vazio verdadeiro em vez de KPIs vazios e lista de conflitos
   - não inicia consultas ao dashboard remoto sem backend hospedado
   - explica que Agenda interna do CRM continua utilizável
   - explica que a sincronização Google/Microsoft Calendar 2.0 exige
     Supabase, OAuth e workers. A integração local do **e-mail** via
     Communications Gateway é um produto diferente e não equivale à
     sincronização de calendário.
   - no ambiente hospedado, controles e comportamento originais preservados
2. WhatsApp:
   - único botão "Recuperar gateway", no topo
   - healthcheck HTTP do gateway como evidência de disponibilidade (não
     basta o supervisor estar em execução)
   - QR disponível somente quando o healthcheck passa
   - nenhuma tentativa implícita de restart no pedido do QR
   - erro de recuperação fica visível inline; detalhes técnicos recolhidos
     não mostram logs brutos ou possíveis credenciais
   - diagnósticos preservados, sem botão duplicado para restart
3. Mensagens:
   - HTTP 502/503 identifica falha de proxy do supervisor/gateway e recomenda
     consultar inicializador e logs, sem fingir que serviço foi restaurado.
4. Launcher local:
   - Após subir Ollama, Garimpo e gateway Qwen, a instalação tenta iniciar
     o runtime oficial com `PORT=4197` e `PROSPECTING_PORT=4320`,
     conectando services Connect 3001, Communications 3002 e Control 3003.
   - O runtime compartilha o processo do CRM na sessão atual; ao encerrá-la,
     também encerra os serviços que ele mesmo iniciou.
   - PRECAUÇÃO: se 3001, 3002 ou 3003 estiverem em uso por outra instalação,
     o script não tenta terminar ou recuperar processos de terceiros. Ele
     abre o Vite isolado e avisa sobre o funcionamento degradado.
   - Se `ss` não estiver presente, a recuperação automática não é iniciada.
   - Fallback em falhas de inicialização que não sejam interrupção explícita.
   - Pode forçar a interface antiga via
     `REALTALENT_GARIMPO_SKIP_MANAGED_RUNTIME=1`.
   - Os processos da V6.4 em 4196/4319 não são encerrados pelo script.

## Aceite obrigatório no Linux
1. Encerrar a sessão atual em 4197.
2. Executar a branch usando abrir-com-diagnostico.sh.
3. Conferir log `~/RealTalent-Garimpo-G1G2-Teste/logs/ultimo-inicio.log`,
   em particular as portas 3001, 3002, 3003 e eventuais avisos.
4. Configurações > WhatsApp: confirmar "Gateway disponível" após healthcheck,
   depois gerar QR voluntariamente.
5. Se recuperar falhar, ler detalhes e corrigir o processo local.
6. Configurações > Agenda externa: observar estado local sem botões que
   simulam conexão e ausência de KPIs inúteis.
7. Confirmar que Agenda interna e Garimpo seguem funcionando.
8. Verificar Chrome/Firefox em 1280×720 e janela ampla.
9. Testar modo Supabase hospedado separadamente, com integração real
   somente após configurar OAuth/workers.
10. Não abrir dois launchers simultâneos na mesma porta.
11. Não declarar resolvida a causa de todos os HTTP 502 sem logs reais.

## Testes automatizados
- Helpers de modo de execução, saúde do gateway e erros proxy.
- TypeScript, Vitest, Node, Vite build, bash -n do launcher.
- CI: workflow RealTalent Settings S3.4 — Calendar and WhatsApp Recovery QA.
