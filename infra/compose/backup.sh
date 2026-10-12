#!/bin/sh
# Writes a compressed dump of the Net-Top database to backups/ beside this
# script and keeps the 14 newest. Run it by hand or from cron, for example
# daily at 02:00:  0 2 * * * /path/to/infra/compose/backup.sh
# Copy backups/ off the server too: a backup on the same disk is not a backup.
set -eu
cd "$(dirname "$0")"
mkdir -p backups
file="backups/nettop-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T postgres pg_dump -U nettop -d nettop --format=custom > "$file.tmp"
mv "$file.tmp" "$file"
ls -1t backups/nettop-*.dump | tail -n +15 | while read -r old; do rm -f "$old"; done
echo "$file"
