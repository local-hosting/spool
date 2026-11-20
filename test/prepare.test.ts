import { describe, expect, it } from 'vitest'
import { prepareEnvelopeFromText } from '../src/prepare.js'

describe('prepareEnvelopeFromText', () => {
  it.each(['lora', 'bluetooth'] as const)(
    'prepares packed envelope on thin bearer (%s)',
    (bearerId) => {
      const out = prepareEnvelopeFromText({
        text: 'We need milk for breakfast',
        lang: 'en',
        peer: 'prep-peer',
        bearerId,
        packId: 'resilience',
      })
      expect('error' in out).toBe(false)
      if (!('error' in out)) {
        expect(out.v).toBe(1)
        expect(out.encoding).toBe('packed')
        expect(out.bearerId).toBe(bearerId)
        expect(out.payload_b64.length).toBeGreaterThan(0)
      }
    },
  )

  it('fails when bearer prefers text not packed', () => {
    const out = prepareEnvelopeFromText({
      text: 'Are you home yet?',
      lang: 'en',
      peer: 'p',
      bearerId: 'wifi',
      packId: 'resilience',
    })
    expect('error' in out).toBe(true)
    if ('error' in out) {
      expect(out.error).toContain('packed')
    }
  })
})