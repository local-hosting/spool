/** @deprecated Import from `./store/` or use `createSpoolStore`. */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createJsonlSpoolStore, jsonlStatePath } from './store/jsonl-store.js'
import { ensureDataDir } from './store/ensure-data-dir.js'
import type { MeshEnvelopeV1, IngressWalRecord } from './types/envelope.js'
import type { SpoolState } from './types/config.js'

export { ensureDataDir, jsonlStatePath as statePath }

const EGRESS_WAL = 'egress.wal.jsonl'

function legacyJsonl(dataDir: string) {
  const store = createJsonlSpoolStore(dataDir)
  store.ensureReady()
  return store
}

export function loadState(dataDir: string, fallbackPeer: string): SpoolState {
  return legacyJsonl(dataDir).getState(fallbackPeer)
}

export function saveState(dataDir: string, state: SpoolState): void {
  legacyJsonl(dataDir).saveState(state)
}

export function appendIngressWal(dataDir: string, record: IngressWalRecord): void {
  legacyJsonl(dataDir).appendOneIngress(record)
}

export function readIngressWal(dataDir: string): IngressWalRecord[] {
  return legacyJsonl(dataDir).getAllIngress()
}

export function appendEgressWal(dataDir: string, envelope: MeshEnvelopeV1): void {
  legacyJsonl(dataDir).appendOneEgressAudit(envelope)
}

export function readEgressWal(dataDir: string): MeshEnvelopeV1[] {
  const file = path.join(dataDir, EGRESS_WAL)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MeshEnvelopeV1)
}