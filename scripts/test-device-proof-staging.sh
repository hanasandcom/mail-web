#!/usr/bin/env bash
set -euo pipefail
if test "$#" != 1; then echo 'Usage: scripts/test-device-proof-staging.sh /path/to/identity-git-checkout' >&2; exit 2; fi
mail_repo=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
identity_repo=$1
identity_revision=111fc5340b6e3c42cb4dc1128c5899f9e42ced52
reviewed_mail=c85f8bc66712c36283870dd12275e7359e04f8ef
test -z "$(git -C "$mail_repo" status --porcelain)" || { echo 'Mail staging requires a clean committed checkout.' >&2; exit 1; }
test -n "$(git -C "$identity_repo" remote)" || { echo 'Identity must come from a configured Git checkout.' >&2; exit 1; }
git -C "$identity_repo" cat-file -e "$identity_revision^{commit}"
git -C "$mail_repo" diff --exit-code "$reviewed_mail" HEAD -- api/src/utils/auth/session.ts api/tests/session-device-proof.postgres.test.ts >/dev/null
revision=$(git -C "$mail_repo" rev-parse HEAD)
exec 9>/tmp/hanasand-mail-bound-proof-stage.lock
flock -n 9 || { echo 'Another Mail proof staging check is running.' >&2; exit 1; }
network=hanasand-mail-bound-proof-stage
db=hanasand-mail-proof-db
runner=hanasand-mail-proof-runner
cidr=10.254.252.0/28
for name in "$db" "$runner"; do
    if docker inspect "$name" >/dev/null 2>&1; then echo 'Mail stage name already exists; stopping without changes.' >&2; exit 1; fi
done
if docker network inspect "$network" >/dev/null 2>&1; then echo 'Mail stage network already exists; stopping without changes.' >&2; exit 1; fi
identity_image=$(docker inspect -f '{{.Image}}' hanasand_auth_primary)
identity_release=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$identity_image")
test "$identity_release" = 111fc5340b6e3c42cb4dc1128c5899f9e42ced52 || { echo 'Identity runtime base changed; stopping.' >&2; exit 1; }
root=$(mktemp -d /tmp/hanasand-mail-proof-stage.XXXXXX)
created=''
network_created=0
cleanup() {
    result=$?
    trap - EXIT HUP INT TERM
    for name in $created; do docker rm -f "$name" >/dev/null 2>&1 || true; done
    if test "$network_created" = 1; then docker network rm "$network" >/dev/null 2>&1 || true; fi
    absent=1
    if ! docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then echo 'Cannot verify staging cleanup: Docker is unavailable.' >&2; result=1; absent=0; fi
    for name in "$db" "$runner"; do if docker inspect "$name" >/dev/null 2>&1; then echo 'Mail staging container cleanup failed.' >&2; result=1; absent=0; fi; done
    if docker network inspect "$network" >/dev/null 2>&1; then echo 'Mail staging network cleanup failed.' >&2; result=1; absent=0; fi
    if test "$absent" = 1; then echo 'Mail stage containers and network confirmed absent.'; fi
    rm -rf "$root"
    exit "$result"
}
trap cleanup EXIT HUP INT TERM
mkdir -p "$root/identity" "$root/mail"
git -C "$identity_repo" archive "$identity_revision" | tar -x -C "$root/identity"
git -C "$mail_repo" archive HEAD api/src/utils/auth/session.ts api/tests/session-device-proof.postgres.test.ts | tar -x -C "$root/mail"
ln -s /app/node_modules "$root/identity/node_modules"
docker network inspect $(docker network ls -q) --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}' > "$root/docker-subnets.txt"
ip -j route show > "$root/host-routes.json"
python3 - "$root" "$cidr" <<'PY'
from pathlib import Path
import ipaddress,json,sys
root=Path(sys.argv[1]); candidate=ipaddress.ip_network(sys.argv[2])
subnets=root.joinpath('docker-subnets.txt').read_text().split()
routes=[route.get('dst','') for route in json.loads(root.joinpath('host-routes.json').read_text())]
for value in subnets+routes:
    if not value or value=='default': continue
    network=ipaddress.ip_network(value,strict=False)
    if network.version==candidate.version and network.overlaps(candidate): raise SystemExit('Proposed Mail staging subnet overlaps an existing network/route; stopping.')
print('Mail stage subnet verified unused against Docker IPAM and host routes.')
PY
docker network create --internal --subnet "$cidr" "$network" >/dev/null
network_created=1
created="$db $created"
docker run -d --name "$db" --network "$network" --network-alias mail-bound-proof-db --memory 384m --cpus 1 --tmpfs /var/lib/postgresql/data:rw,size=512m -e POSTGRES_DB=mail_device_proof_stage -e POSTGRES_USER=synthetic -e POSTGRES_PASSWORD=synthetic-local-only postgres:15-alpine >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if docker exec "$db" pg_isready -U synthetic -d mail_device_proof_stage >/dev/null 2>&1; then break; fi
    sleep 1
done
created="$runner $created"
printf 'Mail candidate %s with immutable Identity source/runtime %s; synthetic auth boundary only.\n' "$revision" "$identity_release"
docker run --rm --name "$runner" --network "$network" --memory 512m --cpus 1 --user "$(id -u):$(id -g)" -v "$root/identity:/identity:ro" -v "$root/mail/api:/app/mail-api:ro" -w /identity -e RUN_MAIL_IDENTITY_DB_TESTS=1 -e IDENTITY_SOURCE_DIR=/identity -e AUTH_SERVICE_ONLY=1 -e DB_HOST=mail-bound-proof-db -e DB_POOL_HOST=mail-bound-proof-db -e DB_PORT=5432 -e DB_POOL_PORT=5432 -e DB=mail_device_proof_stage -e DB_NAME=mail_device_proof_stage -e DB_USER=synthetic -e DB_PASSWORD=synthetic-local-only -e HANASAND_IDENTITY_SERVICE_TOKEN=synthetic-mail-proof-service-token "$identity_image" bun test /app/mail-api/tests/session-device-proof.postgres.test.ts
