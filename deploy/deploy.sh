#!/usr/bin/env bash
# Publica a Mais 360 no servidor de produção. Roda na máquina de quem faz o deploy
# (Git Bash no Windows serve). Guia completo: docs/DEPLOY.md.
#
#   deploy/deploy.sh            publica o commit atual (HEAD)
#   deploy/deploy.sh rollback   volta para a imagem anterior (NÃO desfaz migrações)
#   deploy/deploy.sh status     mostra containers, versão e saúde
#
# Só o que está COMMITADO vai para o servidor (git archive): alterações locais
# não entram. O build acontece no servidor; o .env de produção nunca sai de lá.
set -euo pipefail

HOST="${DEPLOY_HOST:-deploy@159.89.37.95}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_mais360}"
DIR="${DEPLOY_DIR:-/srv/mais360}"

remote() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }
step() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

wait_healthy() {
  remote "cd $DIR && for i in \$(seq 1 40); do
    s=\$(docker inspect -f '{{.State.Health.Status}}' \$(docker compose ps -q web) 2>/dev/null || echo starting)
    [ \"\$s\" = healthy ] && { echo 'site saudável'; exit 0; }
    sleep 3
  done; echo 'site não ficou saudável em 2 minutos'; docker compose logs --tail 60 web; exit 1"
}

case "${1:-deploy}" in
  status)
    remote "cd $DIR && docker compose ps && docker image ls mais360-app --format '{{.Tag}}\t{{.CreatedSince}}' | head -5"
    exit 0
    ;;
  rollback)
    step "Voltando para a imagem anterior"
    remote "cd $DIR && docker image inspect mais360-app:previous >/dev/null \
      && docker tag mais360-app:previous mais360-app:current \
      && docker compose up -d --remove-orphans"
    wait_healthy
    exit 0
    ;;
  deploy) ;;
  *) echo "uso: $0 [deploy|rollback|status]"; exit 2 ;;
esac

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Há alterações não commitadas. O deploy publica só o commit atual ($(git rev-parse --short HEAD))."
  [ "${FORCE:-}" = 1 ] || { echo "Commite antes, ou rode com FORCE=1 para publicar mesmo assim."; exit 1; }
fi
SHA="$(git rev-parse --short HEAD)"

step "Enviando o código do commit $SHA"
git archive --format=tar HEAD | remote "set -e
  rm -rf $DIR/src.new && mkdir -p $DIR/src.new $DIR/storage
  tar -x -C $DIR/src.new
  rm -rf $DIR/src && mv $DIR/src.new $DIR/src
  cp $DIR/src/deploy/compose.yml $DIR/compose.yml
  cp $DIR/src/deploy/Caddyfile $DIR/Caddyfile
  test -f $DIR/.env || { echo 'Falta $DIR/.env (ver docs/DEPLOY.md)'; exit 1; }
  docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null"

step "Construindo a imagem no servidor (alguns minutos)"
remote "cd $DIR && docker build --pull --build-arg APP_VERSION=$SHA -t mais360-app:$SHA src"

step "Aplicando migrações do banco"
remote "cd $DIR && APP_TAG=$SHA docker compose --profile tools run --rm migrate"

step "Trocando a versão no ar"
remote "cd $DIR && { docker image inspect mais360-app:current >/dev/null 2>&1 && docker tag mais360-app:current mais360-app:previous || true; } \
  && docker tag mais360-app:$SHA mais360-app:current \
  && docker compose up -d --remove-orphans \
  && { docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; }"

wait_healthy

step "Limpando imagens antigas (mantém atual, anterior e as 3 mais recentes)"
remote "docker image ls mais360-app --format '{{.Tag}}' | grep -vE '^(current|previous)$' | tail -n +4 | xargs -r -I{} docker rmi mais360-app:{} >/dev/null 2>&1 || true; docker image prune -f >/dev/null"

echo
echo "Publicado: $SHA"
