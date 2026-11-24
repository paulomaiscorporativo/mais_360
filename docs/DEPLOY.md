# Deploy em produção

Como a Mais 360 roda em produção, como publicar uma versão nova e o que fazer quando algo dá
errado. Complementa `docs/OPERACAO.md` (worker e painel de operação) e `docs/DOMINIOS.md`
(domínios dos clientes e certificados).

## Visão geral

```
Internet ──► Caddy (80/443, HTTPS automático)
               │
               ├─► web     (Next.js, porta 3000)  ──┐
               │                                    ├─► PgBouncer :25061 ──► PostgreSQL 17
               └─  worker  (fila, réguas, e-mails) ─┘      (pool "mais360")    (gerenciado)
                                                     migrate ──► conexão direta :25060
```

| Peça                  | Onde                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| Servidor              | Droplet `mais360-prod-01` (DigitalOcean, NYC3, 2 vCPU / 4 GB / 120 GB)         |
| Banco                 | Cluster gerenciado `mais360-prod-db` (PostgreSQL 17), banco `mais360`          |
| Console               | `https://360.mais.tur.br`                                                      |
| Clientes              | `https://<slug>.mais.tur.br` e domínios próprios (certificado sob demanda)     |
| E-mail                | Brevo, `smtp-relay.brevo.com:2525`, remetente `nao-responda@mais.tur.br`       |
| Arquivos enviados     | `/srv/mais360/storage` no droplet (volume do container em `/data/storage`)     |
| Código e configuração | `/srv/mais360` — `src/` (código do commit), `compose.yml`, `Caddyfile`, `.env` |

Uma só imagem Docker (`Dockerfile` na raiz) serve o site, o worker e as migrações; só muda o
comando. Os arquivos de produção ficam em `deploy/`.

### Por que pool de conexões

O plano do banco permite 22 conexões. Site e worker passam pelo PgBouncer (modo transação, 15
conexões reais) com `pgbouncer=true`; o compose limita cada processo (site 6, worker 4).
Migrações precisam de sessão exclusiva e usam a conexão direta (`DIRECT_URL`). A fila de jobs
usa `FOR UPDATE SKIP LOCKED` dentro de transação e não usa advisory locks nem LISTEN/NOTIFY —
compatível com o modo transação.

### Por que a porta 2525 no e-mail

A DigitalOcean bloqueia a saída nas portas 25, 465 e 587. A Brevo atende também na 2525.

## Publicar uma versão nova

Pré-requisitos na máquina de quem publica: Git Bash e a chave `~/.ssh/id_mais360` (a mesma
cadastrada no droplet).

```bash
npm run check          # precisa passar
git commit ...         # o deploy publica só o que está commitado
deploy/deploy.sh       # envia, constrói, migra, troca e confere a saúde
```

O script faz, nesta ordem:

1. envia o código do commit atual (`git archive`) para `/srv/mais360/src`;
2. constrói a imagem `mais360-app:<commit>` no servidor (3 a 6 minutos);
3. aplica as migrações com a imagem nova (`prisma migrate deploy`, conexão direta) — se falhar,
   nada muda no ar;
4. marca a versão anterior como `previous`, a nova como `current` e recria web e worker;
5. espera o site responder `/api/health` (até 2 minutos).

A troca tem alguns segundos de indisponibilidade enquanto o container do site reinicia. O
worker termina os jobs em andamento antes de parar (até 60 s).

### Outros comandos

```bash
deploy/deploy.sh status     # containers, saúde e imagens
deploy/deploy.sh rollback   # volta para a imagem anterior
```

**Rollback não desfaz migrações.** Migrações devem ser compatíveis com a versão anterior do
código (adicionar colunas/tabelas; remover só num deploy seguinte). Se uma migração quebrar
dados, restaure o banco pelo painel da DigitalOcean (ver Backups).

## Primeira instalação (já feita em novembro de 2026)

Registro do que foi feito, para recriar o servidor do zero se preciso.

1. **Droplet** Ubuntu 24.04 com a chave SSH `mais360-deploy`; backups diários (1h–5h BRT).
2. **Preparação** (como root, uma vez): fuso UTC, atualizações automáticas, ufw (22, 80,
   443/tcp e 443/udp), fail2ban, swap de 2 GB, Docker com compose, usuário `deploy` (sudo e
   grupo docker), SSH só por chave e sem root (`/etc/ssh/sshd_config.d/00-hardening.conf`).
3. **Banco**: cluster PostgreSQL 17 na mesma região e VPC; trusted source = o droplet; banco
   `mais360` e usuário `mais360_app` criados no painel; posse transferida com o `doadmin`:
   ```sql
   ALTER DATABASE mais360 OWNER TO mais360_app;
   -- conectado no banco mais360:
   ALTER SCHEMA public OWNER TO mais360_app;
   ```
   Pool `mais360` (Transaction, 15) na aba Connection Pools.
4. **DNS** (Hostinger, zona `mais.tur.br`): `A 360 → 159.89.37.95`.
5. **`.env`** em `/srv/mais360/.env` a partir de `deploy/env.production.example`, com
   `chmod 600`. `AUTH_SECRET` e `ENCRYPTION_KEY` gerados no servidor com `openssl rand`.
   **Guarde o `ENCRYPTION_KEY` fora do servidor**: sem ele, os segredos cifrados no banco
   (SMTP e WhatsApp dos clientes) não abrem mais.
6. **Primeiro deploy** com `deploy/deploy.sh`, e o seed (superadmin, planos, assinante Mais
   Corporativo e os clientes ABIEC/ABRADILAN):
   ```bash
   ssh -i ~/.ssh/id_mais360 deploy@159.89.37.95
   cd /srv/mais360 && docker compose --profile tools run --rm migrate \
     /app/node_modules/.bin/tsx prisma/seed.ts
   ```
   Depois, apague `SEED_MASTER_PASSWORD` do `.env` e troque a senha no primeiro acesso.

## Domínios

- Agora: só `360.mais.tur.br` aponta para o servidor.
- **Dia da migração** da ABIEC/ABRADILAN: trocar `abiec` e `abradilanviagens` (hoje no
  sistema antigo, CDN da Hostinger) para `A → 159.89.37.95` e criar `A * → 159.89.37.95` e
  `A clientes → 159.89.37.95`. Registros explícitos (site, e-mail, `em` da Brevo) continuam
  valendo acima do curinga.
- Os certificados dos clientes saem sozinhos no primeiro acesso (Caddy pergunta a
  `/api/tls/ask`). Detalhes em `docs/DOMINIOS.md`.

## Backups

| O quê              | Como                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Banco              | Automático do cluster: diário + restauração a qualquer ponto dos últimos 7 dias (painel → Backups → Restore, cria um cluster novo) |
| Arquivos enviados  | Backup diário do droplet (retém 7 dias)                                                                                            |
| `.env` de produção | Cópia fora do servidor, em cofre de senhas                                                                                         |

**Pendente:** cópia noturna de `/srv/mais360/storage` para um bucket do Spaces, para ter os
arquivos fora do droplet.

## Diagnóstico rápido

```bash
ssh -i ~/.ssh/id_mais360 deploy@159.89.37.95
cd /srv/mais360
docker compose ps                     # estado e saúde
docker compose logs -f --tail 100 web # ou worker / caddy
docker stats --no-stream              # memória e CPU
curl -s https://360.mais.tur.br/api/health
```

| Sintoma                                      | Onde olhar                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Site fora do ar, Caddy responde 502/503      | `docker compose logs web`; `deploy/deploy.sh rollback` se veio de um deploy |
| E-mails não saem                             | painel `/console/plataforma/operacao`; logs do worker; Brevo → Logs         |
| "too many clients" / tempo esgotado no banco | conexões no painel do cluster (Insights); limites no `compose.yml`          |
| Certificado de cliente não sai               | `docker compose logs caddy`; domínio precisa estar `VERIFIED`               |
| Disco cheio                                  | `docker system df`; `docker image prune`; tamanho de `storage/`             |
