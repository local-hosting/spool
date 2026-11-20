import { describe, expect, it } from 'vitest'
import { envelopeDedupeKey } from '../src/dedupe.js'
import type { MeshEnvelopeV1 } from '../src/types/envelope.js'

describe('envelopeDedupeKey', () => {
  const base: MeshEnvelopeV1 = {
    v: 1,
    peer: 'p1',
    bearerId: 'lora',
    vocab_tip: 'fp-x',
    encoding: 'packed',
    payload_b64: 'Ym9keQ==',
  }

  it('is stable for same envelope', () => {
    expect(envelopeDedupeKey(base)).toBe(envelopeDedupeKey({ ...base }))
  })

  it('changes when payload or peer differs', () => {
    const other = { ...base, peer: 'p2' }
    expect(envelopeDedupeKey(base)).not.toBe(envelopeDedupeKey(other))
  })
})