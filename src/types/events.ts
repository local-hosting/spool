import type { CompactFrame } from '@local-hosting/frames'
import type { ExpandWithStoreResult } from '@local-hosting/frames'
import type { MeshEnvelopeV1 } from './envelope.js'

export type ProcessedFrameEvent = {
  kind: 'frame'
  ingress_id: string
  received_at: string
  envelope: MeshEnvelopeV1
  frame: CompactFrame
  expanded: Extract<ExpandWithStoreResult, { ok: true }>
}

export type ProcessedRejectEvent = {
  kind: 'reject'
  ingress_id: string
  received_at: string
  envelope: MeshEnvelopeV1
  reason: string
}

export type ProcessedEvent = ProcessedFrameEvent | ProcessedRejectEvent