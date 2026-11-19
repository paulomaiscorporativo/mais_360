# Plataforma Mais — convenções de engenharia

SaaS multiempresa de gestão de viagens e eventos da Mais Corporativo. Leia
`docs/BLUEPRINT.md` antes de qualquer mudança estrutural. Decisões de arquitetura
ficam em `docs/adr/`.

## Estrutura

```
apps/web        Next.js 16 (App Router). Telas, Server Actions, rotas de API.
apps/worker     Processo contínuo: fila de jobs, disparos, réguas, expirações.
packages/db     Prisma (schema dividido por módulo em prisma/schema/*.prisma) + cliente.
packages/core   Regras de negócio PURAS (sem I/O, sem Prisma, sem Next). 100% testáveis.
services/face   Serviço de reconhecimento facial (isolado; dado sensível).
docs/           Blueprint, ADRs, guias de deploy.
```

Antes de usar qualquer API do Next.js 16, leia o guia correspondente em
`node_modules/next/dist/docs/` — esta versão tem mudanças que divergem do que
modelos de IA costumam saber.

## Hierarquia multiempresa (inviolável)

`Plataforma → Workspace (assinante) → Tenant (cliente) → Project`

- Toda tabela de negócio tem `tenantId`. Toda consulta filtra por ele.
- Acesso a dados de negócio só pela camada com escopo (`tenantDb(ctx)` em apps/web/src/server);
  nunca `prisma.x.findMany()` solto em página ou action.
- Permissão de módulo/recurso só via `@mais/core/modules` (`activeTenantModules`,
  `enabledProjectFeatures`). Checar no servidor, não só esconder na tela.
- Nunca fork por cliente. Diferenças entre clientes são DADOS (branding, termos,
  módulos, configurações), não código.

## Banco

- Um arquivo `.prisma` por módulo. `core.prisma` é o núcleo; só altere com motivo.
- Estados finitos → `enum`. Dinheiro → centavos `Int` + `currency`. Datas → UTC.
- Fuso de exibição vem do projeto (`Project.timezone`) ou do cliente — nunca do servidor.
- Toda mudança de schema gera migração (`npm run db:migrate`), revisada no PR.
- Segredos guardados no banco (SMTP, tokens) são cifrados com `ENCRYPTION_KEY`.

## Código

- TypeScript estrito (`noUncheckedIndexedAccess`). Sem `any`; sem `@ts-ignore`.
- Validação de entrada com zod na borda (Server Action, rota, job).
- Server Actions devolvem `{ ok: true, data } | { ok: false, error }` — nunca lançam
  para a interface. Mensagens de erro em português, que o usuário entenda.
- Regras de negócio vão para `packages/core` com teste. A action só orquestra.
- Efeitos assíncronos (e-mail, WhatsApp, PDF pesado) viram `Job`; a action enfileira.
- Idempotência: todo envio de mensagem tem `dedupeKey`; todo job repetível, `uniqueKey`.
- Auditoria: ações relevantes gravam `AuditLog` (quem, o quê, em qual entidade).
- Nomes de código em inglês; textos de interface, comentários e docs em português
  com acentuação correta.

## Interface

O produto precisa parecer premiado, não "feito por IA". Siga `docs/DESIGN.md`.

- Mobile-first e totalmente responsivo. Telas de operação (balcão, leitor, totem,
  área do participante) são desenhadas primeiro para toque.
- Só componentes do design system (`apps/web/src/components/ui`). Cores, raios,
  sombras e espaçamentos via tokens — nunca valores soltos.
- Toda tela tem estados de carregamento, vazio e erro desenhados.
- Proibido: gradientes roxos genéricos, emojis decorativos, grades de cards
  idênticos sem hierarquia, textos de marketing vazios.
- Acessibilidade AA: contraste, foco visível, rótulos, navegação por teclado.

## Qualidade

- `npm run check` (formatação, lint, tipos, testes) precisa passar antes de commit.
- Testes: unidade em `packages/core` (vitest); integração com banco nos módulos críticos
  (fila de mensagens, check-in, trava de stand).
- Commits pequenos, no imperativo, em português: "Adiciona régua de lembrete D-1".
