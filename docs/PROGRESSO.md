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

## Fase 2 — em andamento

**Onda 1 — concluída e integrada (19/11/2026):**

- Projetos (assistente por tipologia), pessoas (dedupe, LGPD), inscrições (importação XLSX/CSV,
  lote), formulário público com QR, arquivos `/api/files`, webhook do WhatsApp, 404 real.
  Contrato da Onda 2 em `docs/CONTRATO-PROJETOS.md` (`requireProject*`, `PROJECT_NAV` com `ready`).
- Comunicação: canais, modelos, assistente de campanha com acompanhamento ao vivo, réguas (tela).
- Documentos: biblioteca e editor visual; contrato em `docs/CONTRATO-DOCUMENTOS.md`
  (`renderForRegistrations`).
- 132 testes unitários; tipos, lint e build limpos. Usuários demo: `docs/USUARIOS-DEMO.md`.

**Pendências da Onda 1:** job do worker que executa as réguas; paginação real das listas;
importação grande como job; storage dos documentos usar a camada de arquivos da 2A
(`server/files.ts`). (A credencial `/c/<token>` foi resolvida na Onda 2.)

**Onda 2 — par 1 concluído e integrado (19/11/2026):**

- `d-grupos`: voos (fuso por aeroporto, status ao vivo), hospedagem e rooming (impressão e XLSX),
  roteiro com público segmentado, checklist, mural com aviso por e-mail/WhatsApp, suporte,
  documentos do viajante (exigências, validade de passaporte), vouchers (lote > 10 vira job
  `vouchers.issue`) e portal do viajante `/t/<cliente>/v` (link pessoal por e-mail).
- `e-convites`: empresas com cota, convites, mapa de mesas (toque e teclado), convite/credencial
  `/t/<cliente>/c/<token>` com RSVP e agenda, portal da empresa `/t/<cliente>/empresa` (sessão
  COMPANY própria), check-in idempotente com leitor de QR, relatórios com CSV.
- Sem mudança de schema. 183 testes unitários + 27 de integração (22 no db, 5 de check-in no web);
  check, build limpos. Formatação de docs normalizada; `pdf.worker.min.mjs` e `next-env.d.ts`
  fora do Prettier.

**Pendências do par 1:**

- Worker sem handler de `flights.refresh`; fila `vouchers.issue` consumida pela web (mover render
  para pacote e handler para o worker).
- Suporte sem envio de anexo pela conversa; upload limitado a 6 MB na tela (limite das actions).
- Rooming impressa fora dos tokens do design system.
- Falta integração com banco para portal do viajante e vouchers.
- Convites: sem mensagem automática ao confirmar, sem reenvio pelo portal da empresa,
  recuperação de senha da empresa feita pela organização.
- Banco de dev sem projetos de viagem/evento com dados: telas não testadas com dados reais.

**Frente `f2-ordenacao` — ordenação configurável das listas (19/11/2026):**

- Regra pura `@mais/core/sorting` (SortSpec até 3 níveis, agrupamento, quebra de página,
  presets, comparação pt-BR, vazios no fim, ajuste aos recursos do projeto) com testes.
- Cascata plataforma → cliente (`Tenant.settings`, migração `configuracoes_do_cliente`) →
  projeto (`Project.settings.sorting`) → escolha na hora (`?ordem=`). Telas: aba
  "Ordenação" do cliente e seção nas configurações do projeto; `BatchSortBar` na geração.
- Aplicada em relatórios/CSV de convites (sem coluna de mesa sem `TABLES`), lista de
  check-in impressa, documentos em lote (`inscricoes/documentos`), vouchers e rooming.
- Variáveis de mensagem condicionadas a recursos (`availableMessageFields`,
  `unavailableFieldsIn`); o editor esconde as indisponíveis e avisa.

**Onda 2 — par 2 concluído e integrado (19/11/2026):**

- `f2-linha-direta` (Mais 360 Travel, viagens corporativas): regras puras em
  `@mais/core/corporate-travel` (solicitação multitrecho, protocolo `VC-AAAA-NNNNNN`, status,
  política de viagem com violações em português, aprovação por alçada em níveis, cotações
  comparáveis) com testes; console `clientes/<cliente>/viagens-corporativas` (fila com filtros,
  registro pela equipe, detalhe com responsável, cotações lado a lado com linhas por serviço,
  envio por e-mail/WhatsApp via fila, escolha em nome do solicitante, aprovação, reserva manual
  com localizadores e anexos, linha do tempo; aprovações; política e modo de aprovação; acessos
  dos associados); área do associado `/t/<cliente>/viagens` (sessão PERSON revogável, troca da
  senha provisória, minhas solicitações, nova solicitação, escolha com justificativa,
  cancelamento, documentos). Sem mudança de schema. Demo em `docs/USUARIOS-DEMO.md`.
- `f2-migracao`: pacote `@mais/migrate` (`npm run migrate:legacy -- --source <db> --tenant <slug>
[--dry-run] [--only …]`), lê o SQLite do legado só para leitura, idempotente (chave legada),
  preserva tokens/códigos dos convites, não reaproveita PIN = CPF, não dispara mensagens,
  relatório JSON em `tmp/migracao/`. Redirecionamento dos endereços antigos no `proxy.ts`.
  Guia em `docs/MIGRACAO.md`. Protocolo da linha direta usa a regra do core.
- Status de voo ao vivo: handler `flights.refresh` no worker (Apify
  `apt_marble/flight-status-tracker`, mesmo da ABIEC; uma chamada por data de operação) e
  varredura a cada 5 min dos voos de 6 h antes da partida a 2 h depois da chegada. Precisa de
  `APIFY_TOKEN` no `.env`; sem ele o worker apenas avisa e não consulta.
- 273 testes unitários + 30 de integração; check e build limpos.

**Pendências da linha direta:** aviso ao aprovador e à equipe por e-mail (o motor de comunicação
só envia a Person/inscrição; hoje eles veem na fila e na caixa de aprovações); edição da
solicitação pelo associado enquanto nova; link de aprovação por e-mail (`TravelApproval.tokenHash`);
reenvio da senha provisória por e-mail; modelos de mensagem do cliente para as finalidades
`TRAVEL_*` (hoje o texto é fixo no código); fase 6: centros de custo, várias etapas e alçadas por
valor na tela, despesas e relatórios de conformidade.

**Pendências da migração:** redirecionar `/app/…` (área do associado), `/login` e `/c/<código>`
do credenciamento; convites de associado pendentes não migram (reemitir); campos posicionados dos
vouchers refazer no editor; migração real exige exportar os bancos do VPS (`docs/MIGRACAO.md`).

**Gestão de acessos (`f3-acessos`, 23/11/2026):**

- Modelo `UserAccessToken` (migração `acessos_de_usuarios`): convite de primeiro acesso (7 dias)
  e redefinição de senha (1 hora), só o hash SHA-256 no banco, uso único; emitir outro do mesmo
  propósito revoga os abertos. Regras puras em `@mais/core/access` (validade, papéis, último
  dono/superadmin, autoridade para desativar, papel efetivo por projeto, e-mails) com testes.
- Fila `auth.email` no worker (SMTP global, nome da marca no remetente; confere se o token ainda
  vale antes de enviar). O link do convite também aparece na tela para copiar.
- Senha provisória exibida na tela foi substituída por convite em: criar assinante (dono), criar
  cliente (admin) e adicionar membro. Quem já tem conta ativa recebe só o vínculo e um aviso.
- Rotas públicas `/entrar/convite/[token]`, `/entrar/esqueci` (resposta neutra, limite por IP e
  por e-mail) e `/entrar/redefinir/[token]` (revoga as outras sessões e entra).
- Equipes: `/console/[ws]/equipe` (assinante), `/console/plataforma/equipe` (só superadmin) e a
  do cliente reformulada (situação ativo/convite pendente/desativado, reenviar convite, link de
  redefinição, desativar/reativar, acesso por projeto com papel por projeto).
- Desativar a conta só quando o admin responde por todos os vínculos da pessoa; senão remove o
  vínculo do contexto atual. Desativar derruba as sessões na hora.
- Acesso por projeto aplicado no servidor (`projectRoleFor`, `requireProjectRole`,
  `visibleProjectsWhere` em `server/projects.ts`): páginas, actions de escrita, balcão e listas.
- Auditoria: `user.invite.send/resend`, `*.member.role/remove`, `user.deactivate/reactivate`,
  `user.password.reset.send`, `auth.password.reset(.request)`, `auth.invite.accept`,
  `tenant.member.projects`.

**Pendências da gestão de acessos:** editar/suspender assinante (frente `assinantes`); MFA;
limite de tentativas em tabela para vários nós; limpeza periódica de tokens vencidos (hoje só
ficam inertes); convites de membro de cliente por domínio do cliente (hoje o link usa `APP_URL`).

**Próximo:** editar/suspender assinante (frente paralela); depois worker (réguas) e
infraestrutura de deploy (VPS).

Após cada par: integrar, gerar migração se houver mudança de schema, `npm run check` + build.

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
