import { decodePackedBytes, expandWithStore } from '@local-hosting/frames'
import { vocabularyToVocabStore } from '@local-hosting/compose'
import { compilePack, type PackId } from '@local-hosting/vocab'
import type { VocabStore } from '@local-hosting/frames'
import type { MeshEnvelopeV1 } from './types/envelope.js'
import type { ProcessedEvent } from './types/events.js'

export type ReceiveContext = {
  packs: Map<string, VocabStore>
  defaultPackId: PackId
}

export function createReceiveContext(defaultPackId: PackId = 'resilience'): ReceiveContext {
  const vocab = compilePack(defaultPackId).vocabulary
  const store = vocabularyToVocabStore(vocab)
  const packs = new Map<string, VocabStore>()
  packs.set(store.active, store)
  return { packs, defaultPackId }
}

export function registerPackForTip(
  ctx: ReceiveContext,
  packId: PackId,
  vocabTip: string,
): void {
  const vocab = compilePack(packId).vocabulary
  const store = vocabularyToVocabStore(vocab)
  ctx.packs.set(vocabTip, store)
  ctx.packs.set(store.active, store)
}

function storeForTip(ctx: ReceiveContext, vocabTip: string): VocabStore | undefined {
  return ctx.packs.get(vocabTip)
}

export function receiveEnvelope(
  ctx: ReceiveContext,
  ingressId: string,
  receivedAt: string,
  envelope: MeshEnvelopeV1,
): ProcessedEvent {
  if (envelope.v !== 1 || envelope.encoding !== 'packed') {
    return {
      kind: 'reject',
      ingress_id: ingressId,
      received_at: receivedAt,
      envelope,
      reason: 'unsupported envelope version or encoding',
    }
  }

  let bytes: Uint8Array
  try {
    bytes = Buffer.from(envelope.payload_b64, 'base64')
  } catch {
    return {
      kind: 'reject',
      ingress_id: ingressId,
      received_at: receivedAt,
      envelope,
      reason: 'invalid payload_b64',
    }
  }

  const frame = decodePackedBytes(bytes)
  if (!frame) {
    return {
      kind: 'reject',
      ingress_id: ingressId,
      received_at: receivedAt,
      envelope,
      reason: 'decodePackedBytes failed',
    }
  }

  const store = storeForTip(ctx, envelope.vocab_tip)
  if (!store) {
    return {
      kind: 'reject',
      ingress_id: ingressId,
      received_at: receivedAt,
      envelope,
      reason: `unknown vocab_tip: ${envelope.vocab_tip}`,
    }
  }

  const expanded = expandWithStore(store, frame)
  if (!expanded.ok) {
    return {
      kind: 'reject',
      ingress_id: ingressId,
      received_at: receivedAt,
      envelope,
      reason: `expand: ${expanded.reason}`,
    }
  }

  return {
    kind: 'frame',
    ingress_id: ingressId,
    received_at: receivedAt,
    envelope,
    frame,
    expanded,
  }
}