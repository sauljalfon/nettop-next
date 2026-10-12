# Net-Top on one server (Docker Compose)

The test server: it runs the same two images the cluster will run later, and
it holds **real data** (the network is entered here first and moved to the real
servers later), so treat its database as production data: back it up, keep
access closed, never run `seed` on it.

What runs (`compose.yaml`):

| Service | What it does |
| --- | --- |
| `postgres` | PostgreSQL 17; data in the `nettop_pgdata` volume; no published port |
| `migrate` | one-shot: `db migrate` (creates or updates the tables; repeatable) |
| `init` | one-shot: `db init` (the empty installed root if there is none; repeatable) |
| `api` | the API, `APP_ENV` from `.env` |
| `web` | the built frontend (nginx) |
| `traefik` | the only open port: `/api` → api, the rest → web, behind a password |

On every start the order is postgres healthy → migrate → init → api.

## First start on the server

Needs Docker Engine with the Compose plugin (`docker compose version`), git,
and about 2 GB of disk for the images.

```sh
# 1. The code (from your git server, or a bundle copied over).
git clone <repo-url> net-top-next      # or: git clone nettop-main.bundle net-top-next
cd net-top-next/infra/compose

# 2. Settings: a random database password and APP_ENV=test.
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
# check .env: APP_ENV=test, HTTP_PORT=8088

# 3. The login (one line per person; repeat with >> for more users).
mkdir -p secrets
docker run --rm httpd:2.4-alpine htpasswd -nbB <user> '<password>' > secrets/htpasswd

# 4. Build the images and start.
docker compose up -d --build
docker compose ps -a          # migrate and init: Exited (0); the rest: Up
```

Open `http://<server>:8088`, log in, and the header shows **TEST**. The
database starts empty: create the networks (Network ▸ Manage networks…), then
enter the network through plans as usual.

## Keep access closed

The app has no accounts of its own yet (M7), so the Traefik password is the only
login, and on plain HTTP it travels unencrypted. Also limit who can reach the
port, for example with ufw on Ubuntu:

```sh
sudo ufw allow from <your-office-ip> to any port 8088 proto tcp
sudo ufw deny 8088/tcp
```

(If the server has a DNS name, Traefik can add HTTPS with Let's Encrypt later.)

## Backups (do this the first day)

```sh
./backup.sh                   # writes backups/nettop-<UTC time>.dump, keeps 14
```

Run it every night from cron (`crontab -e`):

```
0 2 * * * /home/<user>/net-top-next/infra/compose/backup.sh >> /home/<user>/nettop-backup.log 2>&1
```

and **copy `backups/` off the server** regularly (scp or rsync to another
machine): a backup on the same disk is lost with it.

### Restore a backup

```sh
docker compose exec -T postgres pg_restore -U nettop -d nettop --clean --if-exists < backups/<file>.dump
docker compose restart api
```

`--clean` replaces everything in the database with the backup. Checked
2026-10-12: record a plan, back up, `docker compose down -v` (database
deleted), up, restore → sites, details, networks and recorded plans all back.

## Update to a new version

```sh
./backup.sh                   # always first
git pull                      # or copy the new bundle and pull from it
docker compose up -d --build  # migrate and init run again before the new api
```

## Moving the data to the real servers (later)

Same idea as a restore: run the same app version on both sides, take a backup
here with `./backup.sh`, carry the `.dump` file over, and `pg_restore` it into
the production database before the first start of the API there. IDs never
change, so drafts, recorded plans and the saved node layout come along.

## Useful commands

```sh
docker compose logs -f api              # API log
docker compose logs traefik | tail      # access log (who called what)
docker compose stop / start             # stop and start without losing data
docker compose down                     # remove the containers (data stays)
docker compose down -v                  # ALSO deletes the database: never on the test server
```
