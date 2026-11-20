import type { MeshEnvelopeV1 } from './envelope.js'
import type { IngressWalRecord } from './envelope.js'
import type { ProcessedEvent } from './events.js'
import type { SpoolState } from './config.js'

export type AppendOneIngressResult =
  | { ok: true; id: string; duplicate: false }
  | { ok: true; id: string; duplicate: true }
  | { ok: false; reason: string }

export type AppendOneEgressResult = { ok: true } | { ok: false; reason: string }

export type SpoolRuntimeState = SpoolState

export type SpoolIngressRecord = IngressWalRecord

export type SpoolEgressEnvelope = MeshEnvelopeV1

export type SpoolProcessedEvent = ProcessedEvent