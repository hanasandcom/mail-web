import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const deploy = resolve(import.meta.dir, '../../scripts/deploy.sh')
const other = `server {
    server_name unrelated.example.test;
    location / { proxy_pass http://127.0.0.1:8085; }
}
`
const mail = `server {
    server_name mail.hanasand.com;
    location = /api/auth/sessions {
        proxy_pass http://127.0.0.1:8183;
        include snippets/proxy-headers.conf;
    }
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:8085;
        include snippets/proxy-headers.conf;
    }
    location ^~ /api/mail/ {
        client_max_body_size 25m;
        proxy_pass http://127.0.0.1:8085;
        include snippets/proxy-headers.conf;
    }
    location / {
        log_by_lua_file /usr/local/openresty/nginx/lua/traffic_logger.lua;
        proxy_pass http://127.0.0.1:3010;
        include snippets/proxy-headers.conf;
    }
}
`
function run(args: string[], env: Record<string, string> = {}) {
    const root = mkdtempSync(join(tmpdir(), 'mail-deploy-mode-'))
    try {
        mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'api'))
        const config = join(root, 'nginx.conf'), runtime = join(root, 'runtime.env'), log = join(root, 'commands.log')
        writeFileSync(config, other + mail)
        writeFileSync(join(root, 'api/compose.example.yml'), 'services: {}\n')
        writeFileSync(runtime, `BROWSER_REPUTATION_LOOKUP_TOKEN=${'a'.repeat(64)}\nMAIL_API_IPV4_ADDRESS_8085=10.0.0.5\nMAIL_API_IPV4_ADDRESS_8086=10.0.0.6\n`)
        const shim = (name: string, body: string) => writeFileSync(join(root, 'bin', name), `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' '${name} '"$*" >> "$MOCK_LOG"\n${body}\n`, { mode: 0o755 })
        shim('git', `case "$*" in
            *--show-toplevel*) echo "$MOCK_ROOT";;
            *--show-current*) echo main;;
            *--porcelain*) if [[ \${MOCK_DIRTY:-} == 1 ]]; then echo ' M protected.txt'; fi;;
            *'rev-parse HEAD'*) echo synthetic-revision;;
            *) exit 1;;
        esac`)
        shim('flock', 'exit 0')
        shim('sleep', 'exit 0')
        shim('docker', `case "$*" in
            *'ps -q mail-api'*) echo synthetic-mail-api;;
            *'inspect -f'*) echo healthy;;
            *'openresty -T'*) cat "$HANASAND_MAIL_NGINX_CONFIG";;
            *'openresty -t'*)
                if [[ \${MOCK_NGINX_FAIL:-} == 1 && ! -f "$MOCK_ROOT/nginx-failed" ]]; then touch "$MOCK_ROOT/nginx-failed"; exit 1; fi;;
            *'run -d'*) echo synthetic-container;;
        esac`)
        shim('curl', `if [[ "$*" == *--write-out* ]]; then
            if [[ "$*" == *'/api/auth/sso/start'* ]]; then printf 303; else printf 401; fi
        elif [[ "$*" == *'--request OPTIONS'* ]]; then
            printf 'access-control-allow-origin: https://hanasand.com\\r\\n'
        elif [[ "$*" == *'/ready'* ]]; then
            printf '{"service":"identity"}'
        elif [[ "$*" == *'/health'* ]]; then
            printf '{"service":"hanasand-mail"}'
        else
            printf 'Hanasand Mail hanasand-login-form passkey-options-url passkey-verify-url sso-href'
        fi`)
        const child = Bun.spawnSync(['bash', deploy, ...args], { cwd: root, env: { ...process.env, ...env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, MOCK_ROOT: root, MOCK_LOG: log, HANASAND_MAIL_NGINX_CONFIG: config, HANASAND_MAIL_API_ENV_FILE: runtime }, stdout: 'pipe', stderr: 'pipe' })
        return { status: child.exitCode, config: readFileSync(config, 'utf8'), commands: (() => { try { return readFileSync(log, 'utf8') } catch { return '' } })(), output: child.stdout.toString(), error: child.stderr.toString() }
    } finally { rmSync(root, { recursive: true, force: true }) }
}
test('default deploy still provisions, builds and switches UI and retires the previous API', () => {
    const result = run([])
    expect(result.status).toBe(0)
    expect(result.commands).toContain('bun run provision:shared-mailboxes')
    expect(result.commands).toContain('docker build --pull')
    expect(result.commands).toContain('docker rename hanasand_mail_ui_next hanasand_mail_ui')
    expect(result.commands).toContain('--project-name hanasand-mail-api-8085')
    expect(result.config).toContain('proxy_pass http://127.0.0.1:3011;')
    expect(result.config.startsWith(other)).toBe(true)
})
test('API-only keeps UI and old API, changes only the two existing API upstreams and preserves all readiness checks', () => {
    const result = run(['--api-only'])
    expect(result.status).toBe(0)
    expect(result.config).toBe(other + mail.replaceAll('http://127.0.0.1:8085;', 'http://127.0.0.1:8086;'))
    expect(result.commands).not.toContain('provision:shared-mailboxes')
    expect(result.commands).not.toContain('hanasand_mail_ui')
    expect(result.commands).not.toContain('docker build --pull')
    expect(result.commands).not.toContain('--project-name hanasand-mail-api-8085')
    for (const check of ['flock -x 9', 'compose --project-name hanasand-mail-api-8086', 'BROWSER_REPUTATION_LOOKUP_URL', '/jmap/session', 'http://127.0.0.1:8183/ready', 'openresty -t', 'openresty -s reload', 'Access-Control-Request-Headers: authorization,content-type,dpop,id']) expect(result.commands).toContain(check)
    expect(result.output).toContain('UI unchanged, previous API retained on port 8085; rollback config')
})
test('API-only restores the previous config on nginx rejection without removing UI or old API', () => {
    const result = run(['--api-only'], { MOCK_NGINX_FAIL: '1' })
    expect(result.status).not.toBe(0)
    expect(result.config).toBe(other + mail)
    expect(result.commands).not.toContain('hanasand_mail_ui')
    expect(result.commands).not.toContain('--project-name hanasand-mail-api-8085')
    expect(result.commands).toContain('openresty -s reload')
    expect(result.commands).toContain('down')
})
test('unknown modes and protected dirty checkouts fail before Docker operations', () => {
    for (const result of [run(['--unknown']), run(['--api-only'], { MOCK_DIRTY: '1' })]) {
        expect(result.status).not.toBe(0)
        expect(result.commands).not.toContain('docker ')
        expect(result.config).toBe(other + mail)
    }
})
