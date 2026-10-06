#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  echo "Existing .env retained."
  exit 0
fi
umask 077
{
  printf 'APP_KEY=base64:%s\n' "$(openssl rand -base64 32)"
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  printf 'RENDERER_TOKEN=%s\n' "$(openssl rand -hex 32)"
  printf 'FRONTEND_URL=http://localhost:3000\n'
} > .env
echo "Created private Docker configuration. Run docker compose up --build."
