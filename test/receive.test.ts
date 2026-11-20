import { describe, expect, it } from 'vitest'
import { compilePack } from '@local-hosting/vocab'
import { vocabularyTip } from '@local-hosting/compose'
import { prepareEnvelopeFromText } from '../src/prepare.js'
import { createReceiveContext, receiveEnvelope, registerPackForTip } from '../src/receive.js'

describe('receiveEnvelope', () => {
  it('rejects unknown vocab_tip', () => {
    const ctx = createReceiveContext('resilience')
    const event = receiveEnvelope(ctx, 'id1', new Date().toISOString(), {
      v: 1,
      peer: 'x',
      bearerId: 'lora',
      vocab_tip: 'fp-unknown',
      encoding: 'packed',
      payload_b64: 'AQI=',
    })
    expect(event.kind).toBe('reject')
  })

  it('decodes a prepared envelope', () => {
    const vocab = compilePack('resilience').vocabulary
    const tip = vocabularyTip(vocab)
    const prepared = prepareEnvelopeFromText({
      text: 'Can you confirm the medicine dose?',
      lang: 'en',
      peer: 'rx-peer',
      bearerId: 'lora',
      packId: 'resilience',
    })
    if ('error' in prepared) throw new Error(prepared.error)

    const ctx = createReceiveContext('resilience')
    registerPackForTip(ctx, 'resilience', tip)
    const event = receiveEnvelope(ctx, 'id2', new Date().toISOString(), prepared)
    expect(event.kind).toBe('frame')
  })
})