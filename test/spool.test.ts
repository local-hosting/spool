import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Spool } from '../src/spool.js'

describe('@local-hosting/spool', () => {
  let dataDir: string

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('round-trips text via egress → ingress → process', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const spool = new Spool({
      dataDir,
      peer: 'test-peer',
      defaultBearerId: 'lora',
    })

    const enq = spool.enqueueText({
      text: 'We need milk for breakfast',
      lang: 'en',
    })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    const wire = spool.removeOneEgress()
    expect(wire).not.toBeNull()
    expect(wire!.v).toBe(1)

    const append = spool.appendOneIngress(wire!)
    expect(append.ok).toBe(true)
    if (append.ok) {
      expect(append.duplicate).toBe(false)
    }

    const events = spool.processIngress()
    expect(events).toHaveLength(1)
    expect(events[0]!.kind).toBe('frame')
  })

  it('dedupes identical ingress envelopes', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })

    const enq = spool.enqueueText({ text: 'Are you home yet?', lang: 'en' })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    const wire = spool.removeOneEgress()!
    const a = spool.appendOneIngress(wire)
    const b = spool.appendOneIngress(wire)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (b.ok) {
      expect(b.duplicate).toBe(true)
    }
  })

  it('rejects append when max depth exceeded', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const spool = new Spool({
      dataDir,
      peer: 'depth-peer',
      defaultBearerId: 'lora',
      maxDepth: 1,
    })
    const enq = spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    const second = spool.appendOneIngress(enq.envelope)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.reason).toContain('depth')
    }
  })

  it('reprocesses ingress after restart via wal', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const a = new Spool({ dataDir, peer: 'wal-peer', defaultBearerId: 'lora' })
    const enq = a.enqueueText({ text: 'Are you home yet?', lang: 'en' })
    expect(enq.ok).toBe(true)
    const wire = a.removeOneEgress()!
    a.appendOneIngress(wire)

    const b = new Spool({ dataDir, defaultBearerId: 'lora' })
    const events = b.processIngress()
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0]!.kind).toBe('frame')
  })

  it('ingress wal holds lora and bluetooth mesh bearers from different peers', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const spool = new Spool({ dataDir, peer: 'hub-peer', defaultBearerId: 'lora' })

    const lora = spool.enqueueText({
      text: 'We need milk for breakfast',
      lang: 'en',
      bearerId: 'lora',
      peer: 'field-radio-a',
    })
    const ble = spool.enqueueText({
      text: 'Are you home yet?',
      lang: 'en',
      bearerId: 'bluetooth',
      peer: 'mesh-node-b',
    })
    expect(lora.ok).toBe(true)
    expect(ble.ok).toBe(true)
    if (!lora.ok || !ble.ok) return

    const loraWire = spool.removeOneEgress()!
    const bleWire = spool.removeOneEgress()!
    expect(loraWire.bearerId).toBe('lora')
    expect(bleWire.bearerId).toBe('bluetooth')

    spool.appendOneIngress(loraWire)
    spool.appendOneIngress(bleWire)
  })

  it('processes mixed lora and bluetooth ingress in receive order', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const spool = new Spool({ dataDir, peer: 'hub-peer', defaultBearerId: 'lora' })

    for (const [peer, bearerId, text] of [
      ['lora-gw', 'lora', 'We need milk for breakfast'],
      ['ble-mesh', 'bluetooth', 'Dinner plan: pickup the kids'],
    ] as const) {
      const enq = spool.enqueueText({ text, lang: 'en', bearerId, peer })
      expect(enq.ok).toBe(true)
      if (!enq.ok) return
      const wire = spool.removeOneEgress()!
      spool.appendOneIngress(wire)
    }

    const events = spool.processIngress()
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.kind === 'frame')).toBe(true)
    expect(events[0]!.envelope.bearerId).toBe('lora')
    expect(events[0]!.envelope.peer).toBe('lora-gw')
    expect(events[1]!.envelope.bearerId).toBe('bluetooth')
    expect(events[1]!.envelope.peer).toBe('ble-mesh')
  })

  it('reloads egress queue from state after construct', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-test-'))
    const first = new Spool({ dataDir, peer: 'persist-peer', defaultBearerId: 'lora' })
    const enq = first.enqueueText({ text: 'Dinner plan: pickup the kids', lang: 'en' })
    expect(enq.ok).toBe(true)

    const second = new Spool({ dataDir })
    expect(second.peer).toBe('persist-peer')
    expect(second.getAllEgress()).toHaveLength(1)
  })
})