import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const script = resolve(import.meta.dir, '../../scripts/test-device-proof-staging.sh')
function run(mode: string) {
    const root = mkdtempSync(join(tmpdir(), 'mail-stage-guard-'))
    try {
        const bin = join(root, 'bin'), log = join(root, 'docker.log')
        mkdirSync(bin)
        const shim = (name: string, body: string) => writeFileSync(join(bin, name), `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o755 })
        shim('git', `case "$*" in
            *--show-toplevel*) echo "$MOCK_ROOT";;
            *--porcelain*) if [[ "$MOCK_CASE" == dirty ]]; then echo ' M protected.txt'; fi;;
            *remote*) echo origin;;
            *'rev-parse HEAD'*) echo c85f8bc66712c36283870dd12275e7359e04f8ef;;
            *'cat-file -e'*|*'diff --exit-code'*) exit 0;;
            *) exit 1;;
        esac`)
        shim('flock', 'exit 0')
        shim('docker', `printf '%s\\n' "$*" >> "$MOCK_LOG"
        case "$*" in
            'inspect hanasand-mail-proof-db') [[ "$MOCK_CASE" == database ]];;
            'inspect hanasand-mail-proof-runner') exit 1;;
            'network inspect hanasand-mail-bound-proof-stage') [[ "$MOCK_CASE" == network ]];;
            *'inspect -f'*hanasand_auth_primary*) echo immutable-runtime;;
            'image inspect'*) echo changed-runtime;;
            *) exit 1;;
        esac`)
        const child = Bun.spawnSync(['bash', script, '/synthetic/identity-checkout'], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_ROOT: root, MOCK_CASE: mode, MOCK_LOG: log }, stdout: 'pipe', stderr: 'pipe' })
        return { code: child.exitCode, output: child.stderr.toString(), commands: (() => { try { return readFileSync(log, 'utf8') } catch { return '' } })() }
    } finally { rmSync(root, { recursive: true, force: true }) }
}
test('staging refuses protected resources, changed runtime and dirty source before creating or deleting anything', () => {
    for (const mode of ['database', 'network', 'runtime', 'dirty']) {
        const result = run(mode)
        expect(result.code).not.toBe(0)
        for (const mutation of ['network create', 'network rm', 'run ', 'rm -f', 'prune', 'restart']) expect(result.commands).not.toContain(mutation)
        expect(result.output).toContain(mode === 'dirty' ? 'clean committed checkout' : mode === 'runtime' ? 'runtime base changed' : 'already exists')
    }
})
