import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { MeshEnvelopeV1, IngressWalRecord } from '../types/envelope.js'
import type { SpoolState } from '../types/config.js'
import type { SpoolStore } from './types.js'
import { SpoolStoreBase } from './base-store.js'

const DB_FILE = 'spool.db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingress (
  id TEXT PRIMARY KEY NOT NULL,
  received_at TEXT NOT NULL,
  envelope_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingress_processed (
  ingress_id TEXT PRIMARY KEY NOT NULL
);
CREATE TABLE IF NOT EXISTS egress_queue (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS egress_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_json TEXT NOT NULL
);
`

export function sqliteDbPath(dataDir: string): string {
  return path.join(dataDir, DB_FILE)
}

export class SqliteSpoolStore extends SpoolStoreBase {
  readonly kind = 'sqlite' as const
  private db: DatabaseSync | undefined

  private database(): DatabaseSync {
    if (!this.db) {
      throw new Error('sqlite spool store not initialized; call ensureReady()')
    }
    return this.db
  }

  ensureReady(): void {
    mkdirSync(this.dataDir, { recursive: true })
    this.db = new DatabaseSync(sqliteDbPath(this.dataDir))
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(SCHEMA)
  }

  hasPersistedState(): boolean {
    if (!this.db) {
      try {
        this.db = new DatabaseSync(sqliteDbPath(this.dataDir))
      } catch {
        return false
      }
    }
    const row = this.db
      .prepare(`SELECT value FROM meta WHERE key = 'peer' LIMIT 1`)
      .get() as { value: string } | undefined
    return Boolean(row?.value)
  }

  getState(fallbackPeer: string): SpoolState {
    const peerRow = this.database()
      .prepare(`SELECT value FROM meta WHERE key = 'peer' LIMIT 1`)
      .get() as { value: string } | undefined
    if (!peerRow?.value) {
      return this.emptyState(fallbackPeer)
    }

    const egress = this.database()
      .prepare(`SELECT envelope_json FROM egress_queue ORDER BY position ASC`)
      .all() as { envelope_json: string }[]

    const processed = this.database()
      .prepare(`SELECT ingress_id FROM ingress_processed ORDER BY rowid ASC`)
      .all() as { ingress_id: string }[]

    return {
      peer: peerRow.value,
      egress: egress.map((row) => JSON.parse(row.envelope_json) as MeshEnvelopeV1),
      ingress_processed: processed.map((row) => row.ingress_id),
    }
  }

  saveState(state: SpoolState): void {
    const d = this.database()
    d.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('peer', ?)`).run(state.peer)

    d.exec('DELETE FROM egress_queue')
    const insertEgress = d.prepare(`INSERT INTO egress_queue (envelope_json) VALUES (?)`)
    for (const envelope of state.egress) {
      insertEgress.run(JSON.stringify(envelope))
    }

    d.exec('DELETE FROM ingress_processed')
    const insertProcessed = d.prepare(`INSERT INTO ingress_processed (ingress_id) VALUES (?)`)
    for (const ingressId of state.ingress_processed) {
      insertProcessed.run(ingressId)
    }
  }

  appendOneIngress(record: IngressWalRecord): void {
    this.database()
      .prepare(`INSERT INTO ingress (id, received_at, envelope_json) VALUES (?, ?, ?)`)
      .run(record.id, record.received_at, JSON.stringify(record.envelope))
  }

  getAllIngress(): IngressWalRecord[] {
    const rows = this.database()
      .prepare(`SELECT id, received_at, envelope_json FROM ingress ORDER BY rowid ASC`)
      .all() as { id: string; received_at: string; envelope_json: string }[]

    return rows.map((row) => ({
      id: row.id,
      received_at: row.received_at,
      envelope: JSON.parse(row.envelope_json) as MeshEnvelopeV1,
    }))
  }

  appendOneEgressAudit(envelope: MeshEnvelopeV1): void {
    this.database()
      .prepare(`INSERT INTO egress_audit (envelope_json) VALUES (?)`)
      .run(JSON.stringify(envelope))
  }

  replaceAllIngress(records: IngressWalRecord[]): void {
    const d = this.database()
    d.exec('DELETE FROM ingress')
    const insert = d.prepare(
      `INSERT INTO ingress (id, received_at, envelope_json) VALUES (?, ?, ?)`,
    )
    for (const record of records) {
      insert.run(record.id, record.received_at, JSON.stringify(record.envelope))
    }
  }

  close(): void {
    this.db?.close()
    this.db = undefined
  }
}

export function createSqliteSpoolStore(dataDir: string): SpoolStore {
  return new SqliteSpoolStore(dataDir)
}