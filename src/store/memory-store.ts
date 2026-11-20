import type { MeshEnvelopeV1, IngressWalRecord } from '../types/envelope.js'
import type { SpoolState } from '../types/config.js'
import type { SpoolStore } from './types.js'
import { SpoolStoreBase } from './base-store.js'

type MemoryBacking = {
  state?: SpoolState
  ingress: IngressWalRecord[]
  egressAudit: MeshEnvelopeV1[]
  persisted: boolean
}

const backings = new Map<string, MemoryBacking>()

function backingFor(dataDir: string): MemoryBacking {
  let backing = backings.get(dataDir)
  if (!backing) {
    backing = { ingress: [], egressAudit: [], persisted: false }
    backings.set(dataDir, backing)
  }
  return backing
}

export function resetMemorySpoolStore(dataDir: string): void {
  backings.delete(dataDir)
}

export class MemorySpoolStore extends SpoolStoreBase {
  readonly kind = 'memory' as const
  private readonly backing: MemoryBacking

  constructor(dataDir = ':memory:') {
    super(dataDir)
    this.backing = backingFor(dataDir)
  }

  ensureReady(): void {
    /* no-op */
  }

  hasPersistedState(): boolean {
    return this.backing.persisted
  }

  getState(fallbackPeer: string): SpoolState {
    if (!this.backing.state) return this.emptyState(fallbackPeer)
    return this.cloneState(this.backing.state)
  }

  saveState(next: SpoolState): void {
    this.backing.state = this.cloneState(next)
    this.backing.persisted = true
  }

  appendOneIngress(record: IngressWalRecord): void {
    this.backing.ingress.push(this.cloneIngressRecord(record))
  }

  getAllIngress(): IngressWalRecord[] {
    return this.backing.ingress.map((record) => this.cloneIngressRecord(record))
  }

  appendOneEgressAudit(envelope: MeshEnvelopeV1): void {
    this.backing.egressAudit.push(envelope)
  }

  replaceAllIngress(records: IngressWalRecord[]): void {
    this.backing.ingress = records.map((record) => this.cloneIngressRecord(record))
  }
}

export function createMemorySpoolStore(dataDir = ':memory:'): SpoolStore {
  return new MemorySpoolStore(dataDir)
}