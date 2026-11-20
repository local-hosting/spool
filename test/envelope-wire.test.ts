import { describe, expect, it } from 'vitest'
import {
  envelopeToWireMessage,
  isMeshEnvelopeV1,
  parseWireMessage,
} from '../src/api/envelope-wire.js'
import type { MeshEnvelopeV1 } from '../src/types/envelope.js'

const sample: MeshEnvelopeV1 = {
  v: 1,
  peer: 'peer-a',
  bearerId: 'lora',
  vocab_tip: 'fp-abc',
  encoding: 'packed',
  payload_b64: 'AQID',
}

describe('envelope-wire', () => {
  it('round-trips through message string', () => {
    const wire = envelopeToWireMessage(sample)
    const parsed = parseWireMessage(wire)
    expect('error' in parsed).toBe(false)
    if (!('error' in parsed)) {
      expect(parsed).toEqual(sample)
    }
  })

  it('isMeshEnvelopeV1 matches shape', () => {
    expect(isMeshEnvelopeV1(sample)).toBe(true)
    expect(isMeshEnvelopeV1({ v: 2 })).toBe(false)
    expect(isMeshEnvelopeV1(null)).toBe(false)
  })

  it('rejects non-envelope JSON', () => {
    const a = parseWireMessage('not-json')
    const b = parseWireMessage('{"v":1}')
    expect('error' in a && a.error).toBeTruthy()
    expect('error' in b && b.error).toBeTruthy()
  })
})