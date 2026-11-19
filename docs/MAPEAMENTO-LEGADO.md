# Mapeamento dos sistemas legados → Plataforma Mais

Guia para os scripts de migração de dados (SQLite/MySQL → PostgreSQL). Cada
linha diz para onde vai uma tabela/campo antigo. Convenções gerais:

- Todo registro migrado recebe o `tenantId` do cliente de origem (ABIEC,
  ABRADILAN, FECOFAR, SIRAN) e, quando é de evento/viagem, o `projectId`.
- Ids antigos ficam em `Person.externalIds` / `customFields` (`{"legado":"abiec:Passenger:<id>"}`)
  para rastreabilidade e reexecução idempotente do script.
- Valores `DECIMAL`/`Float` em reais → centavos `Int` (`Math.round(v * 100)`).
- Datas locais sem fuso (SQLite `datetime('now','localtime')`, MySQL `DATETIME`)
  → interpretar em `America/Sao_Paulo` e gravar em UTC.
- Status em texto → enums (tabelas de conversão abaixo).
- **Pessoas são deduplicadas por cliente**: CPF → e-mail normalizado → telefone E.164.
  A mesma pessoa vinda de Passenger, Invite e participants vira UMA `Person` com várias `Registration`.
- Arquivos (`filePath`, `logoPath`, anexos) → copiar para o storage e criar `StoredFile`
  (sha256, mime, tamanho); o campo antigo vira `…FileId`.

---

## 1. ABIEC / ABRADILAN (Prisma, SQLite → PostgreSQL)

As duas bases têm o mesmo schema; cada uma vira um `Tenant` do workspace Mais Corporativo.

### Núcleo

| Legado | Novo | Observações |
|---|---|---|
| `User` (staff) | `User` + `Membership` | `role` MASTER → `TenantRole.ADMIN` (e `WorkspaceRole.ADMIN` para a equipe Mais); AGENTE → OPERATOR; VISUALIZADOR → VIEWER |
| `User.allTrips` / `UserTripAccess` | `Membership.allProjects` / `ProjectAccess` | |
| `Trip` | `Project` | `kind` VIAGEM → `INCENTIVE_TRIP`; EVENTO → `CORPORATE_EVENT` |
| `Trip.clientName` | `Tenant.name` | Deixa de ser texto livre |
| `Trip.status` | `Project.status` | PLANEJAMENTO→PLANNING · INSCRICOES→REGISTRATION_OPEN · EM_ANDAMENTO→IN_PROGRESS · CONCLUIDA→COMPLETED · ARQUIVADA→ARCHIVED |
| `Trip.logoPath` / `bannerPath` / `letterheadPath` | `Project.logoFileId` / `bannerFileId` / `letterheadFileId` | |
| `Trip.primaryColor` / `secondaryColor` | `Project.primaryColor` / `secondaryColor` | Se igual ao do cliente, deixar null (herda) |
| `Trip.formToken` / `formOpen` / `formWelcome` / `allowCompanion` | `Project.publicToken` + `ProjectFeatureToggle(REGISTRATION_FORM)` + `Project.settings.form` | Manter o token antigo para os links já enviados continuarem válidos |
| `Trip.invitesEnabled` / `tablesEnabled` | `ProjectFeatureToggle(INVITES)` / `(TABLES)` | |
| `Trip.venueName` / `venueAddress` / `destination` / datas | `Project.venueName` / `venueAddress` / `destination` / `startsAt` / `endsAt` | |
| `TripGroup` | `ProjectGroup` | |
| `Passenger` | `Person` + `Registration` | `type` TITULAR → `role TRAVELER`; ACOMPANHANTE → `COMPANION` com `companionOfId` |
| `Passenger.name` | `Person.firstName` / `lastName` | Separar no último espaço |
| `Passenger.email/phone/cpf/birthDate/passport*/rg/city/uf/dietary/medicalNotes/emergency*` | Campos homônimos de `Person` | `phone` → E.164; `uf` → `state` |
| `Passenger.category` | `RegistrationCategory` (criar por valor distinto) | |
| `Passenger.groupId` | `Registration.groupId` | |
| `Passenger.rsvpStatus` | `Registration.status` | PENDENTE→PENDING · CONFIRMADO→CONFIRMED · RECUSADO→DECLINED · CANCELADO→CANCELED |
| `Passenger.pin` / `pinCustom` | `Person.passwordHash` (bcrypt do PIN) + `mustChangePassword = !pinCustom` | O PIN padrão era o CPF: forçar troca |
| `Passenger.blocked` | `Registration.status = CANCELED` + nota | |
| `Passenger.formFilledAt` / `notes` | `Registration.formFilledAt` / `notes` | |
| `PassengerDocument` | `PersonDocument` | `kind` PASSAPORTE→PASSPORT · RG→RG · VISTO→VISA · SEGURO→INSURANCE · FOTO→PHOTO · OUTRO→OTHER |
| `ActivityLog` | `AuditLog` | `actorType` STAFF→USER · PASSAGEIRO→PERSON · SISTEMA→SYSTEM |
| `Associate` | `Person` com `isMember = true` + `PersonOrganization` | `companyName`/`cnpj` → `Organization`; `role` → `Person.memberType` |
| `Associate.passwordHash` / `mustChangePassword` / `lastLoginAt` | Campos homônimos de `Person` | Hash bcrypt é compatível |
| `AssociateInvite` | `PersonAccessInvite` (`FIRST_ACCESS`) | Token passa a ser guardado como hash; convites pendentes: reemitir |

### Viagens de grupo

| Legado | Novo | Observações |
|---|---|---|
| `Airline` / `Airport` | `Airline` / `Airport` | Referência global; `logoPath` → `logoFileId` |
| `Flight` | `Flight` | `scope` NACIONAL→DOMESTIC · INTERNACIONAL→INTERNATIONAL; `depDateTime`/`arrDateTime` → `departureAt`/`arrivalAt`; `locator` → `defaultLocator`; `liveData` (string) → Json |
| `FlightLocator` | `FlightLocator` | |
| `FlightPassenger` | `FlightPassenger` | `passengerId` → `registrationId` |
| `Accommodation` | `Accommodation` | |
| `AccommodationPassenger` | `Room` + `RoomOccupant` | Agrupar por (`accommodationId`, `roomNumber`); sem número → um `Room` por passageiro. `roomType` texto → `Room.typeLabel` (+ `type` quando reconhecível) |
| `ItineraryItem` | `ItineraryItem` | `status` PENDENTE→PENDING · EM_ANDAMENTO→IN_PROGRESS · CONCLUIDO→DONE · CANCELADO→CANCELED; `audience` TODOS→ALL · STAFF→STAFF · nome de grupo → GROUP + `audienceId` |
| `ChecklistItem` | `ChecklistItem` | `endDate` → `dueDate`; ATRASADO→LATE; `history` texto → Json `[{ nota }]` |
| `MuralPost` | `MuralPost` | `targetType` TODOS→ALL · GRUPO→GROUP · INDIVIDUAL→INDIVIDUAL (`audienceId` = Registration nova) |
| `Ticket` / `TicketMessage` | `SupportTicket` / `SupportTicketMessage` | `status` NOVO→NEW · EM_ATENDIMENTO→IN_PROGRESS · RESPONDIDO→ANSWERED · RESOLVIDO→RESOLVED; `authorType` PASSAGEIRO→PERSON · STAFF→USER |
| `TripDocument` | `ProjectDocument` | `category` GERAL→GENERAL · VOUCHER · SEGURO→INSURANCE · INGRESSO→TICKET · OUTRO→OTHER; `visibleToPassenger` → `visibleToPerson` |
| `VoucherTemplate` | `DocumentTemplate` (Frente 3) | `sections`/`fields`/`backgroundPdfPath` → definição do motor de documentos |

### Linha direta → Viagens corporativas

| Legado | Novo | Observações |
|---|---|---|
| `TravelRequest` | `TravelRequest` | Gerar `protocol` a partir de `createdAt` + sequência |
| `TravelRequest.associateId` | `requesterPersonId` | Person do associado migrado |
| `kind` AEREO/HOTEL/PACOTE/EVENTO/OUTRO | `kind` AIR/HOTEL/PACKAGE/EVENT/OTHER | |
| `tripType` SO_IDA/IDA_VOLTA/MULTITRECHO | `tripType` ONE_WAY/ROUND_TRIP/MULTI_CITY | |
| `budget` (texto) | `budgetCents` quando numérico; senão em `notes` | |
| `needsFlight` + `cabinClass`/`preferredAirline`/`checkedBaggage`/`seatPreference`/`loyaltyProgram` | `requestedServices ∋ AIR` + `serviceDetails.AIR` | ECONOMICA→ECONOMY · PREMIUM→PREMIUM_ECONOMY · EXECUTIVA→BUSINESS · PRIMEIRA→FIRST; JANELA→WINDOW · CORREDOR→AISLE |
| `needsHotel` + `hotel*` | `HOTEL` + `serviceDetails.HOTEL` | `hotelCategory` 3/4/5/INDIFERENTE → `stars` 3/4/5/ANY; `hotelRoomType` SINGLE/DUPLO/TWIN/SUITE → SINGLE/DOUBLE/TWIN/SUITE |
| `needsTransfer` / `needsCarRental` + `car*` / `needsChauffeur` / `transferNotes` | `TRANSFER` / `CAR_RENTAL` / `CHAUFFEUR` | `transferNotes` vai para o bloco TRANSFER (ou CHAUFFEUR se só ele) |
| `needsInsurance` / `needsCurrency`+`currencyNotes` / `needsVisa`+`visaNotes` / `needsConnectivity` / `needsEventTicket`+`eventName` | `TRAVEL_INSURANCE` / `CURRENCY_EXCHANGE` / `VISA` / `CONNECTIVITY` / `EVENT_TICKET` | |
| `status` NOVO/EM_ATENDIMENTO/COTADO/FECHADO/CANCELADO | NEW/IN_PROGRESS/QUOTED/BOOKED/CANCELED | FECHADO (cotação escolhida) → BOOKED |
| `handledBy` / `dispatchLog` / `copyLog` / `sendCopy` / `editedAt` / `chosenQuoteId` / `decidedAt` | Campos homônimos | |
| `TravelSegment` | `TravelRequestSegment` | `timePreference` MANHA/TARDE/NOITE/QUALQUER → MORNING/AFTERNOON/NIGHT/ANY |
| `TravelPassenger` | `TravelRequestPassenger` | `type` TITULAR/ACOMPANHANTE/COLABORADOR/CONVIDADO → HOLDER/COMPANION/EMPLOYEE/GUEST; `docType` PASSAPORTE→PASSPORT · RG · CPF · OUTRO→OTHER; tentar ligar `personId` por documento |
| `TravelQuote` | `TravelQuote` | `totalAmount`/`perPaxAmount` (Float) → `totalCents`/`perPaxCents` |
| `TravelRequestEvent` | `TravelRequestEvent` | `actorType` STAFF→USER · ASSOCIADO→PERSON · SISTEMA→SYSTEM |

### Convites

| Legado | Novo | Observações |
|---|---|---|
| Campos de convite em `Trip` (`eventTime`, `dressCode`, `inviteDeadline`, `individualPool`, `invitesExpired`, `hotels`, `facilities`) | `EventInviteSettings` | `invitesExpired=true` → `quotasExpiredAt = updatedAt`; `hotels`/`facilities` (string JSON) → `nearbyHotels`/`amenities` Json |
| `Trip.emailTitle/emailText/emailFooter/whatsappTemplate/cancelTemplate/replyTo/inviteBannerPath/showAgencyLogo` | `MessageTemplate` (purpose INVITE / INVITE_CANCEL) + `MessagingChannel.replyTo` | Converter `{{placeholders}}` para o catálogo de campos novo |
| `EventCompany` | `CompanyQuota` (+ `Organization`) | `provisionalPassword` (texto puro) → `provisionalPasswordEnc` cifrado; `associateId` → `organizationId` da Person associada |
| `Invite` | `Person` + `Registration` + `EventInvite` | `kind` RESPONSAVEL→RESPONSIBLE · CONVIDADO→COMPANY_GUEST · INDIVIDUAL→INDIVIDUAL; `role` → `Registration.displayJobTitle` |
| `Invite.token` / `code` | `Registration.token` / `shortCode` | **Manter os valores**: QR codes já impressos e links enviados |
| `Invite.status` | `Registration.status` (+ `checkedInAt`) | PENDENTE→PENDING · ENVIADO→INVITED · CONFIRMADO→CONFIRMED · RECUSADO→DECLINED · CREDENCIADO→CONFIRMED com `checkedInAt` · CANCELADO→CANCELED |
| `Invite.confirmedAt/checkedInAt/canceledAt/canceledBy` | Campos homônimos de `Registration` | |
| `Invite.tableId` / `seat` | `SeatAssignment` | |
| `EventTable` | `EventTable` | `shape` REDONDA→ROUND · RETANGULAR→RECTANGULAR |
| `InviteDelivery` | `MessageDelivery` (sem campanha) | `dedupeKey = "legado:<id>"`; ENVIADO→SENT · SIMULADO/LINK_GERADO→SKIPPED · ERRO→FAILED |

---

## 2. sistema_convite (Express + SQLite `data/sistema.db`)

| Legado | Novo | Observações |
|---|---|---|
| `eventos` | `Project` (`CORPORATE_EVENT`) + `EventInviteSettings` | `data_evento`+`hora_evento` → `startsAt` (fuso BRT); `local_nome`/`endereco` → `venueName`/`venueAddress`; `deadline` → `inviteDeadline`; `pool_individual`/`expirado` → `individualPool`/`quotasExpiredAt`; `banner`/`timbrado` → arquivos; `mapa_mesas` → toggle TABLES |
| `eventos.email_titulo/email_texto/email_rodape/whatsapp_mensagem/mensagem_cancelamento/mostrar_logo_marca` | `MessageTemplate` INVITE / INVITE_CANCEL | |
| `usuarios` role `master` | `User` + `WorkspaceMember` | |
| `usuarios` role `admin_evento` | `User` + `Membership(MANAGER)` + `ProjectAccess` | |
| `usuarios` role `convidado_principal` | `CompanyQuota` | `username` → `login`; `senha_hash` reaproveitado; `senha_provisoria` → cifrar; `empresa_nome/nome/cargo/email/telefone/cota` → campos da cota |
| `convidados` | `Person` + `Registration` + `EventInvite` | `tipo` responsavel/convidado/individual → RESPONSIBLE/COMPANY_GUEST/INDIVIDUAL; `status` pendente/enviado/confirmado/checkin/cancelado → PENDING/INVITED/CONFIRMED/CONFIRMED+checkedInAt/CANCELED; manter `token` e `codigo` |
| `mesas` / `convidados.mesa_id`+`cadeira` | `EventTable` / `SeatAssignment` | |
| `envios` | `MessageDelivery` | `canal` → `channel`; `destino` → `target`; status `erro: …` → FAILED + `error` |
| `evento_envio` | `MessagingChannel` | `smtp_modo='proprio'` → canal EMAIL com SMTP (senha cifrada); `wa_instancia_criada` → canal WHATSAPP `waInstance = evento_<id>` |
| `mensagens_modelo` | `MessageTemplate` (CUSTOM) | `assunto`/`corpo` → `emailSubject`/`emailBody`; `incluir_botoes` → `includeActions` |
| `mensagem_disparos` | `MessageCampaign` | `situacao` andamento/pausado/concluido/interrompido/cancelado → RUNNING/PAUSED/COMPLETED/FAILED/CANCELED; `config` → `pacing` |
| `whatsapp_fila` | `MessageDelivery` | pendente→QUEUED · enviado→SENT · erro→FAILED · cancelado→CANCELED. **Não migrar itens pendentes de campanhas antigas** (evita reenvio) |

---

## 3. credenciamento (Express + SQLite `data/credenciamento.db`)

O banco é de evento único: cada cópia vira um `Project` (`TRADE_SHOW` ou `CORPORATE_EVENT`).
`settings.event` → campos do `Project`; `settings.label` → `DocumentTemplate` (LABEL).

| Legado | Novo | Observações |
|---|---|---|
| `participants` | `Person` + `Registration` | `nome`/`sobrenome`/`nome_cracha`/`email`/`whatsapp`→`phone`/`cpf`/`cargo`→`jobTitle`/`cidade` → `Person`; `empresa` → `Organization` + `Registration.displayCompany` |
| `participants.code` | `Registration.shortCode` **e** `token` | O QR impresso contém `code` (ou `<qrBaseUrl>/c/<code>`): a rota `/c/:code` precisa aceitar o código antigo |
| `participants.categoria` | `RegistrationCategory` | |
| `participants.role` participante/scanner/balcao/admin | participante → só `Registration`; scanner → `User` + `Membership(SCANNER)` + `ProjectAccess.areaId`; balcao → `DESK`; admin → `MANAGER` | Login antigo era nome.sobrenome + CPF como senha: **não migrar a senha**, enviar convite de acesso |
| `participants.consentimento` | `Consent(CONTACT_SHARING)` | `granted` = valor; `source = "importacao"` |
| `participants.origem` importacao/balcao/manual | `Registration.source` IMPORT/DESK/MANUAL | |
| `participants.checkin_at` / `print_count` / `last_print_at` | `Registration.checkedInAt` / `printCount` / `lastPrintAt` | |
| `participants.ext_id` | `Person.externalIds.planilha` | |
| `participants.search_text` | `Person.searchText` | Recalcular |
| `areas` | `AccessArea` | `ativo` → `active` |
| `scans` | `AccessScan` | `direcao` entrada/saida → ENTRY/EXIT; `scanner_id` → `scannedByUserId`; `client_uuid` mantido |
| `contacts` | `NetworkingContact` | `owner_id`/`contact_id` → registrations; `nota` → `note` |
| `prints` | `BadgePrint` (`mode = LABEL`) | `operador` → `printedBy` |
| `sessions` | — | Não migrar |
| `settings.mautic` | `FormIntegration(MAUTIC)` + `FormIntegrationSource` | `forms[]` → sources com `categoryId`; `lastIds` → `lastSubmissionId`; `mapping`/`aliases` → `fieldMapping`/`aliases`; `webhookSecret` mantido (a URL do webhook no Mautic precisa ser atualizada para o novo domínio) |

---

## 4. siran_stands (Express + MySQL)

Cada base vira um `Project` (`TRADE_SHOW`) com o recurso `STANDS`.

| Legado | Novo | Observações |
|---|---|---|
| `users` role `master` | `User` + `Membership(ADMIN)` | |
| `users` role `vendedor` | `User` + `Membership(SALES)` | `email`/`telefone` usados nas notificações |
| `user_sessions` | — | Não migrar |
| `categorias` | `SponsorTier` | `preco` → `priceCents`; `tamanho` → `sizeLabel`; `beneficios` (texto, uma linha por benefício) → `benefits[]`; `ordem` → `sortOrder` |
| `stands` | `Stand` | `codigo` → `code`; `categoria_id` → `tierId`; `preco`/`tamanho` (sobrescrita) → `priceCents`/`sizeLabel`; `imagem_url` → `imageFileId`; `status` disponivel/reservado/vendido/indisponivel → AVAILABLE/RESERVED/SOLD/UNAVAILABLE |
| `reservas` | `StandReservation` | `cliente_nome/empresa/contato/email` → `contactName/companyName/contactPhone/contactEmail`; dados de contrato (`razao_social`, `cnpj`, `endereco`, `cep`, `cidade`, `estado`, `representante_*`, `forma_pagamento`) → campos homônimos em inglês; `valor_negociado` → `negotiatedCents`; `status` ativa/confirmada/expirada/cancelada → ACTIVE/CONFIRMED/EXPIRED/CANCELED; `criada_em`/`expira_em`/`confirmada_em` → `createdAt`/`expiresAt`/`confirmedAt` |
| `reservas.contrato_arquivo`/`contrato_gerado_em` | `SponsorshipContract` (versão 1, `fileId`, `generatedAt`) | |
| `reservas.assinado_em`/`contrato_assinado`/`hash_contrato` | `SponsorshipContract.signedAt`/`signedFileId`/`signedSha256` (status SIGNED) | |
| `reserva_anexos` | `ReservationAttachment` + `StoredFile(PRIVATE)` | `arquivo` → copiar de `ANEXOS_DIR`; `enviado_por` → `uploadedByUserId` |
| `assinaturas` | `ContractSignature` | `parte` patrocinador/organizadora → SPONSOR/ORGANIZER; `traco` (data URL PNG) → arquivo + `strokeFileId`; `modo` presencial/remoto → IN_PERSON/REMOTE; `hash_documento` → `documentSha256`; `codigo_validado`/`validado_por` → `otpVerified`/`otpChannel`; `testemunha_id` → `witnessUserId` |
| `assinatura_tokens` | `SignatureRequest` | `token` → `tokenHash` (SHA-256); `codigo` → `otpHash`; tokens não usados e vencidos: não migrar |
| `notificacoes_log` | `MessageDelivery` (transacional) | `dedupeKey = "legado:stands:<id>"` |
| `config` (prazo da reserva, destinatários da diretoria) | `Project.settings.exhibitions` (`reservationHoldHours`, `notifyEmails`, `notifyPhones`) | |

---

## 5. Pontos de atenção na migração

1. **Links e QR codes já distribuídos** dependem do domínio antigo (`abiec.mais.tur.br/convite/<token>`,
   `/c/<code>`). Os tokens e códigos são preservados; o domínio antigo deve redirecionar para as rotas novas.
2. **Senhas**: hashes bcrypt de `User`, `Associate`, `EventCompany` e `usuarios` são compatíveis e podem ser
   reaproveitados. PINs = CPF (portal do passageiro) e logins por CPF (credenciamento) **não** devem ser
   migrados como senha válida.
3. **Campanhas de WhatsApp em andamento** não devem ser retomadas automaticamente na nova plataforma.
4. **Biometria**: nenhum sistema legado tem; nada a migrar.
