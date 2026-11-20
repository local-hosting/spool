import type { MeshEnvelopeV1, IngressWalRecord } from '../types/envelope.js'
import type { SpoolState } from '../types/config.js'
import type { SpoolStorageKind, SpoolStore } from './types.js'

/** Shared helpers and contract for concrete {@link SpoolStore} implementations. */
export abstract class SpoolStoreBase implements SpoolStore {
  abstract readonly kind: SpoolStorageKind

  constructor(readonly dataDir: string) {}

  protected emptyState(fallbackPeer: string): SpoolState {
    return { peer: fallbackPeer, egress: [], ingress_processed: [] }
  }

  protected coerceState(raw: Partial<SpoolState> | undefined, fallbackPeer: string): SpoolState {
    if (!raw) return this.emptyState(fallbackPeer)
    return {
      peer: raw.peer ?? fallbackPeer,
      egress: Array.isArray(raw.egress) ? raw.egress : [],
      ingress_processed: Array.isArray(raw.ingress_processed) ? raw.ingress_processed : [],
    }
  }

  protected cloneState(state: SpoolState): SpoolState {
    return {
      peer: state.peer,
      egress: [...state.egress],
      ingress_processed: [...state.ingress_processed],
    }
  }

  protected cloneIngressRecord(record: IngressWalRecord): IngressWalRecord {
    return {
      id: record.id,
      received_at: record.received_at,
      envelope: record.envelope,
    }
  }

  abstract ensureReady(): void
  abstract hasPersistedState(): boolean
  abstract getState(fallbackPeer: string): SpoolState
  abstract saveState(state: SpoolState): void
  abstract appendOneIngress(record: IngressWalRecord): void
  abstract getAllIngress(): IngressWalRecord[]
  abstract appendOneEgressAudit(envelope: MeshEnvelopeV1): void
  abstract replaceAllIngress(records: IngressWalRecord[]): void

  getOneIngress(id: string): IngressWalRecord | undefined {
    return this.getAllIngress().find((record) => record.id === id)
  }

  getManyIngress(ids: string[]): IngressWalRecord[] {
    if (ids.length === 0) return []
    const want = new Set(ids)
    return this.getAllIngress().filter((record) => want.has(record.id))
  }

  removeOneIngress(id: string): boolean {
    return this.removeManyIngress([id]) > 0
  }

  removeManyIngress(ids: string[]): number {
    if (ids.length === 0) return 0
    const drop = new Set(ids)
    const kept = this.getAllIngress().filter((record) => !drop.has(record.id))
    const removed = this.getAllIngress().length - kept.length
    if (removed > 0) this.replaceAllIngress(kept)
    return removed
  }

  removeAllIngress(): number {
    const count = this.getAllIngress().length
    if (count > 0) this.replaceAllIngress([])
    return count
  }

  close(): void {
    /* no-op unless backend holds resources */
  }
}