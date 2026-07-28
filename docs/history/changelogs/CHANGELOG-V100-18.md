# Changelog V100.18 — Validação de Terceiros e Usabilidade

## Primeiro acesso

- nova tela de configuração antes da entrada no CRM;
- escolha entre demonstração com exemplos e uma base vazia;
- solicitação do nome do usuário, empresa e e-mail opcional;
- perfil e identidade da empresa deixam de iniciar com dados fixos da RealTalent;
- demonstração recebe datas atualizadas em relação ao dia do primeiro acesso;
- metas de exemplo são ajustadas para o mês corrente.

## Clareza do produto

- identificação visível de **Modo local**;
- remoção do botão de logout no modo sem autenticação real;
- convites de equipe deixam claro que são apenas simulações locais;
- guia rápido com o fluxo recomendado do CRM;
- versão exibida nas telas de autenticação e no título atualizada para V100.18;
- nomes de backup, exportação e artefatos alinhados à versão atual.

## Cadastro e autenticação

- senha mínima padronizada em oito caracteres;
- confirmação de senha no cadastro;
- confirmação de senha preservada na recuperação;
- perfil local persistido e sincronizado com a interface.

## Estabilidade

- reentrada no CRM após o onboarding sem recarregar a página;
- inicialização local não destrutiva;
- opção de base vazia mantém somente workspace, usuário e seis etapas padrão;
- diagnóstico, recuperação de base corrompida e auditoria da V100.17 preservados.

## Testes

- 70 testes automatizados aprovados em 16 arquivos;
- auditoria de release com 95 verificações;
- auditoria de dependências de produção sem vulnerabilidades conhecidas;
- smoke test do primeiro acesso com demonstração e base vazia;
- navegação nas 12 áreas no desktop;
- primeiro acesso e Configurações validados no celular;
- nenhum erro de console, página ou sobreposição global identificado.
