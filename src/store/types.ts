import type { MeshEnvelopeV1, IngressWalRecord } from '../types/envelope.js'
import type { SpoolState } from '../types/config.js'

export type SpoolStorageKind = 'jsonl' | 'sqlite' | 'rocksdb' | 'memory'

export interface SpoolStore {
  readonly kind: SpoolStorageKind
  readonly dataDir: string
  ensureReady(): void
  hasPersistedState(): boolean
  getState(fallbackPeer: string): SpoolState
  saveState(state: SpoolState): void
  appendOneIngress(record: IngressWalRecord): void
  getAllIngress(): IngressWalRecord[]
  getOneIngress(id: string): IngressWalRecord | undefined
  getManyIngress(ids: string[]): IngressWalRecord[]
  appendOneEgressAudit(envelope: MeshEnvelopeV1): void
  /** Replace the ingress WAL with an exact record list (used by remove*). */
  replaceAllIngress(records: IngressWalRecord[]): void
  removeOneIngress(id: string): boolean
  removeManyIngress(ids: string[]): number
  removeAllIngress(): number
  close(): void
}