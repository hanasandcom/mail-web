#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
revision="$(git -C "$repo_root" rev-parse HEAD)"
config="${HANASAND_MAIL_NGINX_CONFIG:-/home/hanasand/openresty/nginx/conf.d/default.conf}"
container="hanasand_mail_ui"
candidate="hanasand_mail_ui_candidate"
image="hanasand-mail-ui:${revision}"
if [[ ! -f "$config" ]]; then
    echo "OpenResty config not found: $config" >&2
    exit 1
fi
if [[ "$(git -C "$repo_root" branch --show-current)" != main ]]; then
    echo 'Deploy the mail app from main.' >&2
    exit 1
fi
if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
    echo 'The mail app checkout must be clean before deployment.' >&2
    exit 1
fi
if ! curl --fail --silent --show-error --max-time 5 https://api.hanasand.com/api/health | grep -q '"ok":true'; then
    echo 'The public mail API is unavailable; refusing to deploy.' >&2
    exit 1
fi
api_cors_headers="$(curl --silent --show-error --max-time 5 --dump-header - --output /dev/null --request OPTIONS \
    -H 'Origin: https://mail.hanasand.com' \
    -H 'Access-Control-Request-Method: GET' \
    -H 'Access-Control-Request-Headers: authorization,content-type,id,idempotency-key' \
    https://api.hanasand.com/api/mail/overview || true)"
if ! tr -d '\r' <<<"$api_cors_headers" | grep -qi '^access-control-allow-origin: https://mail.hanasand.com$'; then
    echo 'The public mail API does not allow browser requests from mail.hanasand.com; refusing to deploy.' >&2
    exit 1
fi
if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker build --pull -t "$image" "$repo_root"
fi
docker rm -f "$candidate" >/dev/null 2>&1 || true
docker run -d --name "$candidate" --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m --memory 512m --cpus 1 -p 127.0.0.1:3021:3000 "$image" >/dev/null
cleanup() { docker rm -f "$candidate" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for attempt in $(seq 1 40); do
    if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3021/health | grep -q '"service":"hanasand-mail"'; then break; fi
    if [[ "$attempt" == 40 ]]; then docker logs "$candidate" >&2; exit 1; fi
    sleep 2
done

# Build and verify the candidate before waiting on the shared deploy lock.
# Only the production switch needs to serialize with the main-site proxy reload.
exec 9>/tmp/hanasand-full-deploy.lock
flock -x 9

active_port="$(python3 - "$config" <<'PYPORT'
from pathlib import Path
import re, sys
text = Path(sys.argv[1]).read_text()
blocks = list(re.finditer(r'(?ms)^server\s*\{.*?^\}', text))
matching = [match.group() for match in blocks if re.search(r'(?m)^\s*server_name\s+mail\.hanasand\.com\s*;', match.group())]
if len(matching) != 1:
    raise SystemExit('Expected exactly one mail.hanasand.com OpenResty server block.')
proxy = re.search(r'(?m)^\s*proxy_pass\s+http://(?:localhost|127\.0\.0\.1):(\d+)\s*;', matching[0])
if not proxy:
    raise SystemExit('Could not find the mail web upstream.')
print(proxy.group(1))
PYPORT
)"
if [[ "$active_port" == 3010 ]]; then port=3011; else port=3010; fi

docker rm -f "$candidate" >/dev/null
trap - EXIT
docker rm -f "${container}_next" >/dev/null 2>&1 || true
docker run -d --name "${container}_next" --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m --memory 512m --cpus 1 -p "127.0.0.1:${port}:3000" "$image" >/dev/null
for attempt in $(seq 1 40); do
    if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:"$port"/health | grep -q '"service":"hanasand-mail"'; then break; fi
    if [[ "$attempt" == 40 ]]; then docker logs "${container}_next" >&2; docker rm -f "${container}_next" >/dev/null; exit 1; fi
    sleep 2
done

backup="${config}.mail-backup"
cp -p "$config" "$backup"
python3 - "$config" "$port" <<'PY'
from pathlib import Path
import re, sys
path, port = Path(sys.argv[1]), sys.argv[2]
text = path.read_text()
blocks = list(re.finditer(r'(?ms)^server\s*\{.*?^\}', text))
matching = [match for match in blocks if re.search(r'(?m)^\s*server_name\s+mail\.hanasand\.com\s*;', match.group())]
if len(matching) != 1:
    raise SystemExit('Expected exactly one mail.hanasand.com OpenResty server block.')
block = matching[0].group()
proxy = re.compile(r'(?m)^(\s*proxy_pass\s+)http://(?:localhost|127\.0\.0\.1):(?:8081|3010|\d+)(;\s*)$')
updated, count = proxy.subn(lambda m: f'{m.group(1)}http://127.0.0.1:{port}{m.group(2)}', block)
if count != 1:
    raise SystemExit('Expected exactly one HTTP proxy_pass in the mail server block.')
api_pattern = re.compile(r'(?ms)^\s*location\s+\^~\s+/api/backend/mail/\s*\{.*?^\s*\}')
updated, api_count = api_pattern.subn('', updated)
if api_count > 1:
    raise SystemExit('Found multiple legacy mail API proxy locations.')
path.write_text(text[:matching[0].start()] + updated + text[matching[0].end():])
PY
if ! docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null; then
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null 2>&1 || true
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    exit 1
fi
docker exec openresty /usr/local/openresty/bin/openresty -s reload
mail_route_ready=false
for attempt in $(seq 1 20); do
    if curl --fail --silent --max-time 5 --resolve mail.hanasand.com:443:127.0.0.1 https://mail.hanasand.com/health | grep -q '"service":"hanasand-mail"'; then
        mail_route_ready=true
        break
    fi
    sleep 1
done
if [[ "$mail_route_ready" != true ]]; then
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    exit 1
fi
api_status="$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' https://api.hanasand.com/api/mail/overview || true)"
if [[ "$api_status" != 401 ]]; then
    echo "Direct mail API check returned HTTP ${api_status:-no response}; rolling back." >&2
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    exit 1
fi
docker rm -f "$container" >/dev/null 2>&1 || true
docker rename "${container}_next" "$container"
printf 'Deployed %s and routed mail.hanasand.com to the standalone Hanasand mail UI.\n' "$revision"
