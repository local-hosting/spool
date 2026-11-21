import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Spool } from '../src/spool.js'
import { createSpoolStore, resetMemorySpoolStore } from '../src/store/index.js'
import type { SpoolStorageKind } from '../src/store/types.js'

const backends: SpoolStorageKind[] =
  process.env.SPOOL_TEST_SKIP_ROCKSDB === '1'
    ? ['jsonl', 'sqlite', 'memory']
    : ['jsonl', 'sqlite', 'rocksdb', 'memory']

describe.each(backends)('SpoolStore (%s)', (kind) => {
  let dataDir: string

  afterEach(() => {
    if (kind === 'memory' && dataDir) resetMemorySpoolStore(dataDir)
    else if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  function makeStore() {
    dataDir =
      kind === 'memory'
        ? `:memory:${Date.now()}`
        : mkdtempSync(join(tmpdir(), `spool-store-${kind}-`))
    return createSpoolStore(dataDir, kind)
  }

  it('persists peer, ingress, egress across reopen', () => {
    makeStore()

    const enq = new Spool({
      dataDir,
      peer: 'peer-1',
      storage: kind,
      defaultBearerId: 'lora',
    })
    const prepared = enq.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    expect(prepared.ok).toBe(true)
    enq.appendOneIngress(enq.removeOneEgress()!)
    enq.close()

    const again = new Spool({ dataDir, storage: kind, defaultBearerId: 'lora' })
    expect(again.peer).toBe('peer-1')
    expect(again.depth().ingress_pending).toBe(1)
    expect(again.depth().egress_pending).toBe(0)
    again.close()
  })

  it('Spool.storage reports backend kind', () => {
    makeStore()
    const spool = new Spool({ dataDir, storage: kind, defaultBearerId: 'lora' })
    expect(spool.storage).toBe(kind)
    spool.close()
  })

  it('removeManyIngress persists across reopen', () => {
    makeStore()
    const spool = new Spool({
      dataDir,
      peer: 'peer-1',
      storage: kind,
      defaultBearerId: 'lora',
    })
    const first = spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    const second = spool.enqueueText({ text: 'Are you home yet?', lang: 'en' })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const w1 = spool.removeOneEgress()!
    const w2 = spool.removeOneEgress()!
    const a = spool.appendOneIngress(w1)
    const b = spool.appendOneIngress(w2)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    const removed = spool.removeOneIngress(a.id)
    expect(removed).toBe(true)
    expect(spool.getAllIngress()).toHaveLength(1)
    spool.close()

    const again = new Spool({ dataDir, storage: kind, defaultBearerId: 'lora' })
    expect(again.getAllIngress()).toHaveLength(1)
    expect(again.getAllIngress()[0]!.id).toBe(b.id)
    again.close()
  })
})