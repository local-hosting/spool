import type { MeshEnvelopeV1 } from '../types/envelope.js'

export function envelopeToWireMessage(envelope: MeshEnvelopeV1): string {
  return JSON.stringify(envelope)
}

export function parseWireMessage(message: string): MeshEnvelopeV1 | { error: string } {
  try {
    const parsed = JSON.parse(message) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { error: 'message is not a JSON object' }
    }
    const o = parsed as Partial<MeshEnvelopeV1>
    if (o.v !== 1 || o.encoding !== 'packed' || typeof o.payload_b64 !== 'string') {
      return { error: 'message is not a MeshEnvelopeV1 packed frame' }
    }
    return o as MeshEnvelopeV1
  } catch {
    return { error: 'message is not valid JSON' }
  }
}

export function isMeshEnvelopeV1(body: unknown): body is MeshEnvelopeV1 {
  if (!body || typeof body !== 'object') return false
  const o = body as Partial<MeshEnvelopeV1>
  return o.v === 1 && o.encoding === 'packed' && typeof o.payload_b64 === 'string'
}