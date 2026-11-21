import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = join(import.meta.dirname, '..')

describe('spool CLI', () => {
  let dataDir: string

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const cli = join(packageRoot, 'dist/cli/main.js')
    const res = spawnSync(process.execPath, [cli, ...args], {
      cwd: packageRoot,
      env: { ...process.env, SPOOL_DATA_DIR: dataDir, SPOOL_PEER: 'cli-peer' },
      encoding: 'utf8',
    })
    return { status: res.status, stdout: res.stdout, stderr: res.stderr }
  }

  it('status prints peer and depth', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-cli-'))
    const out = run(['status'])
    expect(out.status).toBe(0)
    const json = JSON.parse(out.stdout) as { peer: string; depth: unknown }
    expect(json.peer).toBe('cli-peer')
    expect(json.depth).toBeTruthy()
  })

  it('egress send then pop emits wire json', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-cli-'))
    const send = run(['egress', 'send', '--text', 'We need milk for breakfast', '--lang', 'en'])
    expect(send.status).toBe(0)
    const pop = run(['egress', 'pop'])
    expect(pop.status).toBe(0)
    expect(pop.stdout.trim()).toBe(send.stdout.trim())
    const wire = JSON.parse(pop.stdout) as { v: number }
    expect(wire.v).toBe(1)
  })
})