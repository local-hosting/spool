import { createHash } from 'node:crypto'
import type { MeshEnvelopeV1 } from './types/envelope.js'

export function envelopeDedupeKey(envelope: MeshEnvelopeV1): string {
  return createHash('sha256')
    .update(`${envelope.peer}\0${envelope.vocab_tip}\0${envelope.payload_b64}`)
    .digest('hex')
    .slice(0, 32)
}