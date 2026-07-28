# Fonte oficial — RealTalent CRM V100.37

## Regra obrigatória

A única fonte oficial do produto é o repositório React + TypeScript + Vite localizado em `src/`, acompanhado de `supabase/`, testes, configurações e scripts de release.

O HTML standalone é um artefato gerado. Ele pode ser usado para demonstração, contingência e validação rápida, mas nunca deve receber correções manuais. Toda mudança funcional deve nascer no TypeScript, passar pelos testes e ser novamente compilada.

## Fluxo de alteração

1. Alterar o código-fonte TypeScript.
2. Criar ou atualizar testes.
3. Executar `npm run homologate`.
4. Revisar o relatório de homologação e o manifesto de release.
5. Publicar primeiro em homologação.
6. Promover para produção somente após aceite.

## Controles automatizados

- `guard:source`: impede patches externos e HTML tratado como fonte.
- `guard:architecture`: impede novas dependências indevidas entre interface, serviços e infraestrutura.
- `audit:database`: valida nomenclatura, checksums, RLS e funções privilegiadas.
- `homologate`: executa o gate completo e gera o candidato standalone da mesma fonte.
