# G4.6 — Investigar Instagram com Ollama local (sem API da Meta)

Status: PR #78, prévia local; **não publicado em Production**. A integração não autentica Instagram.

## Pesquisa de perfil e evidências públicas

No CRM: **Garimpo → Revisar → Guiada → Empresa → Pergunte à IA sobre esta empresa → Instagram público**.

Fluxo:
1. Garimpo (4319) encontra resultados públicos indexados por nome/cidade.
2. O Agent (8791) consulta, em até três URLs por investigação, HTML público acessível
   usando HTTPS com DNS público validado, limites de bytes e redirecionamentos seguros.
3. Cada referência ganha um grau de leitura:
   - `snippet`: resultado indexado, sem leitura de página;
   - `metadata`: título e metadados publicamente disponíveis;
   - `page`: trecho de texto realmente recuperado do HTML público.
4. O Qwen3 8B do Ollama analisa as fontes. O prompt exige separar fatos,
   hipóteses e limitações e citar os identificadores de fonte.

### Limites

A Meta pode exigir login ou impedir leitura por HTML. O RealTalent **não**
contorna esses bloqueios, nem acessa endpoints privados ou baixa o feed inteiro.
Não lê Stories privados, comentários restritos, todas as imagens, métricas privadas
ou vídeos. Quando a página bloqueia a leitura, informa que usou apenas snippets.

O código não utiliza API oficial do Instagram, credenciais Meta, APIs pagas de IA
ou scraping autenticado. Somente nome e cidade são enviados ao buscador;
as evidências de sites públicos chegam ao Ollama local.

## Captura de tela do Instagram (opcional)

A mesma seção permite escolher um arquivo **PNG, JPEG ou WebP com até 2 MB**.
A imagem é enviada **apenas ao Ollama em 127.0.0.1:11434**, via Agent local em
8791, para identificar detalhes visíveis e hipóteses comerciais. Ela não é salva,
enviada à Meta nem aprova sinais G4.

Para habilitar visão no Linux, instale opcionalmente um modelo separado:

```bash
ollama pull qwen2.5vl:3b
ollama list
```

É uma imagem de modelo com aproximadamente 3,2 GB em disco, disponível em
https://ollama.com/library/qwen2.5vl:3b.
O modelo é verificado antes do processamento; o sistema não baixa modelos
automaticamente. Sem o modelo, a pesquisa textual com Qwen3 8B continua funcionando.
O runtime usa `keep_alive:0` após análise visual para liberar memória;
em computadores com memória limitada, uma execução pode ser mais lenta.

Não é necessário configurar Meta for Developers. Essa opção **não representa
uma leitura automática integral do Instagram**.

## Verificar serviços locais

```bash
curl --noproxy '*' -fsS http://127.0.0.1:4319/api/prospecting-agent/health
curl --noproxy '*' -fsS http://127.0.0.1:8791/tools/company-ask/status
ollama list
```

O status do Agent deve indicar `company-assistant-g46`. Para atualizar,
utilize `~/Downloads/RealTalent-G43/start-linux.sh` com a prévia antiga
5174 encerrada. Não interrompa WAHA nem o banco principal.

## Garantias

- **Modo de consulta apenas**: não cria registros, não altera o Pipeline,
  não envia mensagens e não aprova gatilhos automaticamente.
- Fontes e capturas não equivalem à comprovação da identidade da empresa.
- Todas as fontes podem ser conferidas pelo usuário antes de qualquer revisão G4.
