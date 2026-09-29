# Portais Premium no Cloudflare

Worker responsável pelas áreas do Cliente e do Parceiro. O token do Airtable e os códigos de acesso nunca são enviados ao navegador.

## Rotas

- `/cliente`: login e acompanhamento individual do cliente.
- `/parceiro`: login separado do parceiro.
- `/parceiro/painel`: processos associados ao parceiro pelo campo `Indicação`.

## Configuração concluída

- Workers `premium-portais` e `premium-administracao` publicados.
- Namespace KV configurado para armazenar hashes e bloqueios.
- Turnstile configurado nas telas de acesso.
- Segredos cadastrados diretamente na Cloudflare, sem gravação no repositório.
- Administração protegida pelo Cloudflare Access.
- Acessos de cliente e parceiro validados.

## Publicação

- Portal do cliente: `https://premium-portais.premium-assessoria.workers.dev/cliente`
- Portal do parceiro: `https://premium-portais.premium-assessoria.workers.dev/parceiro`
- Administração: `https://premium-administracao.premium-assessoria.workers.dev/administracao`

## Segredos obrigatórios

- `AIRTABLE_TOKEN`
- `CODE_PEPPER`
- `SESSION_SECRET`
- `ADMIN_SECRET`
- `TURNSTILE_SECRET`

O plano completo está em `../PORTAIS-IMPLEMENTACAO.md`.
