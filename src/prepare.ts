import { thinPrepare, type ThinPrepareInput } from '@local-hosting/compose/thin'
import type { SupportedLanguage } from '@local-hosting/compose'
import { compilePack, type PackId } from '@local-hosting/vocab'
import { vocabularyTip } from '@local-hosting/compose'
import type { IntentBodyIds } from '@local-hosting/compose'
import type { MeshEnvelopeV1 } from './types/envelope.js'

export type PrepareTextInput = {
  text: string
  lang: SupportedLanguage
  peer: string
  bearerId: string
  overlayId?: string
  packId?: PackId
}

export type PrepareIntentInput = {
  intentBody: IntentBodyIds
  peer: string
  bearerId: string
  overlayId?: string
  packId?: PackId
}

function packVocabulary(packId: PackId) {
  return compilePack(packId).vocabulary
}

export function prepareEnvelopeFromText(input: PrepareTextInput): MeshEnvelopeV1 | { error: string } {
  const packId = input.packId ?? 'resilience'
  const vocab = packVocabulary(packId)
  const thinInput: ThinPrepareInput = {
    vocab,
    bearerId: input.bearerId,
    overlayId: input.overlayId,
    text: input.text,
    lang: input.lang,
  }
  const prepared = thinPrepare(thinInput)
  if (!prepared.ok) {
    return { error: prepared.reason }
  }
  return {
    v: 1,
    peer: input.peer,
    bearerId: input.bearerId,
    overlayId: input.overlayId,
    vocab_tip: vocabularyTip(vocab),
    encoding: 'packed',
    payload_b64: Buffer.from(prepared.bytes).toString('base64'),
  }
}

export function prepareEnvelopeFromIntent(
  input: PrepareIntentInput,
): MeshEnvelopeV1 | { error: string } {
  const packId = input.packId ?? 'resilience'
  const vocab = packVocabulary(packId)
  const thinInput: ThinPrepareInput = {
    vocab,
    bearerId: input.bearerId,
    overlayId: input.overlayId,
    intentBody: input.intentBody,
  }
  const prepared = thinPrepare(thinInput)
  if (!prepared.ok) {
    return { error: prepared.reason }
  }
  return {
    v: 1,
    peer: input.peer,
    bearerId: input.bearerId,
    overlayId: input.overlayId,
    vocab_tip: prepared.vocab_tip,
    encoding: 'packed',
    payload_b64: Buffer.from(prepared.bytes).toString('base64'),
  }
}