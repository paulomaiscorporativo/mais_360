# Imagem única da Mais 360: o mesmo build serve o site (web), o worker e as
# migrações — só muda o comando (ver deploy/compose.yml e docs/DEPLOY.md).
#
#   docker build --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t mais360-app .

FROM node:22-bookworm-slim AS base
# openssl: o Prisma detecta a versão para escolher o motor; tini: PID 1 que repassa sinais
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependências (camada em cache enquanto os package.json não mudam) ──────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/prisma.config.ts packages/db/
COPY packages/documents/package.json packages/documents/
COPY packages/messaging/package.json packages/messaging/
COPY packages/migrate/package.json packages/migrate/
# O postinstall do @mais/db roda `prisma generate`, que precisa do schema
COPY packages/db/prisma/schema packages/db/prisma/schema
RUN npm ci --no-audit --no-fund

# ── Build do site ──────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema
# Valores fictícios só para o build passar pela validação do ambiente; os reais
# chegam em tempo de execução (o build não abre conexão com o banco).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="somente-para-o-build-0123456789abcdef0123456789abcdef" \
    NODE_OPTIONS="--max-old-space-size=3072" \
    npm run build -w @mais/web \
  && rm -rf apps/web/.next/cache

# ── Execução ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ARG APP_VERSION=""
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    STORAGE_DIR=/data/storage \
    WORKER_HEALTH_FILE=/tmp/mais-worker-health
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# Processos chamados direto (sem npm no meio) para o SIGTERM chegar a quem precisa
CMD ["/app/node_modules/.bin/next", "start", "/app/apps/web", "-p", "3000", "-H", "0.0.0.0"]
