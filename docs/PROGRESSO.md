# Progresso — Mais 360

Registro de onde o desenvolvimento está, para retomar sem perda (inclusive após
interrupção por limite de uso). Atualizado a cada etapa concluída.

## Estado em 18/11/2026, 23:55

### Concluído e integrado no `main`
- Fundação do monorepo, CI, ADRs 0001–0003, `CLAUDE.md`, `docs/DESIGN.md`, `docs/BLUEPRINT.md`.
- **Frente 2 — Comunicação:** `packages/core/src/messaging`, `packages/core/src/crypto`,
  `packages/messaging`, `apps/worker`. 22 testes de integração (banco `mais_test_messaging`).
- **Frente 3 — Documentos:** `packages/core/src/documents`, `packages/documents`, `documents.prisma`.
- **Frente 4 — Domínios:** 7 schemas de domínio, `packages/core/src/catalog`, `docs/MAPEAMENTO-LEGADO.md`.
- Migrações: `inicial`, `dominios`, `documentos`, `comunicacao_remetente` (banco `mais_dev`, porta 5433).
- 98 testes unitários passando; tipagem limpa em core, db, documents, messaging e worker.

### Em andamento
- **Frente 1 — Interface e console**: worktree `C:\Users\Mais Corporativo\plataforma_mais_wt\frente-1`,
  branch `frente-1` (commits pequenos). Escopo: design system, shell responsivo, autenticação,
  resolução de cliente por hostname, console (superadmin, assinante, assistente de cliente), seed.
  Instruções recebidas depois do início: nome **Mais 360** em constante única
  (`apps/web/src/config/product.ts`), console em `360.mais.tur.br` (`CONSOLE_HOST`), clientes em
  `<slug>.mais.tur.br` preservando `abiec` e `abradilanviagens`, lista de slugs reservados.

## Como retomar
1. `git -C "C:\Users\Mais Corporativo\plataforma_mais_wt\frente-1" log --oneline main..frente-1`
   e `git status` — ver o que a Frente 1 já fez.
2. Se a Frente 1 parou sem concluir: retomar a partir dos commits existentes (não refazer),
   completar o escopo acima e verificar (typecheck, lint, test, build, capturas 1440px e 390px).
3. Integrar no `main` (`git merge --no-ff frente-1`), resolver conflitos em
   `packages/core/src/index.ts` mantendo todos os exports, `npm install`, migração se houver,
   rodar tudo, remover o worktree.
4. Avisar o usuário com capturas desktop e celular, o que ficou pronto e o que falta.

## Próximas etapas (depois da interface)
- Rotas HTTP pendentes: webhook de status do WhatsApp/Meta, arquivos públicos `/api/files/<id>`.
- Telas dos módulos: comunicação (modelos, campanhas), editor visual de documentos.
- Fase 2 do roteiro: migrar a ABIEC (viagens de grupo, convites, linha direta) sobre a fundação.
- Relacionar `DocumentTemplate`/`DocumentRender` e ids de arquivo/template no Prisma.
- ESLint nos pacotes além do web.
