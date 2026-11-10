# RealTalent Garimpo G5.6 — descoberta de fontes públicas

A versão G5.6 amplia a descoberta de **candidatos a fonte** para pequenas empresas. O Crawl4AI continua sendo um leitor, não um buscador, e o Qwen3:8b continua local via Ollama.

## Caminho da investigação

1. O painel em **Garimpo → Revisar → Guiada** envia somente nome, cidade, segmento, descrição do cadastro e URL pública opcional ao Agent local.
2. O módulo `crm-business-source-discovery-g56.mjs` extrai o nome comercial de títulos de diretório, por exemplo `Lelo Barbershop Barbearia em Rio Grande` → `Lelo Barbershop`.
3. O Agent consulta até três variantes de busca no SearXNG local (se configurado) **em paralelo** com a pesquisa pública já existente na porta 4319. Para a pesquisa externa, são usados somente nome e cidade.
4. As URLs são deduplicadas e ordenadas, priorizando sites públicos relevantes, nomes e localidade. Um nome coincidente isoladamente não basta para verificar uma empresa.
5. URLs de perfis públicos do Instagram/Facebook aparecem como **candidatos para conferência manual**. O sistema não tenta ler postagens protegidas, contornar login/captcha ou tratar um perfil sugerido como prova de identidade.
6. Até quatro páginas HTTPS candidatas de websites são submetidas ao leitor com bloqueio de IPs privados, validação de redirecionamentos e extração pelo Crawl4AI quando habilitado.
7. A identidade e a cidade são checadas novamente no texto lido. Somente páginas compatíveis podem alimentar o Qwen e a classificação de eventos-gatilho, sempre com revisão humana.
8. Se não houver evidências confirmadas, o Qwen **não é chamado**. O CRM apresenta links para conferir e uma justificativa, sem inventar oportunidades.

## URL pública opcional

Na investigação guiada, abra **Informar site ou perfil público para conferir (opcional)**, cole uma URL HTTPS e clique em **Investigar com IA**. A URL é apenas uma entrada temporária para a próxima investigação; não altera o cadastro. Se for um site legível e compatível com o negócio, será lido. Se for um perfil social, será apresentado como referência manual, nunca como evidência confirmada.

## Limites

- O fluxo não realiza crawling recursivo de todo o site. A investigação profunda de várias páginas internas é etapa separada.
- Redes sociais podem bloquear leitura, exigir autenticação ou omitir conteúdo; não são um substituto da API oficial.
- Um domínio, resultado de busca ou página lida não comprova intenção de compra.
- Sem migrações, novas dependências pagas, alterações no WhatsApp/WAHA ou publicação automática em Production.

## Testes locais

```bash
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-business-source-discovery-g56.test.mjs
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-prospect-investigation-g1.test.mjs
npx vitest run src/services/prospecting-g53-evidence.test.ts src/services/prospecting-g55-presentation.test.ts
npm run typecheck
```

Para abrir a prévia isolada, após ativar o Agent G5.6: `bash scripts/garimpo-open-source/abrir-previa-g56.sh`. A prévia usa `127.0.0.1:4197`, não gerencia serviços de WhatsApp/WAHA e não substitui o inicializador oficial.
