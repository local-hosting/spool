export type MeshEnvelopeV1 = {
  v: 1
  peer: string
  bearerId: string
  overlayId?: string
  vocab_tip: string
  encoding: 'packed'
  payload_b64: string
  seq?: number
}

export type IngressWalRecord = {
  id: string
  received_at: string
  envelope: MeshEnvelopeV1
}