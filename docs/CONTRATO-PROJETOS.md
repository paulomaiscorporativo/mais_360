# Contrato dos projetos — base da Onda 2

Como um módulo de projeto (voos, hospedagem, convites, mesas, credenciamento,
totens, stands…) se pluga na plataforma. Siga isto e o módulo herda acesso,
navegação, escopo de cliente e 404 corretos sem tocar no núcleo.

## 1. Rotas

```
/console/[ws]/clientes/[tenant]/projetos              lista + "Novo projeto"   ((gestao)/projetos)
/console/[ws]/clientes/[tenant]/projetos/novo         assistente de criação
/console/[ws]/clientes/[tenant]/projetos/[project]/   layout do projeto (cabeçalho + navegação)
    (page)            visão geral
    inscricoes/       inscrições
    formulario/       formulário público (recurso REGISTRATION_FORM)
    configuracoes/    dados, recursos, categorias, grupos, banner, arquivar
    <seu-modulo>/     ← a Onda 2 cria aqui (ex.: voos/, convites/, credenciamento/)
```

O layout do cliente (`clientes/[tenant]/layout.tsx`) só faz a checagem de acesso;
cabeçalho e abas do cliente ficam em `(gestao)/layout.tsx`. O projeto tem
cabeçalho próprio em `projetos/[project]/layout.tsx`.

**404 real:** não há `loading.tsx` acima dos layouts que checam acesso. Se o seu
módulo quiser esqueleto de carregamento, coloque `loading.tsx` DENTRO da pasta do
módulo e faça a checagem (`requireProjectFeature`) no `layout.tsx` do módulo, não
na página — assim o 404 acontece antes do streaming. Componente pronto:
`PageSkeleton` em `components/shell/page-skeleton.tsx`.

## 2. Acesso — `apps/web/src/server/projects.ts`

```ts
// Página / layout (acesso negado ou inexistente → 404):
const p = await guard(requireProjectFeature(ws, tenant, project, "FLIGHTS"));
// ou, sem exigir recurso:
const p = await guard(requireProject(ws, tenant, project));

// Server Action (permissão de edição: ADMIN, MANAGER ou OPERATOR):
const p = await requireProjectWriter(tenantSlug, projectId);
```

`ProjectContext` traz:

| Campo                                          | O que é                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `p.db`                                         | Prisma **escopado ao cliente** (injeta `tenantId`). Use sempre; filtre por `projectId: p.projectId`. |
| `p.project`                                    | O projeto (com `features`). `p.project.timezone ?? p.tenant.timezone` é o fuso.                      |
| `p.features`                                   | Recursos ligados (toggle ∩ módulos contratados).                                                     |
| `p.available`                                  | Recursos que o projeto poderia ligar.                                                                |
| `p.modules`                                    | Módulos ativos do cliente.                                                                           |
| `p.canEdit`                                    | Papel permite editar.                                                                                |
| `p.viewer`, `p.tenant`, `p.role`, `p.tenantId` | Do `requireTenant`.                                                                                  |

`requireProject` é memoizado por requisição (`cache`): chamar no layout e na
página custa uma consulta só.

## 3. Navegação — `apps/web/src/config/project-nav.ts`

Cada módulo **acrescenta** (ou já tem) uma entrada em `PROJECT_NAV`:

```ts
{ key: "flights", label: "Voos", href: "/voos", icon: Plane, feature: "FLIGHTS", ready: true },
```

A entrada aparece só quando o recurso está ligado. As entradas da Onda 2 já estão
lá com `ready: false`: ao entregar a página, troque para `true`. Não mude a ordem
das existentes.

## 4. Inscrições — o vínculo pessoa ↔ projeto

- Pessoa: cadastro único por cliente. Crie/encontre SEMPRE por
  `upsertPerson(p.db, p.tenantId, input)` (`server/people.ts`): deduplica por
  CPF > e-mail > telefone (regra pura `findDuplicate` em `@mais/core/people`) e
  preenche só campos vazios.
- Inscrição (`Registration`): `token` (segredo dos links) e `shortCode` (6 dígitos,
  único no projeto). Gere com `newRegistrationToken()` e
  `await shortCodeAllocator(p.db, projectId)` (devolve uma função; chame uma vez
  por inscrição do lote).
- Papel (`role`), status, categoria (`RegistrationCategory`), grupo (`ProjectGroup`)
  e acompanhante (`companionOfId`) já existem; convites, voos, mesas etc.
  referenciam `registrationId`.
- Status e rótulos compartilhados: `projetos/[project]/inscricoes/status.ts`.

## 5. Links públicos — `apps/web/src/server/public-links.ts`

| Função                                       | URL                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `tenantPublicBase(tenant)`                   | `https://<cliente>.mais.tur.br` (produção) · `APP_URL/t/<slug>` (dev) |
| `publicFormUrl(tenant, project.publicToken)` | `<base>/i/<publicToken>` — formulário de inscrição                    |
| `credentialUrl(tenant, registration.token)`  | `<base>/c/<token>` — **conteúdo do QR** do crachá/convite             |

A página `/c/<token>` (credencial digital) é do módulo de credenciamento/convites.
O motor de comunicação já usa o mesmo formato no campo `{{link_cracha}}`.

## 6. Configurações do projeto (`Project.settings`, Json)

Validadas por `projectSettingsSchema` / `readProjectSettings` em `@mais/core/projects`.
Hoje: `settings.form` (formulário público). Um módulo que precise de configuração
acrescenta a **própria chave** ao schema (ex.: `invites`), sempre com `default`,
e grava com `{ ...readProjectSettings(raw), invites: … }` — nunca sobrescreva o objeto.

## 6.1 Ordenação das listas (`settings.sorting`)

Toda saída em lote (relatórios, CSV, documentos, check-in, vouchers, rooming) usa a
mesma regra: `@mais/core/sorting` (`SortSpec`, presets, `sortRegistrations`,
`groupRegistrations`). Cascata: plataforma (`PLATFORM_DEFAULT_SORT`, empresa › nome)
→ cliente (`Tenant.settings.sorting`) → projeto (`Project.settings.sorting`) →
escolha na hora (`?ordem=<SortSpec em JSON>`). No servidor:

```ts
const sorting = await projectSorting(p, sortParam(url)); // spec efetivo + avisos
const regs = await p.db.registration.findMany({ where, include: SORT_ROW_INCLUDE });
const ids = sortRegistrations(regs.map(toSortRow), sorting.spec).map((r) => r.id);
```

Campos sem recurso no projeto (mesa sem `TABLES`, empresa da cota sem `INVITES`,
categoria/grupo inexistentes) são descartados com aviso. Na tela, `BatchSortBar`
(`components/sorting`) mostra o padrão efetivo e leva a escolha nos links.

## 7. Arquivos

- Upload: `saveUpload({ tenantId, file, kind: "image" | "pdf" | "document", visibility, uploadedBy })`
  (`server/files.ts`) — tipo conferido pelo conteúdo, SHA-256, tamanho máximo por tipo.
- Leitura: `/api/files/<id>` — `PUBLIC` sem login (logo, banner); `PRIVATE` só com
  sessão de quem acessa o cliente. Documento de passageiro, anexo, contrato: `PRIVATE`.
- Armazenamento atrás de `StorageDriver` (`server/storage.ts`): disco em `STORAGE_DIR`
  hoje, S3 compatível depois.
- Server Actions aceitam até 6 MB (`next.config.ts`).

## 8. Comunicação

Mensagem transacional: `sendTransactional(prisma, { tenantId, projectId, registrationId,
channels, reason, purpose | template })` de `@mais/messaging` — idempotente por
`reason` + inscrição + canal. Exemplo em `app/t/[tenantSlug]/i/[token]/actions.ts`
(credencial após inscrição pública). Status de entrega chegam por
`/api/webhooks/whatsapp/{evolution|meta}`.

## 9. Erros com campos

`throw invalidFields({ "data.email": "E-mail inválido." })` (`server/errors.ts`) dentro
de um `defineAction` devolve `{ ok: false, error, fieldErrors }` para a tela.
