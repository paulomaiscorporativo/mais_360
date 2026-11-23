# ADR 0004 — Efeito da situação do assinante no console e nas áreas públicas

**Status:** aceita · 23/11/2026

## Contexto

O assinante (`Workspace`) pode estar em teste, ativo, com pagamento pendente, suspenso ou
cancelado. A plataforma precisa de um efeito previsível para cada situação, aplicado no
servidor, sem espalhar verificações pelas dezenas de Server Actions. Ao mesmo tempo, os
clientes do assinante têm participantes de eventos e viajantes que não sabem nada da relação
comercial entre o assinante e a plataforma.

## Decisão

| Situação         | Console do assinante                        | Áreas públicas dos clientes                |
| ---------------- | ------------------------------------------- | ------------------------------------------ |
| Em teste / Ativo | completo                                    | no ar                                      |
| Pagamento pend.  | completo, com faixa de aviso                | no ar                                      |
| Suspenso         | **somente leitura e exportação**, com faixa | **no ar** (portais, convites, credenciais) |
| Cancelado        | **sem acesso** (tela explicando o motivo)   | **fora do ar** (404)                       |

- **Ponto único de checagem.** `requireWorkspace` e `requireTenant` (`server/auth.ts`) chamam
  `enforceWorkspaceStatus`. Toda Server Action criada com `defineAction` roda marcada como
  escrita (`AsyncLocalStorage`, `server/write-scope.ts`); com o assinante suspenso, a checagem
  recusa com mensagem clara. Actions que só consultam declaram `{ readOnly: true }`; a action
  de upload de marca e a rota de upload de documentos usam `asWrite`. Páginas e rotas de
  exportação (GET) nunca são escrita, então consultar e exportar continua funcionando.
- **Superadmin** da plataforma pode gravar num assinante suspenso (correções assistidas). O
  suporte (SUPPORT) só consulta.
- **Suspenso mantém as áreas públicas no ar.** Participantes de um evento em andamento,
  viajantes com voo marcado e convidados com QR impresso não podem ser prejudicados por uma
  pendência comercial. Inscrições públicas, RSVP, portais do viajante, da empresa e do
  associado e a credencial com QR continuam; jobs já enfileirados (campanhas, lembretes)
  também. O check-in pelo **balcão do console** é escrita e fica bloqueado: durante um evento
  ao vivo, prefira "pagamento pendente" a suspender.
- **Cancelado tira as áreas públicas do ar** (`resolvePublicTenant` devolve nada → 404) e o
  certificado deixa de ser emitido para os subdomínios dos clientes. Os dados ficam guardados;
  reativar devolve tudo.
- Toda mudança exige motivo, é feita pelo superadmin na página do assinante e grava `AuditLog`
  (`workspace.status.change`, com de/para e motivo). Regras de transição em
  `@mais/core/workspaces`.

## Consequências

- Uma nova Server Action fica protegida sem código extra, desde que use `defineAction` e
  `requireWorkspace`/`requireTenant` (o que já é a convenção). Action que só lê e precisa
  funcionar com o assinante suspenso deve declarar `{ readOnly: true }`.
- Rotas HTTP que gravam (POST/PUT/DELETE) fora do `defineAction` precisam de `asWrite`.
- A interface não esconde os botões no modo somente leitura: a faixa avisa e o servidor
  recusa com mensagem em português.
