import { randomBytes } from 'node:crypto'
import { compilePack, type PackId } from '@local-hosting/vocab'
import { resolveInitialSpoolPeer, type SpoolPeerSource } from './peer.js'
import { vocabularyTip } from '@local-hosting/compose'
import { envelopeDedupeKey } from './dedupe.js'
import { createSpoolStore } from './store/create-store.js'
import type { SpoolStore } from './store/types.js'
import {
  prepareEnvelopeFromIntent,
  prepareEnvelopeFromText,
  type PrepareIntentInput,
  type PrepareTextInput,
} from './prepare.js'
import { createReceiveContext, receiveEnvelope, registerPackForTip } from './receive.js'
import type { MeshEnvelopeV1 } from './types/envelope.js'
import type { IngressWalRecord } from './types/envelope.js'
import type { ProcessedEvent } from './types/events.js'
import type { SpoolConfig, SpoolState } from './types/config.js'
import type { AppendOneEgressResult, AppendOneIngressResult } from './types/spool-crud.js'
import {
  filterIngressRecords,
  findEgressPage,
  findIngressPage,
  findProcessedPage,
} from './spool-query.js'
import type {
  SpoolFindEgressQuery,
  SpoolFindEgressResult,
  SpoolFindIngressQuery,
  SpoolFindIngressResult,
  SpoolFindProcessedQuery,
  SpoolFindProcessedResult,
  SpoolRemoveIngressQuery,
} from './types/spool-query.js'

export type { AppendOneIngressResult, AppendOneEgressResult } from './types/spool-crud.js'

/** @deprecated Renamed {@link AppendOneIngressResult}. */
export type AppendIngressResult = AppendOneIngressResult

export class Spool {
  readonly dataDir: string
  readonly peer: string
  readonly defaultPackId: PackId
  readonly defaultBearerId: string
  readonly defaultOverlayId?: string
  readonly maxDepth: number
  readonly peerSource: SpoolPeerSource
  readonly storage: SpoolStore['kind']

  private readonly store: SpoolStore
  private state: SpoolState
  private readonly receiveCtx: ReturnType<typeof createReceiveContext>
  private readonly seenIngress = new Set<string>()
  private processedEvents: ProcessedEvent[] = []

  constructor(config: SpoolConfig) {
    this.dataDir = config.dataDir
    this.store = config.store ?? createSpoolStore(config.dataDir, config.storage ?? 'jsonl')
    this.storage = this.store.kind
    this.store.ensureReady()
    this.defaultPackId = config.defaultPackId ?? 'resilience'
    this.defaultBearerId = config.defaultBearerId ?? 'lora'
    this.defaultOverlayId = config.defaultOverlayId
    this.maxDepth = config.maxDepth ?? 10_000

    const resolved = resolveInitialSpoolPeer({ explicitPeer: config.peer })
    const hadState = this.store.hasPersistedState()
    this.state = this.store.getState(resolved.peer)
    this.peer = this.state.peer
    if (config.peer?.trim()) {
      this.peerSource = 'explicit'
    } else if (!hadState) {
      this.peerSource = resolved.source
    } else {
      this.peerSource = 'explicit'
    }

    this.receiveCtx = createReceiveContext(this.defaultPackId)
    const defaultTip = vocabularyTip(compilePack(this.defaultPackId).vocabulary)
    registerPackForTip(this.receiveCtx, this.defaultPackId, defaultTip)

    for (const record of this.store.getAllIngress()) {
      this.seenIngress.add(envelopeDedupeKey(record.envelope))
    }
  }

  close(): void {
    this.store.close()
  }

  getRuntimeState(): SpoolState {
    return {
      peer: this.state.peer,
      egress: [...this.state.egress],
      ingress_processed: [...this.state.ingress_processed],
    }
  }

  depth(): { ingress_pending: number; egress_pending: number; processed: number } {
    return {
      ingress_pending: this.getAllIngressPending().length,
      egress_pending: this.getAllEgress().length,
      processed: this.processedEvents.length,
    }
  }

  getAllIngress(): IngressWalRecord[] {
    return this.store.getAllIngress()
  }

  getOneIngress(id: string): IngressWalRecord | undefined {
    return this.store.getOneIngress(id)
  }

  getManyIngress(ids: string[]): IngressWalRecord[] {
    return this.store.getManyIngress(ids)
  }

  getAllIngressPending(): IngressWalRecord[] {
    const processed = new Set(this.state.ingress_processed)
    return this.store.getAllIngress().filter((record) => !processed.has(record.id))
  }

  appendOneIngress(envelope: MeshEnvelopeV1): AppendOneIngressResult {
    if (this.totalDepth() >= this.maxDepth) {
      return { ok: false, reason: 'spool depth limit exceeded' }
    }

    const dedupe = envelopeDedupeKey(envelope)
    if (this.seenIngress.has(dedupe)) {
      const existing = this.store.getAllIngress().find(
        (r) => envelopeDedupeKey(r.envelope) === dedupe,
      )
      return { ok: true, id: existing?.id ?? dedupe, duplicate: true }
    }

    const id = randomBytes(8).toString('hex')
    const received_at = new Date().toISOString()
    const record = { id, received_at, envelope }
    this.store.appendOneIngress(record)
    this.seenIngress.add(dedupe)
    return { ok: true, id, duplicate: false }
  }

  processIngress(max = 32): ProcessedEvent[] {
    const batch = this.getAllIngressPending().slice(0, max)
    const out: ProcessedEvent[] = []

    for (const record of batch) {
      this.ensurePackTipRegistered(record.envelope.vocab_tip)
      const event = receiveEnvelope(
        this.receiveCtx,
        record.id,
        record.received_at,
        record.envelope,
      )
      out.push(event)
      this.processedEvents.push(event)
      this.state.ingress_processed.push(record.id)
    }

    if (batch.length > 0) {
      this.store.saveState(this.state)
    }
    return out
  }

  getAllProcessed(since = 0): ProcessedEvent[] {
    return this.processedEvents.slice(since)
  }

  getAllEgress(): MeshEnvelopeV1[] {
    return [...this.state.egress]
  }

  appendOneEgress(envelope: MeshEnvelopeV1): AppendOneEgressResult {
    if (this.totalDepth() >= this.maxDepth) {
      return { ok: false, reason: 'spool depth limit exceeded' }
    }
    this.state.egress.push(envelope)
    this.store.appendOneEgressAudit(envelope)
    this.store.saveState(this.state)
    return { ok: true }
  }

  removeOneEgress(): MeshEnvelopeV1 | null {
    const next = this.state.egress.shift() ?? null
    this.store.saveState(this.state)
    return next
  }

  /** Peek egress at queue position (default head). */
  getOneEgress(index = 0): MeshEnvelopeV1 | undefined {
    return this.state.egress[index]
  }

  findIngress(query: SpoolFindIngressQuery = {}): SpoolFindIngressResult {
    return findIngressPage(this.store.getAllIngress(), query, this.state.ingress_processed)
  }

  findEgress(query: SpoolFindEgressQuery = {}): SpoolFindEgressResult {
    return findEgressPage(this.state.egress, query)
  }

  findProcessed(query: SpoolFindProcessedQuery = {}): SpoolFindProcessedResult {
    return findProcessedPage(this.processedEvents, query)
  }

  removeOneIngress(id: string): boolean {
    const removed = this.store.removeOneIngress(id)
    if (removed) this.reconcileIngressRemoved([id])
    return removed
  }

  removeManyIngress(idsOrQuery: string[] | SpoolRemoveIngressQuery): number {
    const ids = Array.isArray(idsOrQuery)
      ? idsOrQuery
      : filterIngressRecords(
          this.store.getAllIngress(),
          idsOrQuery,
          this.state.ingress_processed,
        ).map((record) => record.id)
    const removed = this.store.removeManyIngress(ids)
    if (removed > 0) this.reconcileIngressRemoved(ids)
    return removed
  }

  removeAllIngress(query?: SpoolRemoveIngressQuery): number {
    if (query === undefined) {
      const ids = this.store.getAllIngress().map((record) => record.id)
      const removed = this.store.removeAllIngress()
      if (removed > 0) this.reconcileIngressRemoved(ids)
      return removed
    }
    return this.removeManyIngress(query)
  }

  removeManyEgress(indices: number[]): number {
    if (indices.length === 0) return 0
    const unique = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0)
    unique.sort((a, b) => b - a)
    let removed = 0
    for (const index of unique) {
      if (index < this.state.egress.length) {
        this.state.egress.splice(index, 1)
        removed += 1
      }
    }
    if (removed > 0) this.store.saveState(this.state)
    return removed
  }

  removeAllEgress(): number {
    const removed = this.state.egress.length
    if (removed > 0) {
      this.state.egress = []
      this.store.saveState(this.state)
    }
    return removed
  }

  enqueueText(
    input: Omit<PrepareTextInput, 'peer' | 'bearerId'> &
      Partial<Pick<PrepareTextInput, 'peer' | 'bearerId'>>,
  ): { ok: true; envelope: MeshEnvelopeV1 } | { ok: false; reason: string } {
    const prepared = prepareEnvelopeFromText({
      text: input.text,
      lang: input.lang,
      peer: input.peer ?? this.peer,
      bearerId: input.bearerId ?? this.defaultBearerId,
      overlayId: input.overlayId ?? this.defaultOverlayId,
      packId: input.packId ?? this.defaultPackId,
    })
    if ('error' in prepared) {
      return { ok: false, reason: prepared.error }
    }
    const enq = this.appendOneEgress(prepared)
    if (!enq.ok) return enq
    return { ok: true, envelope: prepared }
  }

  enqueueIntent(
    input: Omit<PrepareIntentInput, 'peer' | 'bearerId'> &
      Partial<Pick<PrepareIntentInput, 'peer' | 'bearerId'>>,
  ): { ok: true; envelope: MeshEnvelopeV1 } | { ok: false; reason: string } {
    const prepared = prepareEnvelopeFromIntent({
      intentBody: input.intentBody,
      peer: input.peer ?? this.peer,
      bearerId: input.bearerId ?? this.defaultBearerId,
      overlayId: input.overlayId ?? this.defaultOverlayId,
      packId: input.packId ?? this.defaultPackId,
    })
    if ('error' in prepared) {
      return { ok: false, reason: prepared.error }
    }
    const enq = this.appendOneEgress(prepared)
    if (!enq.ok) return enq
    return { ok: true, envelope: prepared }
  }

  /** @deprecated Use {@link appendOneIngress}. */
  appendIngress(envelope: MeshEnvelopeV1): AppendOneIngressResult {
    return this.appendOneIngress(envelope)
  }

  /** @deprecated Use {@link appendOneEgress}. */
  enqueueEgress(envelope: MeshEnvelopeV1): AppendOneEgressResult {
    return this.appendOneEgress(envelope)
  }

  /** @deprecated Use {@link removeOneEgress}. */
  dequeueEgress(): MeshEnvelopeV1 | null {
    return this.removeOneEgress()
  }

  /** @deprecated Use {@link getAllEgress}. */
  listEgressPending(): MeshEnvelopeV1[] {
    return this.getAllEgress()
  }

  /** @deprecated Use {@link getAllProcessed}. */
  listProcessed(since = 0): ProcessedEvent[] {
    return this.getAllProcessed(since)
  }

  private totalDepth(): number {
    const d = this.depth()
    return d.ingress_pending + d.egress_pending
  }

  private ensurePackTipRegistered(vocabTip: string): void {
    if (this.receiveCtx.packs.has(vocabTip)) return
    registerPackForTip(this.receiveCtx, this.defaultPackId, vocabTip)
  }

  private reconcileIngressRemoved(ids: string[]): void {
    const drop = new Set(ids)
    this.state.ingress_processed = this.state.ingress_processed.filter((id) => !drop.has(id))
    this.processedEvents = this.processedEvents.filter((event) => !drop.has(event.ingress_id))
    this.seenIngress.clear()
    for (const record of this.store.getAllIngress()) {
      this.seenIngress.add(envelopeDedupeKey(record.envelope))
    }
    this.store.saveState(this.state)
  }
}