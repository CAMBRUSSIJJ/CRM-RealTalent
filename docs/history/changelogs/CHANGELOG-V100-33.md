# Changelog V100.33 — Localização Real e Geocodificação

- Estrutura de endereço separada em CEP, rua, número, complemento, bairro, cidade, estado e país.
- Novos campos de latitude, longitude, status, precisão, provedor e data de geocodificação.
- Fila de localizações pendentes dentro do Mapa Comercial.
- Processamento individual e em massa.
- Correção manual do endereço e do ponto geográfico.
- Marcadores identificam posições exatas, aproximadas e estimadas.
- Migration e trigger para invalidar coordenadas quando o endereço muda.
- Edge Function `geocode-lead` com autenticação, autorização por organização e persistência segura.
- Compatibilidade com leads antigos e fallback local sem dependência externa.
