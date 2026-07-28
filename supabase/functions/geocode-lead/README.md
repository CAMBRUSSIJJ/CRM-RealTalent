# geocode-lead

Edge Function da V100.33 para converter endereços estruturados dos leads em latitude e longitude.

## Secret obrigatório

- `GOOGLE_MAPS_API_KEY`: chave restrita à Geocoding API.

A função exige uma sessão autenticada, valida a associação do usuário ao workspace e processa no máximo 100 leads por chamada.
