# ADR 0002 — Multiempresa em três níveis

**Status:** aceita · 18/11/2026

## Contexto
A plataforma será vendida como SaaS. Agências e organizadoras que a assinarem terão os próprios
clientes; a Mais Corporativo é uma delas.

## Decisão
`Workspace (assinante) → Tenant (cliente) → Project`. Banco compartilhado com `tenantId` em todas as
tabelas de negócio e camada de acesso que injeta o filtro. Módulos: plano do assinante ⊇ módulos do
cliente ⊇ recursos do projeto, resolvidos em `@mais/core/modules`.

## Alternativas descartadas
- Banco por cliente: isolamento maior, mas operação e migrações caras para centenas de clientes.
  Fica como opção futura para planos Enterprise.
- Fork por cliente (situação atual ABIEC/ABRADILAN): divergência inevitável.
