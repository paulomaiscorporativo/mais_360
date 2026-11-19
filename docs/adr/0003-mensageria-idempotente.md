# ADR 0003 — Mensageria idempotente com fila no PostgreSQL

**Status:** aceita · 18/11/2026

## Contexto

Em 17/11/2026 o sistema_convite enviou cada lembrete 3 vezes, às 05h: vários processos liam a mesma
fila em memória e a janela de horário usava o relógio UTC do servidor.

## Decisão

- `MessageDelivery.dedupeKey` único por (campanha, inscrição, canal).
- Worker consome com `SELECT … FOR UPDATE SKIP LOCKED`; itens travados com `lockedAt/lockedBy`
  e liberados após timeout.
- Janela de horário e limite diário calculados no fuso da campanha (`Intl` com `timeZone`).
- Provedor de WhatsApp atrás de interface (Evolution, Meta Cloud, webhook).

## Consequências

Sem dependência de Redis. Escala horizontal de workers é segura.
