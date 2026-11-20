import { describe, expect, it } from 'vitest'
import type { IngressWalRecord } from '../src/types/envelope.js'
import { filterIngressRecords, normalizePage, paginate } from '../src/spool-query.js'

const sample = (id: string, peer: string, bearerId: string): IngressWalRecord => ({
  id,
  received_at: new Date().toISOString(),
  envelope: {
    v: 1,
    peer,
    bearerId,
    vocab_tip: 'tip',
    encoding: 'packed',
    payload_b64: `payload-${id}`,
  },
})

describe('normalizePage', () => {
  it('defaults limit 10 and skip 0', () => {
    expect(normalizePage()).toEqual({ limit: 10, skip: 0 })
  })

  it('clamps limit to 500 and floors negative skip', () => {
    expect(normalizePage({ $limit: 900, $skip: -3 })).toEqual({ limit: 500, skip: 0 })
  })

  it('falls back when limit is not finite', () => {
    expect(normalizePage({ $limit: Number.NaN }).limit).toBe(10)
  })
})

describe('paginate', () => {
  it('returns slice and total', () => {
    const page = paginate([1, 2, 3, 4, 5], { $limit: 2, $skip: 1 })
    expect(page).toEqual({ total: 5, limit: 2, skip: 1, data: [2, 3] })
  })
})

describe('filterIngressRecords', () => {
  const records = [
    sample('a', 'peer-lora', 'lora'),
    sample('b', 'peer-bt', 'bluetooth'),
    sample('c', 'peer-lora', 'lora'),
  ]

  it('filters pending vs processed', () => {
    const processed = ['a']
    expect(filterIngressRecords(records, { pending: true }, processed).map((r) => r.id)).toEqual([
      'b',
      'c',
    ])
    expect(filterIngressRecords(records, { processed: true }, processed).map((r) => r.id)).toEqual(
      ['a'],
    )
  })

  it('filters bearerId $in', () => {
    const out = filterIngressRecords(records, { bearerId: { $in: ['lora'] } }, [])
    expect(out.map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('filters ingress_id string or $in', () => {
    expect(filterIngressRecords(records, { ingress_id: 'b' }, []).map((r) => r.id)).toEqual(['b'])
    expect(
      filterIngressRecords(records, { ingress_id: { $in: ['a', 'c'] } }, []).map((r) => r.id),
    ).toEqual(['a', 'c'])
  })
})