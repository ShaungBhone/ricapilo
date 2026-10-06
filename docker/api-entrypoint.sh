#!/bin/sh
set -e
if [ "$(id -u)" = "0" ]; then
  chown -R www-data:www-data storage bootstrap/cache
fi
exec docker-php-entrypoint "$@"
