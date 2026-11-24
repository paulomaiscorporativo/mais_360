# Réguas automáticas — guia do operador

Uma régua é: **gatilho** (quando) → **modelo** (o quê) → **canais** (e-mail, WhatsApp) →
**filtro** (para quem). Cada régua pertence a um evento ou viagem. Configure em
_Comunicação → Réguas_.

## Regras que valem para todas

- **Uma vez por pessoa.** Cada inscrição recebe cada régua uma única vez por canal (os
  lembretes de documentos repetem só até o teto). Rodar de novo, reiniciar o worker ou
  clicar duas vezes nunca duplica: cada envio tem uma chave única
  `t:automation:<régua>:<inscrição>:<canal>[:<ocorrência>]`.
- **Fuso do projeto.** "D-1 às 09:00" é 09:00 no fuso do projeto (ou do cliente, se o
  projeto não tiver), atravessando horário de verão. Horário que não existe na virada do
  relógio (ex.: 02:30 quando o relógio pula para 03:00) sai logo depois do salto; horário
  repetido usa a primeira vez.
- **Nada retroativo (anti-avalanche).** Uma régua por data só envia dentro da janela de
  **6 horas** depois do horário previsto. Régua criada, religada ou reagendada depois disso
  não envia o que já passou — evita que ligar uma régua antiga dispare para todo mundo.
  Nas réguas por evento, vale o mesmo: régua ligada depois da inscrição/check-in não manda
  para os acontecimentos anteriores.
- **Lembrete "antes de" nunca sai depois do acontecimento** (ex.: lembrete do voo não sai
  depois da partida, mesmo com o worker atrasado).
- **Quem recebe por padrão:** todos os inscritos, menos quem cancelou ou recusou. O filtro
  "Só para" restringe por papel e situação. Cancelado nunca recebe.
- **Sem contato ou sem autorização:** quem não tem e-mail/WhatsApp válido, ou recusou
  WhatsApp no consentimento, aparece como "sem contato ou sem autorização" no histórico da
  régua e não é cobrado de novo naquele disparo.
- **Quando nada dispara:** projeto arquivado, cliente suspenso/arquivado, assinante
  **suspenso** ou cancelado. Na suspensão as réguas ficam paradas; ao reativar, valem dali
  em diante (o que passou durante a suspensão não é enviado depois). Pagamento pendente e
  período de teste disparam normalmente.
- **WhatsApp** respeita a janela de horário e o limite diário do número (padrão cauteloso),
  então pode sair um pouco depois do horário previsto.

## Gatilhos

| Gatilho                             | O que dispara                                                                                                                                       | Repete?                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Quando a inscrição é criada         | Formulário público, inclusão manual, importação de planilha, convite emitido (console e portal da empresa). **A migração do legado não dispara.**   | Não                                             |
| Quando a presença é confirmada      | Formulário público, RSVP do convite, "confirmar" no console (individual ou em lote — só quem ainda não estava confirmado). Check-in não conta aqui. | Não                                             |
| No check-in                         | Credenciamento no balcão/leitor/totem. Se a fila atrasar mais de 6 h, não sai.                                                                      | Não                                             |
| Dias antes do início                | Dia do início − N, no horário escolhido.                                                                                                            | Não (se a data do projeto mudar, vale a nova)   |
| Dias depois do término              | Último dia (ou início, sem término) + N.                                                                                                            | Não                                             |
| Dias antes da data-limite das cotas | Só para o **responsável** de cada empresa que ainda tem convites e não foi travada.                                                                 | Não                                             |
| Horas antes de cada voo             | Partida de cada voo do viajante − X horas. Precisa de voos no projeto. Voo remarcado: o lembrete acompanha (uma vez por voo).                       | Uma vez por voo                                 |
| Passaporte ausente ou vencendo      | Passaporte exigido e ausente, vencido ou vencendo antes de 6 meses da volta. Começa N dias antes do embarque.                                       | A cada X dias, até resolver, o teto ou embarque |
| Documentos pendentes                | Qualquer documento exigido do projeto faltando, vencido ou vencendo.                                                                                | A cada X dias, até resolver, o teto ou embarque |

Os documentos exigidos vêm de _Documentos → exigências_ do projeto (sem configuração:
passaporte em viagem internacional, RG nas nacionais). O passaporte digitado no cadastro
da pessoa também conta.

## Campos úteis nas mensagens de viagem

`{{voo_numero}}`, `{{voo_trecho}}`, `{{voo_partida}}` (horário local do aeroporto de
origem), `{{voo_localizador}}`, `{{pendencias}}` (uma por linha), `{{validade_passaporte}}`
e `{{link_portal}}` (portal do viajante). Se não houver modelo para a finalidade, a tela
oferece modelos iniciais ("Lembrete de voo", "Documentos pendentes", "Passaporte").

## Na tela

- **Próximo envio** de cada régua (no fuso do projeto) ou o motivo de não haver.
- **Histórico:** enviadas, na fila, sem contato/autorização e falhas.
- **Ver quem vai receber:** prévia do próximo disparo (quantos, quem, quantos sem contato,
  quantos já receberam).
- **Enviar agora:** antecipa o próximo disparo por data (fica na auditoria como
  `messaging.automation.run_now`); no horário previsto ele não se repete.

## Técnico

Regras puras em `@mais/core/automations`; motor em `@mais/messaging` (`automations.ts`).
Filas `automations.event` (um job por acontecimento e inscrição,
`automation-event:<gatilho>:<inscrição>`) e `automations.run` (um job por ocorrência,
`automation:<régua>:<ocorrência>`, criado uma única vez). Varredura no worker a cada 5 min.
Entregas gravam `MessageDelivery.automationId`.
