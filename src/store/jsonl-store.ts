import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MeshEnvelopeV1, IngressWalRecord } from '../types/envelope.js'
import type { SpoolState } from '../types/config.js'
import type { SpoolStore } from './types.js'
import { SpoolStoreBase } from './base-store.js'

const INGRESS_WAL = 'ingress.wal.jsonl'
const EGRESS_WAL = 'egress.wal.jsonl'
const STATE_FILE = 'state.json'

export function jsonlStatePath(dataDir: string): string {
  return path.join(dataDir, STATE_FILE)
}

export class JsonlSpoolStore extends SpoolStoreBase {
  readonly kind = 'jsonl' as const

  private get stateFile(): string {
    return jsonlStatePath(this.dataDir)
  }

  ensureReady(): void {
    mkdirSync(this.dataDir, { recursive: true })
  }

  hasPersistedState(): boolean {
    return existsSync(this.stateFile)
  }

  getState(fallbackPeer: string): SpoolState {
    if (!existsSync(this.stateFile)) {
      return this.emptyState(fallbackPeer)
    }
    const raw = JSON.parse(readFileSync(this.stateFile, 'utf8')) as SpoolState
    return this.coerceState(raw, fallbackPeer)
  }

  saveState(state: SpoolState): void {
    writeFileSync(this.stateFile, JSON.stringify(state, null, 0))
  }

  appendOneIngress(record: IngressWalRecord): void {
    appendFileSync(
      path.join(this.dataDir, INGRESS_WAL),
      `${JSON.stringify(record)}\n`,
      'utf8',
    )
  }

  getAllIngress(): IngressWalRecord[] {
    const file = path.join(this.dataDir, INGRESS_WAL)
    if (!existsSync(file)) return []
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as IngressWalRecord)
  }

  appendOneEgressAudit(envelope: MeshEnvelopeV1): void {
    appendFileSync(path.join(this.dataDir, EGRESS_WAL), `${JSON.stringify(envelope)}\n`, 'utf8')
  }

  replaceAllIngress(records: IngressWalRecord[]): void {
    const file = path.join(this.dataDir, INGRESS_WAL)
    const body = records.map((record) => `${JSON.stringify(record)}\n`).join('')
    writeFileSync(file, body)
  }
}

export function createJsonlSpoolStore(dataDir: string): SpoolStore {
  return new JsonlSpoolStore(dataDir)
}