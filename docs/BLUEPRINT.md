# Plataforma Mais — Blueprint de consolidação

> Documento de arquitetura da plataforma corporativa única da Mais Corporativo
> Viagens e Eventos. Base: análise dos sistemas `abiec`, `abradilan_viagens`,
> `sistema_convite`, `credenciamento` e `siran_stands`, dos dois Materiais
> Mestres e do site institucional. Versão 0.1 — 18/11/2026.

---

## 1. Diagnóstico dos sistemas atuais

| Sistema | Stack | Escopo | Maturidade | O que aproveitar |
|---|---|---|---|---|
| **abiec** | Next.js 16 · TypeScript · Prisma · Tailwind 4 | Viagens de incentivo (check-in), eventos com convites, linha direta com cotações, portal do passageiro, vouchers | **Alta** — é a base | Quase tudo; vira o núcleo |
| **abradilan_viagens** | idêntica | Cópia da ABIEC com outra marca | Atrás da ABIEC (sem status de voo em tempo real) | **Nada exclusivo.** Vira apenas um *tenant* |
| **sistema_convite** | Express · SQLite nativo · HTML/JS | Convites FECOFAR | Média; UI legada | **Módulo de mensagens** (modelos, campos dinâmicos, disparo em massa, fila de WhatsApp com ritmo anti-bloqueio, SMTP/WhatsApp próprios por evento, histórico) |
| **credenciamento** | React/Vite (JS) · Express · SQLite | Credenciamento SIRAN Summit | Alta na operação de balcão; **evento único** | Editor de etiqueta em mm, impressão térmica sem diálogo, balcão com leitor USB, controle de acesso por espaço (offline), networking com LGPD, importação de planilha, Mautic, autoinscrição |
| **siran_stands** | React/Vite (TS) · Express 5 · MySQL | Venda de stands do SIRAN Summit | Média-alta | Mapa de stands com trava concorrente, cotas de patrocínio, propostas, **contrato em PDF + assinatura eletrônica com trilha de evidências**, anexos privados |

### Problemas estruturais encontrados (o "Frankenstein" a evitar)

1. **Fork por cliente.** ABIEC e ABRADILAN são o mesmo código copiado; já divergiram
   (a ABRADILAN não tem status de voo ao vivo). Cada novo cliente multiplicaria isso.
2. **Quatro modelos da mesma pessoa.** `Passenger` (viagem), `Invite` (convite),
   `participants` (credenciamento) e `TravelPassenger` (linha direta) descrevem o mesmo
   ser humano sem ligação entre si. Um associado que viaja, é convidado para o jantar
   e se credencia na feira hoje existe em três bancos.
3. **Três motores de documento.** Voucher (pdf-lib, PDF de fundo + campos posicionados),
   etiqueta (HTML em mm) e contrato (pdfkit) fazem a mesma coisa de formas diferentes.
4. **Três implementações de mensageria**, cada uma com nomes de variável diferentes
   para a Evolution API (o README da ABIEC registra que isso já silenciou envios).
5. **Fila de WhatsApp em processo.** O incidente de 17/11 (mensagens às 05h e
   triplicadas) veio de fuso do servidor e de vários processos lendo a mesma fila.
   A plataforma nova precisa de fila com trava no banco e chave de idempotência.
6. **Credenciais fracas no autoatendimento.** O credenciamento usa CPF como senha —
   inaceitável num totem público.

---

## 2. Princípios da plataforma consolidada

1. **Um código, muitos clientes.** Multiempresa (*multi-tenant*) por dados, nunca por cópia.
2. **Uma pessoa, muitos papéis.** Cadastro único de pessoa por cliente; viagens,
   convites, inscrições e credenciais são *vínculos* dessa pessoa.
3. **Módulos contratáveis.** O master liga/desliga módulos por cliente; o cliente liga
   recursos por projeto dentro do que contratou.
4. **Motores compartilhados.** Um motor de documentos, um de mensageria, um de
   impressão, um de identidade — usados por todos os módulos.
5. **Nomenclatura configurável.** "Associado", "Colaborador", "Cliente", "Revendedor"
   são rótulos do cliente, não tabelas diferentes.

---

## 3. Hierarquia multiempresa

```
Plataforma (Mais Corporativo)            ← usuário MASTER
 └─ Cliente / Companhia (tenant)          ← ABIEC, ABRADILAN, SIRAN, FECOFAR, Grupo Martins…
     ├─ Identidade visual e domínio       ← logo, cores, fonte, subdomínio, remetente de e-mail,
     │                                       instância de WhatsApp, timbrado, termos (dicionário)
     ├─ Módulos contratados (+ limites e vigência)
     ├─ Membros (pessoas da base do cliente, com tipologia própria)
     ├─ Usuários do cliente (admin, gestor, aprovador, operador)
     └─ Projetos
         └─ tipo: Viagem corporativa | Viagem de incentivo | Evento | Feira |
                  Imersão técnica | Experiência esportiva | Campanha de incentivo
            └─ recursos ligados por projeto (convites, mesas, credenciamento,
               stands, voos, hospedagem, vouchers…), limitados pelos módulos do cliente
```

**Resolução do tenant:** por subdomínio (`abiec.mais.tur.br`) ou domínio próprio;
o painel master acessa todos. Todas as tabelas de negócio têm `tenantId`, e o acesso
passa por uma camada única que injeta o filtro (sem consultas "soltas").

**Dicionário de termos por cliente** (exemplo):

| Chave | ABIEC | Grupo Martins | Feira X |
|---|---|---|---|
| `member.singular` | Associado | Colaborador | Expositor |
| `org.singular` | Frigorífico | Filial | Empresa |
| `project.event` | Evento | Convenção | Feira |

---

## 4. Módulos e entitlements

| # | Módulo | Origem | Conteúdo |
|---|---|---|---|
| 0 | **Núcleo** (sempre ativo) | novo + ABIEC | Clientes, pessoas/CRM, usuários e papéis, identidade visual, auditoria, arquivos, LGPD |
| 1 | **Comunicação** | sistema_convite | Modelos com campos dinâmicos, e-mail + WhatsApp, disparo segmentado, réguas automáticas, histórico, SMTP/WhatsApp por cliente ou projeto |
| 2 | **Viagens corporativas** | ABIEC (linha direta) + Material Mestre | Solicitação multi-trecho, cotações comparáveis, **política de viagens** (limites, fornecedores preferenciais), **aprovação por alçada**, centros de custo, despesas, relatórios de conformidade e economia |
| 3 | **Viagens de incentivo e grupos** | ABIEC | Passageiros, voos com localizadores e status ao vivo, hospedagem e rooming, cronograma, checklist, mural, suporte, documentos, portal do viajante, formulário público |
| 4 | **Eventos e convites** | ABIEC + sistema_convite | Empresas com cota e login, convites com QR e código curto, RSVP, expiração e pool, mapa de mesas |
| 5 | **Credenciamento e acesso** | credenciamento + novo | Inscrição, importação, balcão, **autoatendimento com reconhecimento facial**, etiquetas e crachás, controle de áreas, networking e leads |
| 6 | **Vouchers e documentos** | ABIEC (motor) | Motor único: vouchers, crachás, etiquetas, certificados, propostas, contratos, rooming lists |
| 7 | **Feiras, stands e patrocínio** | siran_stands | Mapa de stands, cotas, reserva com trava e prazo, proposta, contrato, assinatura eletrônica |
| 8 | **Incentivo e gamificação** | site (plataforma B2B2C) | Campanhas, metas, *coins*, ranking, resgate em pacotes — **fase posterior** |
| 9 | **Financeiro** | novo | Custo × venda × fee por serviço, faturamento ao cliente, contas a pagar a fornecedores, comissões — **fase posterior** |

Um cliente que contratou só convites e credenciamento recebe 0 + 1 + 4 + 5 + 6.
O menu, as rotas e as *server actions* verificam o entitlement — não só a interface.

---

## 5. Catálogo de serviços e produtos turísticos

Um catálogo único de **tipos de serviço**, com campos comuns e detalhes tipados por tipo
(validados com zod). Toda reserva ou item de cotação, em qualquer módulo, é uma
`ServiceItem` de um desses tipos.

| Grupo | Tipos |
|---|---|
| Transporte | Aéreo · Ônibus/fretamento · Trem · Cruzeiro · Transfer · Locação de veículo · Motorista à disposição · Transporte executivo · Aéreo fretado |
| Hospedagem | Hotel · Resort · Apartamento/temporada · Bloqueio de grupo |
| Documentação e proteção | Seguro viagem · Visto · Passaporte · Câmbio · Chip/eSIM |
| Experiências | Ingresso de evento · Ingresso esportivo/hospitalidade VIP · Passeio/tour · Guia · Restaurante/experiência gastronômica · Concierge |
| Eventos e feiras | Espaço/locação · A&B · Audiovisual · Cenografia · Montagem de stand · Brindes · Credenciamento · Staff/recepção · Tradução/intérprete · Ativação de marca |
| Outros | Aluguel de equipamentos · Taxa de serviço (fee) · Item livre |

Campos comuns: fornecedor, localizador, status (cotado, reservado, emitido, cancelado),
datas, pessoas vinculadas, custo, preço de venda, fee, moeda, política aplicável,
anexos. **Fornecedores** (cias aéreas, hotéis, receptivos, montadoras) viram cadastro
próprio, com acordos tarifários.

As **tipologias de projeto** do site — Gestão de Viagens, Viagem de Incentivo, Eventos
Corporativos, Feiras de Negócios, Imersões Técnicas Internacionais (ex.: Canton Fair),
Mais Corporativo Esportes (F1, NBA, NFL, Champions, Grand Slams) e Plataforma de
Incentivo — são *modelos de projeto*: cada um pré-liga os recursos e checklists certos.

---

## 6. Modelo de dados — entidades centrais

```
Tenant ─┬─ TenantBranding, TenantModule(module, limits, validUntil), TenantTerm
        ├─ Membership(user ↔ tenant, role)
        ├─ Person (cadastro único: nome, documentos, contatos, foto, consentimentos)
        │    └─ PersonOrg → Organization (empresa/frigorífico/filial do membro)
        ├─ Project (tipo, datas, local, status, recursos ligados, branding opcional)
        │    ├─ Registration (Person ↔ Project: papel, categoria, grupo, status RSVP,
        │    │                 código curto, token público, check-in, impressões)
        │    ├─ Flight / Accommodation / ItineraryItem / ChecklistItem / Mural / Ticket
        │    ├─ CompanyQuota (empresa convidada com cota) → Invite ⊂ Registration
        │    ├─ Table / Seat
        │    ├─ Area + AccessScan (entrada/saída, offline com client_uuid)
        │    ├─ Stand / SponsorTier / StandReservation / Contract / Signature
        │    └─ ServiceItem (catálogo)
        ├─ TravelRequest / TravelQuote / Approval / TravelPolicy / CostCenter
        ├─ DocumentTemplate (voucher | crachá | etiqueta | certificado | contrato)
        ├─ MessageTemplate / Campaign / Delivery / OutboxJob
        └─ FaceEnrollment (embedding cifrado, consentimento, validade)
```

`Registration` substitui `Passenger`, `Invite` e `participants`: um único check-in,
uma única etiqueta, um único histórico de mensagens por pessoa e projeto.

---

## 7. Comunicação (requisito: levar ao credenciamento o que o sistema_convite tem)

Motor único, disponível para **todos** os módulos — inclusive credenciamento:

- **Modelos** com editor visual e "chips" de campos (`{{nome}}`, `{{empresa}}`,
  `{{categoria}}`, `{{link_cracha}}`, `{{qr}}`, `{{faltam_dias}}`, `{{mesa}}`…),
  pré-visualização com uma pessoa real, envio de teste, versões e-mail/WhatsApp.
- **Segmentação** por filtros salvos (categoria, status, empresa, área, sem check-in…).
- **Réguas automáticas** por gatilho: inscrição confirmada → crachá digital;
  D-7 / D-1 lembrete; check-in realizado → boas-vindas e agenda; pós-evento → pesquisa.
- **WhatsApp:** fila no PostgreSQL com `SELECT … FOR UPDATE SKIP LOCKED`, chave de
  idempotência por (campanha, pessoa, canal), janela de horário no **fuso do projeto**,
  presets *cauteloso/moderado*, limite diário por número, pausa automática por
  desconexão/falhas, retomada após reinício, webhook de status (entregue/lido).
- **E-mail:** SMTP global ou próprio por cliente/projeto, *reply-to*, intervalo e
  parada após falhas seguidas.
- Provedor de WhatsApp plugável: Evolution (atual), Meta Cloud API (oficial) ou webhook.

---

## 8. Credenciamento com autoatendimento e reconhecimento facial

### Fluxo do totem

```
[Tela de boas-vindas]
   ├─ Olhar para a câmera ──► detecção + prova de vida ──► comparação 1:N
   │                                                        com os inscritos do projeto
   ├─ Ler QR do crachá digital (celular)
   └─ Digitar login + código de acesso (teclado na tela)
           │
           ▼
[Confirmação: "É você, Maria Silva — Empresa X?"]  (exibe o mínimo de dados)
           │ confirma
           ▼
[Check-in registrado] ──► impressão automática ──► "Retire sua etiqueta e cole no crachá"
                          (sem diálogo)              ou "Retire seu crachá"
```

- **Cadastro facial:** selfie na inscrição online (ou no balcão), com **consentimento
  específico e destacado** — biometria é dado sensível (LGPD, art. 11). Guardamos o
  *embedding* cifrado, não a foto, com exclusão automática após o evento (prazo
  configurável). Quem não consente usa QR ou login.
- **Prova de vida** passiva para impedir foto de foto/tela.
- **Limiar de confiança** configurável; abaixo dele, o totem pede o QR ou o login.
- **Login do totem:** login + código de 6 dígitos enviado no crachá digital
  (por e-mail/WhatsApp) — nunca CPF como senha.
- **Antifraude:** reimpressão no totem só com nova confirmação; segunda via
  vai para o balcão; tudo registrado na auditoria.

### Dois modos de impressão, escolhidos pela organização por projeto

| Modo | Uso | Equipamento |
|---|---|---|
| **Etiqueta** (o visitante cola no crachá) | Autoatendimento em volume | Térmica (Zebra, Elgin, Argox) — 80×40, 100×50 mm… |
| **Crachá completo** | Credencial final impressa direto | Jato de tinta/laser em papel 10×15 (A6), ou impressora de cartão PVC |

Ambos saem do **mesmo motor de documentos** (editor visual em mm, campos, QR, código
de barras, regras por categoria, arte de fundo, calibração). Para impressão silenciosa
há dois caminhos: Chrome em `--kiosk-printing` (o que funciona hoje) ou um **agente
local de impressão** no totem, que permite várias impressoras e envio direto em ZPL —
recomendado para operação com muitos totens.

---

## 9. Arquitetura técnica

| Camada | Escolha | Motivo |
|---|---|---|
| Aplicação | Next.js 16 (App Router, Server Actions) + TypeScript | Base da ABIEC, a mais madura |
| Banco | **PostgreSQL** + Prisma | Multiempresa, concorrência (fila, trava de stand), JSON |
| UI | Tailwind 4 + biblioteca de componentes própria, tokens de tema por cliente | Identidade visual sem reescrever telas |
| Jobs | Worker dedicado com fila no Postgres (pg-boss ou equivalente) | Mensageria, réguas, expirações, status de voo |
| Arquivos | Armazenamento persistente fora do deploy (disco do VPS ou S3 compatível) | Os três sistemas sofrem com isso hoje |
| Biometria | Serviço de reconhecimento facial isolado (detecção, prova de vida, embedding) | Isola dado sensível e processamento pesado |
| Totem | PWA em modo quiosque + agente local de impressão | Funciona com câmera e impressora locais |
| Integrações | Evolution / Meta, SMTP, Mautic, Apify (voos), OBT externo | Já existem nos sistemas atuais |

**Hospedagem:** worker, PostgreSQL e serviço facial exigem **VPS** (a Hostinger VPS
serve); a hospedagem compartilhada não comporta processos contínuos.

---

## 10. Perfis de acesso

| Nível | Papéis |
|---|---|
| Plataforma | Master · Operador Mais · Financeiro Mais |
| Cliente | Admin do cliente · Gestor · Aprovador de viagens · Operador · Visualizador |
| Projeto | Coordenador · Balcão · Leitor de acesso · Vendedor de stands |
| Externos | Membro (associado/colaborador…) · Empresa com cota · Expositor/Patrocinador · Participante/viajante |

---

## 11. Roteiro de construção

| Fase | Entrega | Resultado |
|---|---|---|
| **1. Fundação** | Multiempresa, branding, termos, entitlements, pessoas, papéis, motor de comunicação, motor de documentos | Esqueleto que todo módulo usa |
| **2. Migração da ABIEC** | Módulos 2, 3, 4 e 6 sobre a fundação; ABIEC e ABRADILAN como dois clientes | Substitui os dois portais |
| **3. Credenciamento** | Módulo 5 (balcão, etiqueta, áreas, networking, Mautic) + comunicação aplicada | Substitui o credenciamento |
| **4. Autoatendimento** | Totem, reconhecimento facial, impressão silenciosa, crachá direto | Requisito novo |
| **5. Feiras e stands** | Módulo 7 com contratos e assinatura | Substitui o siran_stands |
| **6. Viagens corporativas completas** | Política, aprovação, centro de custo, despesas, relatórios | Atende o Material Mestre |
| **7. Financeiro e gamificação** | Módulos 8 e 9 | Expansão |

Cada fase inclui **script de migração** dos dados dos sistemas atuais (SQLite/MySQL →
PostgreSQL), para que eventos em andamento não percam convites, QR codes nem histórico.
Os QR codes já emitidos dependem do domínio atual: os links antigos serão redirecionados.

---

## 12. Decisões

### Tomadas (18/11/2026)

1. **Reserva de viagens corporativas: manual por enquanto** (briefing → cotação pelo
   atendente → escolha pelo cliente, como na ABIEC). A Mais tem o **Travellink (Wooba)**
   e a integração via API está prevista para breve: o módulo 2 terá uma camada de
   "provedor de reservas" com implementação *manual* agora e *Travellink* depois,
   sem precisar refazer telas nem dados.
2. **Reconhecimento facial: serviço próprio** na infraestrutura da Mais.
3. **Hospedagem: ainda indefinida.** Padrão adotado: VPS (Docker Compose com app,
   worker, PostgreSQL e serviço facial), tudo configurável por variável de ambiente.

### Em aberto

4. **Impressoras dos totens:** modelos exatos, para validar o agente de impressão.
5. **Domínios:** um subdomínio por cliente em `mais.tur.br` e/ou domínios próprios.
