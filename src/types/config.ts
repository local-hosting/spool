import type { PackId } from '@local-hosting/vocab'
import type { MeshEnvelopeV1 } from './envelope.js'
import type { SpoolStorageKind, SpoolStore } from '../store/types.js'

export type SpoolConfig = {
  dataDir: string
  peer?: string
  /** Max pending ingress + egress records combined (default 10_000). */
  maxDepth?: number
  defaultPackId?: PackId
  defaultBearerId?: string
  defaultOverlayId?: string
  /** Local persistence backend (`SPOOL_STORAGE`). Default `jsonl`. */
  storage?: SpoolStorageKind
  /** Inject a custom store (overrides `storage`). */
  store?: SpoolStore
}

export type SpoolState = {
  peer: string
  egress: MeshEnvelopeV1[]
  ingress_processed: string[]
}