# Operação do worker

Como o processamento em segundo plano da Mais 360 funciona em produção, como ler o painel de
operação e o que fazer quando algo para. Regras puras em `packages/core/src/ops`; worker em
`apps/worker/src` (`operations.ts`, `heartbeat.ts`, `schedule.ts`, `tasks.ts`, `cleanup.ts`,
`health.ts`); painel em `apps/web/src/app/console/plataforma/operacao`.

## Peças

| Peça                  | Onde                        | O que faz                                                                                                                                                                     |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fila de jobs          | tabela `Job`                | Trabalho assíncrono (e-mails, mensagens, voos, domínios). Reivindicação com `SKIP LOCKED`; vários workers sem duplicar.                                                       |
| Sinal de vida         | tabela `WorkerHeartbeat`    | Cada processo grava host, pid, versão e filas a cada 30 s, renova a trava dos jobs que está rodando e toca o arquivo do healthcheck.                                          |
| Tarefas periódicas    | tabela `ScheduledTask`      | Uma linha por tarefa. O worker que reivindica a linha (horário vencido, sem trava ativa) roda a janela; os outros pulam.                                                      |
| Limite de tentativas  | tabela `RateLimitBucket`    | Login, links de acesso e formulários públicos. Contador atômico no Postgres: vale para todos os nós e sobrevive a reinícios. A chave é o SHA-256 (sem e-mail ou IP em claro). |
| Healthcheck do worker | `apps/worker/src/health.ts` | Confere a idade do arquivo de marcação (até 90 s). Não abre conexão com o banco.                                                                                              |
| Healthcheck da web    | `GET /api/health`           | `SELECT 1` com prazo de 3 s → `200 {"status":"ok"}` ou `503 {"status":"erro"}`. Sem sessão e sem detalhes.                                                                    |

## Tarefas periódicas

| Tarefa          | Intervalo | O que faz                                                                                            |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `jobs.recover`  | 1 min     | Devolve jobs de workers que morreram (ver Recuperação) e fecha entregas de mensagem presas em envio. |
| `domains.sweep` | 5 min     | Domínios próprios pendentes (por 7 dias) e verificados (1×/dia) vão para `domains.verify`.           |
| `flights.sweep` | 5 min     | Só com `APIFY_TOKEN`: voos perto da partida ou em andamento vão para `flights.refresh`.              |
| `ops.cleanup`   | 24 h      | Limpeza em lotes (abaixo). Roda no primeiro worker que subir e depois a cada 24 h.                   |

Os horários usam o relógio do banco. Se todos os workers ficarem parados, as tarefas vencidas
rodam assim que um voltar (uma vez, não uma por janela perdida). Outras frentes registram
tarefas novas passando `extraTasks` para `startOperations` ou acrescentando em `tasks.ts`.

## Recuperação de jobs

- O sinal de vida renova `lockedAt` dos jobs em execução a cada 30 s (lease).
- `jobs.recover` devolve um job `RUNNING` quando o dono está sem sinal há mais de 2 min (ou
  encerrou), ou quando a trava não é renovada há mais de 10 min (caso do consumidor de
  vouchers da web, que não tem sinal de vida).
- Se a tentativa interrompida era a última (`attempts >= maxAttempts`), o job vira `DEAD` em
  vez de voltar — aparece em **Falhas** para alguém decidir.

## Desligamento gracioso (SIGTERM)

1. Para de pegar jobs e de agendar tarefas.
2. Espera os jobs e tarefas em andamento até `WORKER_SHUTDOWN_TIMEOUT_MS` (padrão 45 s).
3. O que não terminar volta para a fila na hora (sem gastar tentativa); as travas de tarefas
   são liberadas.
4. Marca a instância como encerrada (`stoppedAt`) e sai (código 0; 1 se devolveu jobs).

No Docker, deixe o `stop_grace_period` maior que o prazo (o padrão do Docker é 10 s):

```yaml
worker:
  command: npm run start -w @mais/worker
  stop_grace_period: 60s
  environment:
    WORKER_HEALTH_FILE: /tmp/mais-worker-health
  healthcheck:
    test: ["CMD", "node", "--experimental-strip-types", "apps/worker/src/health.ts"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 30s
web:
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health || exit 1"]
    interval: 30s
    timeout: 5s
    retries: 3
```

(`npm run health -w @mais/worker` faz o mesmo via `tsx`.)

## Limpeza diária (`ops.cleanup`)

Apaga em lotes de `CLEANUP_BATCH_SIZE` e registra no log quantos foram de cada tabela (o
resumo também fica em `ScheduledTask.lastResult`):

| O quê                                   | Quando                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| `Session`                               | vencida ou revogada há mais de `CLEANUP_SESSION_DAYS` (30)      |
| `UserAccessToken`, `PersonAccessInvite` | usado, revogado ou vencido há mais de `CLEANUP_TOKEN_DAYS` (30) |
| `Job` `DONE`                            | concluído há mais de `CLEANUP_JOB_DONE_DAYS` (14)               |
| `Job` `FAILED`/`DEAD`                   | há mais de `CLEANUP_JOB_FAILED_DAYS` (60)                       |
| `RateLimitBucket`                       | janela encerrada                                                |
| `WorkerHeartbeat`                       | sem sinal há mais de `CLEANUP_HEARTBEAT_DAYS` (7)               |

**Nunca** apaga `AuditLog` nem `MessageDelivery` (histórico e prova de envio).

## Painel de operação (`/console/plataforma/operacao`)

Superadmin e suporte consultam; só superadmin repete ou descarta jobs. Atualiza sozinho a cada
30 s (com a aba visível).

- **Faixa de situação**
  - _Tudo funcionando_ (verde): pelo menos um worker vivo e tarefas em dia.
  - _Nenhum worker em funcionamento_ (vermelho): nenhuma instância deu sinal há mais de 2 min.
    Nada em segundo plano anda (e-mails de convite, mensagens, voos, domínios, limpeza). Veja o
    container/processo do worker e os logs; confira `DATABASE_URL`.
  - _Filas sem worker_ (âmbar): há jobs vencidos numa fila que nenhum worker vivo atende —
    normalmente configuração (ex.: `flights.refresh` sem `APIFY_TOKEN`). `vouchers.issue` é
    consumida pela web e não entra nesse alerta.
  - _Tarefas periódicas com problema_ (âmbar): a última execução falhou (erro na linha da
    tarefa) ou está atrasada além de um intervalo.
- **Números**: workers ativos, jobs na fila, atrasados (vencidos há mais de 5 min), em
  execução e falhas definitivas.
- **Jobs**: abas Falhas (`FAILED`/`DEAD`), Tentando de novo (falhou e ainda tem tentativas),
  Atrasados e Em execução; filtros por fila e por cliente (o cliente vem do payload: cliente,
  projeto, campanha, entrega ou domínio). Payload e erro aparecem **mascarados**: e-mails
  (`a•••@dominio`), telefones (`•••1234`), nomes (iniciais), links, tokens e senhas (`•••`).
  - _Tentar de novo_: volta para `PENDING` com tentativas zeradas e roda já.
  - _Descartar_: apaga o job (com confirmação). O registro fica na auditoria.
  - Ambos gravam `AuditLog` (`ops.job.retry`, `ops.job.discard`) com fila, tentativas, erro e
    payload mascarados.
- **Workers**: instância (host, pid, versão), situação (Ativo, Atrasado = perdeu sinais mas
  ainda dentro dos 2 min, Sem sinal = morreu sem avisar, Encerrado = SIGTERM), último sinal,
  filas. Instâncias paradas somem do painel depois de 24 h.
- **Tarefas periódicas**: última execução, duração, erro, próxima.
- **Filas**: contagem por status; clicar abre as falhas daquela fila.
- **Entregas com falha** (7 dias, somente leitura): total por canal e as últimas, com
  destinatário mascarado e link para a comunicação do cliente (ou a campanha).

## Variáveis de ambiente

| Variável                     | Padrão                     | Uso                                                       |
| ---------------------------- | -------------------------- | --------------------------------------------------------- |
| `APP_VERSION`                | versão do `package.json`   | Versão exibida no painel (use o sha do commit no deploy). |
| `WORKER_HEALTH_FILE`         | `<tmp>/mais-worker-health` | Arquivo de marcação do healthcheck do worker.             |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | `45000`                    | Prazo para terminar jobs no SIGTERM.                      |
| `CLEANUP_SESSION_DAYS`       | `30`                       | Retenção de sessões vencidas/revogadas.                   |
| `CLEANUP_TOKEN_DAYS`         | `30`                       | Retenção de convites e links de acesso encerrados.        |
| `CLEANUP_JOB_DONE_DAYS`      | `14`                       | Retenção de jobs concluídos.                              |
| `CLEANUP_JOB_FAILED_DAYS`    | `60`                       | Retenção de jobs com falha definitiva.                    |
| `CLEANUP_HEARTBEAT_DAYS`     | `7`                        | Retenção de sinais de vida de workers parados.            |
| `CLEANUP_BATCH_SIZE`         | `1000`                     | Tamanho do lote de exclusão.                              |

Valor inválido em `CLEANUP_*` impede o worker de subir, com o nome do campo no erro.

## Limite de tentativas

`rateLimit(chave, limite, janelaMs)` (`apps/web/src/server/rate-limit.ts`) é assíncrono.
Janela fixa que começa na primeira tentativa; toda tentativa conta, mas a janela não se estende.
Se o banco falhar, a consulta libera (e registra no log): sem banco, login e formulários
também não funcionam. Para destravar alguém na hora, apague a linha em `RateLimitBucket` pelo
hash da chave (ou espere a janela).
