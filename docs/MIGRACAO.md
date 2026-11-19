# Migração dos portais ABIEC e ABRADILAN

Guia operacional do script `@mais/migrate` (`packages/migrate`), que leva os dados dos
portais antigos (Next.js + Prisma + SQLite) para a Plataforma Mais. A especificação campo a
campo está em [`MAPEAMENTO-LEGADO.md`](MAPEAMENTO-LEGADO.md), seção 1.

## Como funciona

- Lê o arquivo SQLite **somente para leitura** (`node:sqlite`, Node ≥ 22.13). O arquivo de
  origem nunca é alterado.
- Grava tudo numa única transação no banco de `DATABASE_URL`. Se algo falha, nada fica pela
  metade. Com `--dry-run` a transação é revertida no final e nenhum arquivo é copiado: o
  relatório mostra exatamente o que seria feito.
- **Idempotente**: o id de cada registro novo é derivado da chave de origem
  (`abiec:Passenger:<id>`) e do cliente. Rodar de novo atualiza em vez de duplicar. As chaves
  ficam em `Person.externalIds.legado`, `Registration.customFields.legado`,
  `Project.settings.legado` e `AuditLog.data.legado`.
- Pessoas são deduplicadas por cliente (CPF válido → e-mail → telefone). Associado, passageiro
  e convidado com o mesmo e-mail viram uma `Person` com várias inscrições; as fusões aparecem
  no relatório.
- **Nada é enviado**: o histórico de convites entra como enviado/falhou/ignorado, sem campanha
  e sem job. O script aborta se sobrar mensagem migrada na fila.

### Etapas (`--only`)

| Etapa          | O que grava                                                                          |
| -------------- | ------------------------------------------------------------------------------------ |
| `nucleo`       | Equipe (`User`, `Membership`), empresas (`Organization`), pessoas, vínculos          |
| `projetos`     | `Project` + recursos ligados, grupos, categorias, acesso a projetos                  |
| `inscricoes`   | `Registration` de passageiros e convidados (tokens e códigos dos convites mantidos)  |
| `voos`         | Catálogo de companhias/aeroportos (só o que falta), voos, localizadores, passageiros |
| `hospedagem`   | Hotéis, quartos (agrupados pelo número) e ocupantes                                  |
| `roteiro`      | Roteiro e checklist                                                                  |
| `mural`        | Recados                                                                              |
| `suporte`      | Chamados e mensagens                                                                 |
| `documentos`   | Documentos do projeto e do viajante (com arquivo), modelos de voucher                |
| `convites`     | Configuração do evento, empresas com cota, mesas, convites, lugares, envios, modelos |
| `linha-direta` | Solicitações de viagem, trechos, passageiros, cotações e histórico                   |
| `auditoria`    | `ActivityLog` → `AuditLog`                                                           |

As etapas fora de `--only` calculam os vínculos (ids são determinísticos) mas não gravam; por
isso uma etapa isolada exige que as anteriores já tenham rodado alguma vez.

## Antes de começar

1. **Cliente criado no console** com os módulos contratados (ABIEC e ABRADILAN já vêm no seed:
   slugs `abiec` e `abradilan`, domínios `abiec.mais.tur.br` e `abradilanviagens.mais.tur.br`).
2. **`ENCRYPTION_KEY` de produção** no ambiente: as senhas provisórias das empresas
   convidadas são cifradas com ela. Com outra chave, a plataforma não consegue mostrá-las.
3. **`STORAGE_DIR` de produção** (a pasta persistente da plataforma): os arquivos copiados vão
   para `<STORAGE_DIR>/<tenantId>/legado/<sha256>.<ext>`.
4. Backup do PostgreSQL de destino (`pg_dump`).

## 1. Exportar do VPS

O legado roda com `DATABASE_URL="file:./dev.db"` (ou o caminho do `.env` dele) e guarda os
uploads em `STORAGE_DIR` (padrão `<app>/storage`).

```bash
# No VPS — cópia consistente mesmo com o app no ar
sqlite3 /caminho/abiec/prisma/dev.db ".backup '/tmp/abiec-$(date +%F).db'"
tar czf /tmp/abiec-storage-$(date +%F).tgz -C /caminho/abiec storage

# Na máquina que roda a migração
scp vps:/tmp/abiec-2026-12-01.db ./legado/abiec/prisma/dev.db
scp vps:/tmp/abiec-storage-2026-12-01.tgz ./legado/abiec/ && tar xzf ./legado/abiec/abiec-storage-*.tgz -C ./legado/abiec
```

Mantendo a estrutura `<pasta>/prisma/dev.db` + `<pasta>/storage`, o script acha os arquivos
sozinho; senão, informe `--files <pasta de uploads>`. Repita para a ABRADILAN.

Para a virada definitiva, coloque o portal antigo em manutenção (ou somente leitura) antes da
exportação final, para não perder inscrições feitas durante a migração.

## 2. Simular

```bash
DATABASE_URL="postgresql://…/mais_prod" npm run migrate:legacy -- \
  --source ./legado/abiec/prisma/dev.db --tenant abiec --dry-run
```

Leia o resumo no console e o JSON completo (por padrão em `tmp/migracao/`, fora do git):

- **contagens** por entidade: lidos, criados, atualizados, ignorados;
- **duplicatas fundidas** (pessoa ou inscrição que juntou dois registros antigos);
- **avisos** por tipo: dados inválidos (CPF, telefone, e-mail), conversão com perda (status
  desconhecido, fuso de aeroporto desconhecido, orçamento em texto), arquivo ausente,
  referência ausente, conflito (token, login ou endereço já usado), não migrado por regra e
  itens para revisar.

## 3. Migrar

```bash
DATABASE_URL="postgresql://…/mais_prod" npm run migrate:legacy -- \
  --source ./legado/abiec/prisma/dev.db --tenant abiec
DATABASE_URL="postgresql://…/mais_prod" npm run migrate:legacy -- \
  --source ./legado/abradilan/prisma/dev.db --tenant abradilan
```

Pode rodar de novo quantas vezes precisar (ex.: exportação mais recente na véspera da virada):
o que já existe é atualizado com os dados do legado. Pessoas que já tinham sido cadastradas na
plataforma nova só têm as lacunas preenchidas; senhas e papéis já definidos não são trocados.

## 4. Conferir

1. Relatório sem `FALHOU`, com as contagens batendo com o legado (seção `legacyCounts` do JSON).
2. Avisos de **conflito** e **arquivo ausente** tratados (ver abaixo).
3. No console: projetos, inscrições, voos (horários), quartos, convites e mesas de um evento.
4. Abrir um convite antigo pelo QR/link (`/convite/<token>`) e conferir o código curto.
5. Entrar como associado com a senha antiga e como empresa convidada com o login antigo.

## Decisões de conversão

- **Datas**: instantes (criação, confirmação, login) passam como estão. Datas de calendário
  (nascimento, validade, início da viagem, cotação) viram o dia ao meio-dia UTC, convenção da
  plataforma. Horários de voo eram gravados "de parede" como UTC: são reinterpretados no fuso
  do aeroporto (ou do projeto, com aviso). Check-in/out de hotel às 14:00/12:00 e prazo do
  checklist às 23:59 no fuso do projeto. Data-limite dos convites vale até 23:59 do dia.
- **Senhas**: hashes bcrypt de equipe, associados e empresas são reaproveitados. **PINs do
  portal do passageiro não viram senha** (o padrão era o CPF): o viajante usa o link pessoal do
  portal novo (`/v`). Senha provisória das empresas vira `provisionalPasswordEnc` cifrada.
- **Convites de primeiro acesso de associados pendentes** não são migrados: reemitir.
- **Nomes**: separados no primeiro espaço (`splitFullName` da plataforma), para que
  `{{primeiro_nome}}` e o crachá saiam certos.
- **Quartos**: passageiros com o mesmo número de quarto dividem um `Room`; sem número, um quarto
  por pessoa. O tipo vem do texto (DBL, Twin, Suíte…) ou da lotação.
- **Modelos de voucher**: recriados sobre o modelo A4 padrão do motor de documentos (os campos
  posicionados sobre PDF de fundo precisam ser refeitos no editor) — aparecem como "revisar".
- **Mensagens de convite**: `{{nome}}`, `{{evento}}`, `{{data}}`, `{{hora}}`, `{{local}}`,
  `{{endereco}}`, `{{traje}}`, `{{mesa}}`, `{{link}}`, `{{codigo}}` viram os campos novos; o
  `replyTo` vira um canal de e-mail do projeto (servidor global com o Reply-To do evento).
- **Linha direta**: protocolo `VC-<ano>-<sequência>` gerado na primeira migração e mantido nas
  seguintes; orçamento em texto livre vai para as observações.

### Avisos comuns

| Aviso                                | O que fazer                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Token do formulário/convite já usado | Outro projeto/cliente já tem o token: o link antigo não abrirá — reenviar. |
| Login de empresa já usado            | Gravado com sufixo do cliente; avisar a empresa.                           |
| Arquivo ausente                      | Conferir se o `storage` do VPS foi copiado inteiro e rodar de novo.        |
| Fuso do aeroporto desconhecido       | Cadastrar o fuso do aeroporto e rodar `--only voos`.                       |
| CPF inválido                         | Mantido como digitado, mas não usado para deduplicar.                      |

## Redirecionamento dos links antigos

Os domínios continuam os mesmos (`abiec.mais.tur.br`, `abradilanviagens.mais.tur.br`): basta
apontar o DNS para a plataforma nova. O `proxy.ts` responde com **308** para os caminhos antigos
(`apps/web/src/lib/legacy-redirects.ts`):

| Antigo                 | Novo             | Observação                                  |
| ---------------------- | ---------------- | ------------------------------------------- |
| `/convite/<token>`     | `/c/<token>`     | QR codes impressos e links enviados         |
| `/f/<formToken>`       | `/i/<formToken>` | Formulário público (token preservado)       |
| `/portal`, `/portal/…` | `/v`             | Portal do viajante (pede o link por e-mail) |
| `/empresa/login`       | `/empresa`       | Portal da empresa convidada                 |

Não redirecionados (por enquanto): `/app/…` (área do associado — depende da frente de viagens
corporativas), `/login` (equipe, que agora entra pelo console) e `/c/<código>` do
credenciamento, que será tratado na migração do credenciamento.

## Teste de integração

```bash
cd packages/db && DATABASE_URL="postgresql://mais:mais@localhost:5433/mais_migracao" npx prisma db push --skip-generate
npm run test:integration -w @mais/migrate   # usa LEGACY_ABIEC_DB (padrão: dev.db local da ABIEC)
```

O teste copia o `dev.db` para uma pasta temporária, simula, migra duas vezes e confere
idempotência, tokens, arquivos e ausência de envios. Sem o arquivo, é pulado (CI).
