# Implantação das áreas do Cliente e do Parceiro

Este documento preserva o plano de implantação dos portais conectados ao Airtable.

## Concluído

- Área do Cliente com consulta em tempo real à tabela `Andamento`.
- Exibição de nome, banco, valor, status, observações, analista e jornada do processo.
- Área do Parceiro separada, vinculada pelo campo `Indicação`.
- Resumo, filtros, valor total e detalhes dos processos indicados.
- Campos de acesso do parceiro em `Carteira de Negócios`: `E-mail` e `Acesso ao portal`.
- Autenticação do cliente por CPF e código individual.
- Autenticação do parceiro por e-mail e código individual.
- Códigos aleatórios armazenados somente como hash no Cloudflare KV.
- Sessões separadas, seguras e com expiração de 20 minutos.
- Token do Airtable armazenado somente como segredo do Cloudflare Worker.
- Limite de tentativas e proteção Cloudflare Turnstile.
- Rotas públicas `/cliente`, `/parceiro` e `/parceiro/painel`.
- Administração protegida pelo Cloudflare Access para gerar, trocar e bloquear códigos.
- Testes de isolamento de dados, celular e computador.
- Links das áreas do Cliente e do Parceiro no menu do site institucional.

## Endereços atuais

- Cliente: `https://premium-portais.premium-assessoria.workers.dev/cliente`
- Parceiro: `https://premium-portais.premium-assessoria.workers.dev/parceiro`
- Administração: `https://premium-administracao.premium-assessoria.workers.dev/administracao`

## Publicação no domínio próprio

Os portais já funcionam nos endereços da Cloudflare. Como evolução de apresentação, eles podem receber endereços próprios do domínio `assessoriapremium.com.br` quando o DNS do domínio estiver disponível na conta Cloudflare.

## Fora da primeira versão

- Envio ou validação de códigos pelo WhatsApp/Journey.
- Painel administrativo completo de acompanhamento dos processos; a primeira versão administra os códigos de acesso.

Até que o WhatsApp seja integrado, os códigos serão entregues individualmente pela Premium.
