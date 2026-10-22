#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
revision="$(git -C "$repo_root" rev-parse HEAD)"
config="${HANASAND_MAIL_NGINX_CONFIG:-/home/hanasand/openresty/nginx/conf.d/default.conf}"
production_env="${HANASAND_MAIL_API_ENV_FILE:-/home/hanasand/hanasand/.env}"
container="hanasand_mail_ui"
candidate="hanasand_mail_ui_candidate"
image="hanasand-mail-ui:${revision}"
api_image="hanasand-mail-api:${revision}"
api_compose="$repo_root/api/compose.example.yml"
api_project=""
api_port=""
backup=""
config_changed=false
finished=false
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
if [[ ! -f "$production_env" || ! -f "$api_compose" ]]; then
    echo 'Mail API production configuration is missing.' >&2
    exit 1
fi
browser_reputation_token="$(awk -F= '$1 == "BROWSER_REPUTATION_LOOKUP_TOKEN" { sub(/^[^=]*=/, ""); print; exit }' "$production_env")"
if [[ ! "$browser_reputation_token" =~ ^[a-f0-9]{64}$ ]]; then
    echo 'Set BROWSER_REPUTATION_LOOKUP_TOKEN to the matching Browser service secret in the Mail API environment.' >&2
    exit 1
fi

docker build --pull --build-arg NEXT_PUBLIC_MAIL_API_BASE=https://mail.hanasand.com/api -t "$image" "$repo_root"
docker rm -f "$candidate" >/dev/null 2>&1 || true
docker run -d --name "$candidate" --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m --memory 512m --cpus 1 -p 127.0.0.1:3021:3000 "$image" >/dev/null
cleanup() {
    status=$?
    if [[ "$config_changed" == true && -n "$backup" && -f "$backup" ]]; then
        cp -p "$backup" "$config"
        docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null 2>&1 || true
        docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null 2>&1 || true
    fi
    docker rm -f "$candidate" "${container}_next" >/dev/null 2>&1 || true
    if [[ "$finished" != true && -n "$api_project" ]]; then compose_api down >/dev/null 2>&1 || true; fi
    [[ -z "$backup" ]] || rm -f "$backup"
    exit "$status"
}
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

read -r active_port active_api_port < <(python3 - "$config" <<'PYPORT'
from pathlib import Path
import re, sys
text = Path(sys.argv[1]).read_text()
matches = []
for start in re.finditer(r'(?m)^server\s*\{', text):
    depth = 0
    for index in range(start.end() - 1, len(text)):
        depth += text[index] == '{'
        depth -= text[index] == '}'
        if depth == 0:
            block = text[start.start():index + 1]
            if re.search(r'(?m)^\s*server_name\s+mail\.hanasand\.com\s*;', block): matches.append(block)
            break
if len(matches) != 1: raise SystemExit('Expected exactly one mail.hanasand.com OpenResty server block.')
web = re.search(r'(?m)^\s*location\s+/\s*\{[^}]*?proxy_pass\s+http://127\.0\.0\.1:(\d+)\s*;', matches[0])
api = re.search(r'(?m)^\s*location\s+\^~\s+/api/mail/\s*\{[^}]*?proxy_pass\s+http://127\.0\.0\.1:(\d+)\s*;', matches[0])
print(web.group(1) if web else '0', api.group(1) if api else '0')
PYPORT
)
if [[ "$active_port" == 3010 ]]; then port=3011; else port=3010; fi
if [[ "$active_api_port" == 8085 ]]; then api_port=8086; else api_port=8085; fi
api_ipv4_address="$(awk -F= -v key="MAIL_API_IPV4_ADDRESS_${api_port}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$production_env")"
if [[ ! "$api_ipv4_address" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    echo "Set MAIL_API_IPV4_ADDRESS_${api_port} to an unused address on the mail Docker network." >&2
    exit 1
fi
api_project="hanasand-mail-api-${api_port}"
compose_api_for() {
    local port="$1" address="$2" project="$3"
    shift 3
    MAIL_API_IMAGE="$api_image" MAIL_API_PORT="$port" MAIL_API_IPV4_ADDRESS="$address" \
        docker compose --project-name "$project" --env-file "$production_env" -f "$api_compose" "$@"
}
compose_api() {
    compose_api_for "$api_port" "$api_ipv4_address" "$api_project" "$@"
}

compose_api build
compose_api up -d --no-build --wait
api_container="$(compose_api ps -q mail-api)"
if [[ -z "$api_container" || "$(docker inspect -f '{{.State.Health.Status}}' "$api_container")" != healthy ]]; then
    echo 'Mail API candidate did not become healthy.' >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
if ! docker exec "$api_container" bun -e '
const endpoint = process.env.BROWSER_REPUTATION_LOOKUP_URL
const token = process.env.BROWSER_REPUTATION_LOOKUP_TOKEN
if (!endpoint || !token) throw new Error("Managed Browser lookup is not configured")
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ kind: "invalid", value: "" }),
  signal: AbortSignal.timeout(5000),
})
if (response.status !== 400) throw new Error(`Browser reputation route returned HTTP ${response.status}, expected 400 for invalid input`)
console.log("Private Browser reputation route is reachable and authenticated.")
'; then
    echo 'Mail API candidate could not authenticate to the private Browser reputation route.' >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
candidate_api_status="$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${api_port}/api/mail/overview" || true)"
if [[ "$candidate_api_status" != 401 ]]; then
    echo "Mail API candidate returned HTTP ${candidate_api_status:-no response}, expected 401." >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
identity_probe_status="$(curl --silent --show-error --max-time 8 --output /dev/null --write-out '%{http_code}' \
    -H 'id: mail-deployment-probe' \
    -H 'Authorization: Bearer invalid-mail-deployment-probe' \
    "http://127.0.0.1:${api_port}/api/mail/overview" || true)"
if [[ "$identity_probe_status" != 401 ]]; then
    echo "Mail API could not validate a session with Identity (HTTP ${identity_probe_status:-no response})." >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
candidate_sso_status="$(curl --silent --show-error --max-time 8 --output /dev/null --write-out '%{http_code}' \
    "http://127.0.0.1:${api_port}/api/auth/sso/start?redirectPath=%2F" || true)"
if [[ "$candidate_sso_status" != 303 && "$candidate_sso_status" != 503 ]]; then
    echo "Mail API SSO proxy returned HTTP ${candidate_sso_status:-no response}; expected an Identity redirect or unconfigured-provider response." >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
if ! docker exec "$api_container" bun -e '
const base = process.env.MAIL_INTERNAL_URL || "http://127.0.0.1:8081"
const response = await fetch(new URL("/jmap/session", base), { signal: AbortSignal.timeout(5000) })
if (!response.ok) throw new Error(`Stalwart returned HTTP ${response.status}`)
const session = await response.json()
if (typeof session.apiUrl !== "string" || !session.apiUrl) throw new Error("Stalwart returned no JMAP API URL")
console.log("Stalwart JMAP endpoint is reachable.")
'; then
    echo 'Mail API could not reach Stalwart JMAP.' >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8183/ready | grep -q '"service":"identity"'; then
    echo 'Production Identity is not ready to validate mail sessions.' >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
if ! docker exec "$api_container" bun run provision:shared-mailboxes; then
    echo 'Shared Mailboxes could not be provisioned and verified; keeping the current Mail API active.' >&2
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi

docker rm -f "$candidate" >/dev/null
docker rm -f "${container}_next" >/dev/null 2>&1 || true
docker run -d --name "${container}_next" --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m --memory 512m --cpus 1 -p "127.0.0.1:${port}:3000" "$image" >/dev/null
for attempt in $(seq 1 40); do
    if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:"$port"/health | grep -q '"service":"hanasand-mail"'; then break; fi
    if [[ "$attempt" == 40 ]]; then docker logs "${container}_next" >&2; docker rm -f "${container}_next" >/dev/null; exit 1; fi
    sleep 2
done

backup="$(mktemp "${config}.mail-backup.XXXXXX")"
cp -p "$config" "$backup"
config_changed=true
python3 - "$config" "$port" "$api_port" <<'PY'
from pathlib import Path
import re, sys
path, port, api_port = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
matches = []
for start in re.finditer(r'(?m)^server\s*\{', text):
    depth = 0
    for index in range(start.end() - 1, len(text)):
        depth += text[index] == '{'
        depth -= text[index] == '}'
        if depth == 0:
            block = text[start.start():index + 1]
            if re.search(r'(?m)^\s*server_name\s+mail\.hanasand\.com\s*;', block): matches.append((start.start(), index + 1, block))
            break
if len(matches) != 1: raise SystemExit('Expected exactly one mail.hanasand.com server block.')
start, end, block = matches[0]
for route in (r'/api/auth/', r'/api/mail/', r'/api/backend/mail/'):
    block, _ = re.subn(rf'(?ms)^\s*location\s+\^~\s+{re.escape(route)}\s*\{{.*?^\s*\}}\s*', '', block)
block, _ = re.subn(r'(?ms)^\s*location\s*=\s*/api/auth/sessions\s*\{.*?^\s*\}\s*', '', block)
root = re.compile(r'(?ms)^\s*location\s+/\s*\{.*?^\s*\}')
replacement = f'''    location = /api/auth/sessions {{
        proxy_pass http://127.0.0.1:8183;
        include snippets/proxy-headers.conf;
    }}

    location ^~ /api/auth/ {{
        proxy_pass http://127.0.0.1:{api_port};
        include snippets/proxy-headers.conf;
    }}

    location ^~ /api/mail/ {{
        client_max_body_size 25m;
        proxy_request_buffering off;
        proxy_pass http://127.0.0.1:{api_port};
        include snippets/proxy-headers.conf;
    }}

    location / {{
        log_by_lua_file /usr/local/openresty/nginx/lua/traffic_logger.lua;
        proxy_pass http://127.0.0.1:{port};
        include snippets/proxy-headers.conf;
    }}'''
updated, count = root.subn(replacement, block)
if count != 1: raise SystemExit('Expected exactly one root location in the mail server block.')
path.write_text(text[:start] + updated + text[end:])
PY
if ! docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null; then
    echo 'OpenResty rejected the mail route configuration; rolling back.' >&2
    exit 1
fi
docker exec openresty /usr/local/openresty/bin/openresty -s reload
curl_local_mail() {
    curl --haproxy-protocol --resolve mail.hanasand.com:8443:127.0.0.1 "$@"
}
wait_for_mail_status() {
    local expected="$1" url="$2" status
    for attempt in $(seq 1 20); do
        status="$(curl_local_mail --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "$url" || true)"
        if [[ "$status" == "$expected" ]]; then return 0; fi
        sleep 1
    done
    return 1
}
if ! docker exec openresty /usr/local/openresty/bin/openresty -T 2>&1 \
    | grep -F "proxy_pass http://127.0.0.1:${api_port};" >/dev/null; then
    echo 'OpenResty did not load the candidate Mail API route; rolling back.' >&2
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
mail_route_ready=false
for attempt in $(seq 1 20); do
    if curl_local_mail --fail --silent --max-time 5 https://mail.hanasand.com:8443/health | grep -q '"service":"hanasand-mail"'; then
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
if ! wait_for_mail_status 401 https://mail.hanasand.com:8443/api/mail/overview; then
    api_status="$(curl_local_mail --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' https://mail.hanasand.com:8443/api/mail/overview || true)"
    api_response_headers="$(curl_local_mail --silent --show-error --max-time 5 --dump-header - --output /dev/null https://mail.hanasand.com:8443/api/mail/overview || true)"
    echo "Dedicated Mail API route returned HTTP ${api_status:-no response}; response headers follow; rolling back." >&2
    tr -d '\r' <<<"$api_response_headers" | grep -iE '^(HTTP/|server:|content-type:|x-powered-by:|via:)' >&2 || true
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
mail_root="$(curl_local_mail --fail --silent --show-error --max-time 5 https://mail.hanasand.com:8443/ || true)"
if ! grep -q 'Hanasand Mail' <<<"$mail_root" \
    || ! grep -q 'hanasand-login-form' <<<"$mail_root" \
    || ! grep -q 'passkey-options-url' <<<"$mail_root" \
    || ! grep -q 'passkey-verify-url' <<<"$mail_root" \
    || ! grep -q 'sso-href' <<<"$mail_root" \
    || grep -q 'api.hanasand.com/api/auth/login-form.js' <<<"$mail_root"; then
    echo 'Standalone mail root did not render the shared Identity sign-in form and its password, passkey, and SSO routes; rolling back.' >&2
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
auth_sso_status=""
for attempt in $(seq 1 20); do
    auth_sso_status="$(curl_local_mail --silent --show-error --max-time 8 --output /dev/null --write-out '%{http_code}' \
        'https://mail.hanasand.com:8443/api/auth/sso/start?redirectPath=%2F' || true)"
    if [[ "$auth_sso_status" == 303 || "$auth_sso_status" == 503 ]]; then break; fi
    sleep 1
done
if [[ "$auth_sso_status" != 303 && "$auth_sso_status" != 503 ]]; then
    echo "Mail auth route returned HTTP ${auth_sso_status:-no response} for SSO start; expected an Identity redirect or unconfigured-provider response; rolling back." >&2
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
identity_url=https://mail.hanasand.com:8443/api/auth/sessions
if ! wait_for_mail_status 401 "$identity_url"; then
    identity_status="$(curl_local_mail --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "$identity_url" || true)"
    echo "Mail host Identity route returned HTTP ${identity_status:-no response}, expected 401 for an unauthenticated role lookup; rolling back." >&2
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
cors_allowed=false
for attempt in $(seq 1 20); do
    cors_headers="$(curl_local_mail --silent --show-error --max-time 5 --dump-header - --output /dev/null --request OPTIONS \
        -H 'Origin: https://hanasand.com' \
        -H 'Access-Control-Request-Method: GET' \
        -H 'Access-Control-Request-Headers: authorization,content-type,dpop,id' \
        https://mail.hanasand.com:8443/api/mail/overview || true)"
    if tr -d '\r' <<<"$cors_headers" | grep -qi '^access-control-allow-origin: https://hanasand.com$'; then
        cors_allowed=true
        break
    fi
    sleep 1
done
if [[ "$cors_allowed" != true ]]; then
    echo 'Mail API CORS did not allow the Hanasand dashboard; rolling back.' >&2
    cp -p "$backup" "$config"
    docker exec openresty /usr/local/openresty/bin/openresty -t >/dev/null
    docker exec openresty /usr/local/openresty/bin/openresty -s reload >/dev/null
    docker rm -f "${container}_next" >/dev/null 2>&1 || true
    compose_api down >/dev/null 2>&1 || true
    exit 1
fi
docker rm -f "$container" >/dev/null 2>&1 || true
docker rename "${container}_next" "$container"
if [[ "$active_api_port" != 0 ]]; then
    old_api_project="hanasand-mail-api-${active_api_port}"
    sleep 5
    old_api_ipv4_address="$(awk -F= -v key="MAIL_API_IPV4_ADDRESS_${active_api_port}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$production_env")"
    compose_api_for "$active_api_port" "$old_api_ipv4_address" "$old_api_project" down >/dev/null 2>&1 || true
fi
finished=true
config_changed=false
printf 'Deployed %s: standalone mail UI and dedicated Mail API are live on mail.hanasand.com.\n' "$revision"
