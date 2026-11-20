import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import rocksdbFactory from 'rocksdb'
import type { MeshEnvelopeV1, IngressWalRecord } from '../types/envelope.js'
import type { SpoolState } from '../types/config.js'
import type { SpoolStore } from './types.js'
import { SpoolStoreBase } from './base-store.js'
import { waitForCallback, waitForGet, waitForPut } from './sync-wait.js'

const DIR_NAME = 'rocksdb'

const KEY = {
  state: 'meta/state',
  ingressCount: 'meta/ingress_count',
  ingressOrder: (index: number) => `ingress/order/${padIndex(index)}`,
  ingressRecord: (id: string) => `ingress/record/${id}`,
  egressAudit: (index: number) => `egress/audit/${padIndex(index)}`,
} as const

type LevelDownDb = {
  open: (
    options: { createIfMissing?: boolean; errorIfExists?: boolean },
    callback: (err?: Error) => void,
  ) => void
  close: (callback: (err?: Error) => void) => void
  get: (key: string, callback: (err: Error & { notFound?: boolean }, value?: string) => void) => void
  put: (key: string, value: string, callback: (err?: Error) => void) => void
  del: (key: string, callback: (err?: Error) => void) => void
}

function padIndex(index: number): string {
  return String(index).padStart(12, '0')
}

export function rocksdbDataPath(dataDir: string): string {
  return path.join(dataDir, DIR_NAME)
}

export class RocksdbSpoolStore extends SpoolStoreBase {
  readonly kind = 'rocksdb' as const
  private db: LevelDownDb | undefined
  private auditCount = 0

  private get location(): string {
    return rocksdbDataPath(this.dataDir)
  }

  private database(): LevelDownDb {
    if (!this.db) {
      throw new Error('rocksdb spool store not initialized; call ensureReady()')
    }
    return this.db
  }

  private dbOpen(
    instance: LevelDownDb,
    options: { createIfMissing: boolean; errorIfExists: boolean },
  ): void {
    waitForCallback((done) => instance.open(options, done))
  }

  private dbClose(instance: LevelDownDb): void {
    waitForCallback((done) => instance.close(done))
  }

  ensureReady(): void {
    mkdirSync(this.dataDir, { recursive: true })
    if (!this.db) {
      this.db = rocksdbFactory(this.location) as LevelDownDb
    }
    this.dbOpen(this.db, { createIfMissing: true, errorIfExists: false })
  }

  hasPersistedState(): boolean {
    if (!this.db) {
      try {
        const probe = rocksdbFactory(this.location) as LevelDownDb
        this.dbOpen(probe, { createIfMissing: false, errorIfExists: false })
        const raw = waitForGet(probe, KEY.state)
        this.dbClose(probe)
        return typeof raw === 'string'
      } catch {
        return false
      }
    }
    return typeof waitForGet(this.database(), KEY.state) === 'string'
  }

  getState(fallbackPeer: string): SpoolState {
    const raw = waitForGet(this.database(), KEY.state)
    if (typeof raw !== 'string') return this.emptyState(fallbackPeer)
    return this.coerceState(JSON.parse(raw) as SpoolState, fallbackPeer)
  }

  saveState(state: SpoolState): void {
    waitForPut(this.database(), KEY.state, JSON.stringify(state))
  }

  appendOneIngress(record: IngressWalRecord): void {
    const db = this.database()
    const countRaw = waitForGet(db, KEY.ingressCount)
    const count = countRaw ? Number(countRaw) : 0
    waitForPut(db, KEY.ingressRecord(record.id), JSON.stringify(record))
    waitForPut(db, KEY.ingressOrder(count), record.id)
    waitForPut(db, KEY.ingressCount, String(count + 1))
  }

  getAllIngress(): IngressWalRecord[] {
    const db = this.database()
    const countRaw = waitForGet(db, KEY.ingressCount)
    const count = countRaw ? Number(countRaw) : 0
    const out: IngressWalRecord[] = []
    for (let i = 0; i < count; i++) {
      const id = waitForGet(db, KEY.ingressOrder(i))
      if (typeof id !== 'string') continue
      const raw = waitForGet(db, KEY.ingressRecord(id))
      if (typeof raw !== 'string') continue
      out.push(JSON.parse(raw) as IngressWalRecord)
    }
    return out
  }

  appendOneEgressAudit(envelope: MeshEnvelopeV1): void {
    waitForPut(this.database(), KEY.egressAudit(this.auditCount), JSON.stringify(envelope))
    this.auditCount += 1
  }

  replaceAllIngress(records: IngressWalRecord[]): void {
    const db = this.database()
    const priorRaw = waitForGet(db, KEY.ingressCount)
    const prior = priorRaw ? Number(priorRaw) : 0
    for (let i = 0; i < prior; i++) {
      const id = waitForGet(db, KEY.ingressOrder(i))
      if (typeof id === 'string') {
        waitForCallback((done) => db.del(KEY.ingressRecord(id), done))
      }
      waitForCallback((done) => db.del(KEY.ingressOrder(i), done))
    }
    waitForPut(db, KEY.ingressCount, String(records.length))
    for (let i = 0; i < records.length; i++) {
      const record = records[i]!
      waitForPut(db, KEY.ingressRecord(record.id), JSON.stringify(record))
      waitForPut(db, KEY.ingressOrder(i), record.id)
    }
  }

  close(): void {
    if (!this.db) return
    this.dbClose(this.db)
    this.db = undefined
  }
}

export function createRocksdbSpoolStore(dataDir: string): SpoolStore {
  return new RocksdbSpoolStore(dataDir)
}

export function removeRocksdbDataPath(dataDir: string): void {
  rmSync(rocksdbDataPath(dataDir), { recursive: true, force: true })
}