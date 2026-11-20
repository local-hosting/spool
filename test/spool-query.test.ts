import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Spool } from '../src/spool.js'

describe('spool find / remove', () => {
  let dataDir: string

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('findIngress pages and filters pending', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-find-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })

    const a = spool.enqueueText({ text: 'We need milk', lang: 'en' })
    const b = spool.enqueueText({ text: 'Are you home', lang: 'en' })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    const w1 = spool.removeOneEgress()!
    const w2 = spool.removeOneEgress()!
    spool.appendOneIngress(w1)
    spool.appendOneIngress(w2)

    expect(spool.findIngress({ pending: true }).total).toBe(2)
    spool.processIngress(1)
    expect(spool.findIngress({ pending: true }).total).toBe(1)
    expect(spool.findIngress({ processed: true }).total).toBe(1)

    const page = spool.findIngress({ $limit: 1, $skip: 0 })
    expect(page.data).toHaveLength(1)
    expect(page.total).toBe(2)
  })

  it('removeManyIngress by query clears dedupe state', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-remove-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })
    const enq = spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    const wire = spool.removeOneEgress()!
    const first = spool.appendOneIngress(wire)
    expect(first.ok).toBe(true)

    const removed = spool.removeAllIngress()
    expect(removed).toBe(1)
    expect(spool.getAllIngress()).toHaveLength(0)

    const again = spool.appendOneIngress(wire)
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.duplicate).toBe(false)
  })

  it('findEgress and removeManyEgress by index', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-egress-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })
    expect(spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' }).ok).toBe(true)
    expect(spool.enqueueText({ text: 'Are you home yet?', lang: 'en' }).ok).toBe(true)

    const found = spool.findEgress({ $limit: 10 })
    expect(found.total).toBe(2)
    expect(found.data[0]!._index).toBe(0)

    const n = spool.removeManyEgress([1])
    expect(n).toBe(1)
    expect(spool.getAllEgress()).toHaveLength(1)
    expect(spool.getOneEgress(0)!.payload_b64).toBeTruthy()
  })

  it('removeAllEgress empties queue', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-egress-all-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })
    spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    expect(spool.removeAllEgress()).toBe(1)
    expect(spool.findEgress().total).toBe(0)
  })

  it('findProcessed after processIngress', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-processed-find-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })
    const enq = spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    spool.appendOneIngress(spool.removeOneEgress()!)
    spool.processIngress()
    const page = spool.findProcessed({ kind: 'frame', $limit: 5 })
    expect(page.total).toBe(1)
    expect(page.data[0]!.kind).toBe('frame')
  })

  it('removeManyIngress by query drops processed markers', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-remove-query-'))
    const spool = new Spool({ dataDir, peer: 'p1', defaultBearerId: 'lora' })
    const enq = spool.enqueueText({ text: 'We need milk for breakfast', lang: 'en' })
    expect(enq.ok).toBe(true)
    if (!enq.ok) return

    const wire = spool.removeOneEgress()!
    const appended = spool.appendOneIngress(wire)
    expect(appended.ok).toBe(true)
    if (!appended.ok) return

    spool.processIngress()
    expect(spool.findIngress({ processed: true }).total).toBe(1)

    const n = spool.removeManyIngress({ pending: true })
    expect(n).toBe(0)

    const dropped = spool.removeManyIngress({ processed: true })
    expect(dropped).toBe(1)
    expect(spool.getRuntimeState().ingress_processed).toHaveLength(0)
  })
})