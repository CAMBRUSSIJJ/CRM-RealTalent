# Integração da Extensão RealTalent — V100.24

## Configuração

No CRM, abra **Configurações → Integrações**. Salve o destino, gere um token e copie o endpoint. O token aparece uma única vez e deve ficar no armazenamento privado da extensão; nunca o escreva em logs, analytics, HTML ou repositório.

## Requisição

```http
POST /functions/v1/extension-ingest
Authorization: Bearer rt_live_...
Content-Type: application/json
X-Batch-Id: captura-2026-07-19-001
X-RT-Extension-Version: 8.2.0
X-RT-Connection-Name: Chrome do vendedor
```

```json
{
  "batchId": "captura-2026-07-19-001",
  "leads": [
    {
      "externalId": "maps-place-id-ou-id-da-origem",
      "name": "Contato",
      "company": "Empresa",
      "phone": "+55 11 99999-9999",
      "email": "contato@empresa.com",
      "city": "São Paulo",
      "cnpj": "00.000.000/0001-00",
      "instagram": "@empresa",
      "website": "https://empresa.com.br",
      "sourceDetail": "Google Maps"
    }
  ]
}
```

Use um `batchId` único e estável por lote. Repetir o mesmo lote retorna o resultado anterior sem duplicar o processamento. Cada chamada aceita até 100 registros e 1 MB.

## Teste de conexão

A V8.2.0 testa o mesmo endpoint e token sem criar lead fictício:

```json
{
  "type": "connection_test",
  "source": "realtalent-capture-extension",
  "version": "8.2.0",
  "connectionName": "Chrome do vendedor"
}
```

O CRM registra o teste no histórico, atualiza o nome e a versão da instalação e retorna os limites aceitos pelo endpoint.

## Resposta

```json
{
  "accepted": true,
  "eventId": "uuid",
  "destination": "garimpo",
  "result": { "created": 0, "updated": 0, "skipped": 0, "review": 1, "errors": 0 }
}
```

- `200`: lote processado ou repetição idempotente;
- `400`: JSON inválido ou lote vazio;
- `401`: token inválido ou revogado;
- `405`: método diferente de `POST`;
- `409`: integração pausada ou etapa inicial inválida;
- `413`: limite de registros ou tamanho excedido;
- `503`: função ainda não configurada no ambiente.

## Comportamento por destino

- **Garimpo:** cria registros em revisão e preserva dados enriquecidos para validação humana.
- **CRM:** aplica etapa, responsável, prioridade, temperatura, etiquetas, próxima ação e política de duplicidade. Quando habilitado, enfileira `lead_imported` para o runner de automações.

O endpoint nunca envia WhatsApp ou e-mail. Essas ações continuam assistidas e exigem confirmação do vendedor.
