import { createJsonlSpoolStore } from './jsonl-store.js'
import { createMemorySpoolStore } from './memory-store.js'
import { createRocksdbSpoolStore } from './rocksdb-store.js'
import { createSqliteSpoolStore } from './sqlite-store.js'
import type { SpoolStorageKind, SpoolStore } from './types.js'

export function createSpoolStore(dataDir: string, kind: SpoolStorageKind = 'jsonl'): SpoolStore {
  switch (kind) {
    case 'sqlite':
      return createSqliteSpoolStore(dataDir)
    case 'rocksdb':
      return createRocksdbSpoolStore(dataDir)
    case 'memory':
      return createMemorySpoolStore(dataDir)
    default:
      return createJsonlSpoolStore(dataDir)
  }
}

export function parseSpoolStorageKind(raw: string | undefined): SpoolStorageKind {
  const value = raw?.trim().toLowerCase()
  switch (value) {
    case 'sqlite':
      return 'sqlite'
    case 'rocksdb':
      return 'rocksdb'
    case 'memory':
      return 'memory'
    default:
      return 'jsonl'
  }
}