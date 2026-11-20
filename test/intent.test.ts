import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Spool } from '../src/spool.js'

describe('enqueueIntent', () => {
  let dataDir: string

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('egress intent frame and processes on ingress', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-intent-'))
    const spool = new Spool({
      dataDir,
      peer: 'intent-peer',
      defaultBearerId: 'lora',
      defaultPackId: 'resilience',
    })

    const enq = spool.enqueueIntent({
      intentBody: {
        event_ref: 'E_dinner',
        band: 1,
        actor_ids: ['PR_parent'],
        action_ids: ['A_notify'],
        place_ids: ['P_home'],
      },
    })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    const wire = spool.removeOneEgress()!
    spool.appendOneIngress(wire)
    const events = spool.processIngress()
    expect(events).toHaveLength(1)
    expect(events[0]!.kind).toBe('frame')
  })
})