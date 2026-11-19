# Progresso — Mais 360

Registro de onde o desenvolvimento está, para retomar sem perda (inclusive após
interrupção por limite de uso). Atualizado a cada etapa concluída.

## Estado em 19/11/2026

### Concluído e integrado no `main` — Fase 1 (fundação) completa
- Fundação do monorepo, CI (unitários + integração + build), ADRs 0001–0003, `CLAUDE.md`,
  `docs/DESIGN.md`, `docs/BLUEPRINT.md`, `docs/MAPEAMENTO-LEGADO.md`.
- **Frente 1 — Interface:** design system, shell responsivo, autenticação com sessão revogável,
  resolução de cliente por hostname (`proxy.ts`), console (plataforma, assinante, assistente de
  cliente, página do cliente), área pública do cliente, seed (planos, Mais Corporativo, ABIEC, ABRADILAN).
- **Frente 2 — Comunicação:** núcleo, `@mais/messaging`, `@mais/worker` (fila com SKIP LOCKED).
- **Frente 3 — Documentos:** núcleo, `@mais/documents` (PDF UTF-8, HTML térmico).
- **Frente 4 — Domínios:** 7 schemas, catálogo de serviços.
- 115 testes unitários + 22 de integração; tipagem limpa em todos os pacotes; build de produção ok.
- Rodar local: `npm run db:up`, depois `npx next start -p 3360` em `apps/web` (após `npm run build`)
  ou `npm run dev`. Login inicial: `SEED_MASTER_EMAIL` / `SEED_MASTER_PASSWORD` do `.env`.

### Pendências conhecidas da Fase 1
- Upload de arquivos (logo, banner) e rota `/api/files/<id>`.
- Rota HTTP do webhook de status do WhatsApp/Meta.
- Edição/suspensão de assinante e plano.
- Páginas bloqueadas respondem HTTP 200 (mostram "não encontrado"); ideal 404.
- Limite de tentativas de login em memória (mover para o banco ao escalar horizontalmente).
- `packages/db/src/index.ts` usa `export *` do Prisma (aviso do Turbopack).

## Fase 2 — em andamento (19/11/2026)

**Onda 1** (worktrees em `C:/Users/Mais Corporativo/plataforma_mais_wt/`):
- `a-projetos` (branch `f2-a-projetos`): projetos, pessoas, inscrições, importação, formulário
  público, arquivos `/api/files`, webhook do WhatsApp, 404 real. Contrato em `docs/CONTRATO-PROJETOS.md`.
- `b-comunicacao` (branch `f2-b-comunicacao`): telas de canais, modelos, campanhas e réguas.
- `c-documentos` (branch `f2-c-documentos`): biblioteca e editor visual de documentos.

**Onda 2** (depois da 2A): viagens de grupo, eventos e convites, linha direta/viagens
corporativas, scripts de migração de dados ABIEC/ABRADILAN.

## Como retomar
Ler este arquivo e `docs/BLUEPRINT.md` (seção 11, roteiro). Trabalho em frentes paralelas:
criar worktrees fora do projeto (`../plataforma_mais_wt/<frente>`), cada frente com arquivos
próprios, integrar com `git merge --no-ff` e rodar `npm run check` + build.

## Próximas etapas (depois da interface)
- Rotas HTTP pendentes: webhook de status do WhatsApp/Meta, arquivos públicos `/api/files/<id>`.
- Telas dos módulos: comunicação (modelos, campanhas), editor visual de documentos.
- Fase 2 do roteiro: migrar a ABIEC (viagens de grupo, convites, linha direta) sobre a fundação.
- Relacionar `DocumentTemplate`/`DocumentRender` e ids de arquivo/template no Prisma.
- ESLint nos pacotes além do web.
