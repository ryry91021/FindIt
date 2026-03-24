#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_REF="${1:?Usage: deploy-frontend.sh <image-ref>}"
APP_DIR="/opt/findit"
COMPOSE_FILE="$APP_DIR/deploy/docker-compose.yml"
PREV_IMAGE_FILE="$APP_DIR/.frontend_previous_image"

cd "$APP_DIR"

CURRENT_IMAGE="$(docker inspect -f '{{.Config.Image}}' findit-frontend 2>/dev/null || true)"
if [ -n "$CURRENT_IMAGE" ]; then
  echo "$CURRENT_IMAGE" > "$PREV_IMAGE_FILE"
fi

export IMAGE_REF

docker compose -f "$COMPOSE_FILE" config >/dev/null
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d frontend

echo "Checking health..."
for i in $(seq 1 20); do
  if curl -fsS https://a-where.app >/dev/null 2>&1 || curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
    echo "Deployment healthy."
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 3
done

echo "Deployment unhealthy. Rolling back..."
if [ -f "$PREV_IMAGE_FILE" ]; then
  export IMAGE_REF="$(cat "$PREV_IMAGE_FILE")"
  docker compose -f "$COMPOSE_FILE" up -d frontend
fi

exit 1