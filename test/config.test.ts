import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPOOL_HTTP_PATHS } from '../src/api/path-config.js'
import { createSpool, loadSpoolConfig, withSpoolHttpRouteOptions } from '../src/config.js'

describe('loadSpoolConfig', () => {
  let dataDir: string

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('uses SPOOL_DATA_DIR and defaults', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-cfg-'))
    const cfg = loadSpoolConfig({
      SPOOL_DATA_DIR: dataDir,
      SPOOL_PEER: 'fixed-peer',
      SPOOL_PORT: '9999',
      SPOOL_DEFAULT_BEARER: 'lora',
    })
    expect(cfg.dataDir).toBe(dataDir)
    expect(cfg.peer).toBe('fixed-peer')
    expect(cfg.port).toBe(9999)
    expect(cfg.defaultBearerId).toBe('lora')
    expect(cfg.defaultPackId).toBe('resilience')
    expect(cfg.httpPaths.outbox).toBe('/api/outbox')
  })

  it('parses SPOOL_STORAGE', () => {
    expect(loadSpoolConfig({ SPOOL_STORAGE: 'sqlite' }).storage).toBe('sqlite')
    expect(loadSpoolConfig({ SPOOL_STORAGE: 'rocksdb' }).storage).toBe('rocksdb')
    expect(loadSpoolConfig({ SPOOL_STORAGE: 'memory' }).storage).toBe('memory')
    expect(loadSpoolConfig({ SPOOL_STORAGE: 'jsonl' }).storage).toBe('jsonl')
  })

  it('applies SPOOL_HTTP_PATH_PREFIX', () => {
    const cfg = loadSpoolConfig({
      SPOOL_HTTP_PATH_PREFIX: '/hub',
    })
    expect(cfg.httpPaths.outbox).toBe('/hub/api/outbox')
  })

  it('applies SPOOL_HTTP_MOUNT_PREFIX', () => {
    const cfg = loadSpoolConfig({
      SPOOL_HTTP_MOUNT_PREFIX: '/gateway',
    })
    expect(cfg.httpMountPrefix).toBe('/gateway')
    expect(cfg.httpPaths.outbox).toBe('/api/outbox')
  })

  it('withSpoolHttpRouteOptions merges path and mount', () => {
    const base = loadSpoolConfig({ SPOOL_DATA_DIR: '/tmp/spool-x' })
    const merged = withSpoolHttpRouteOptions(base, {
      pathPrefix: '/field',
      mountPrefix: '/proxy',
    })
    expect(merged.httpPaths.health).toBe('/field/health')
    expect(merged.httpMountPrefix).toBe('/proxy')
    expect(merged.port).toBe(base.port)
  })

  it('createSpool honors peer from config', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-cfg-'))
    const spool = createSpool({
      dataDir,
      bindHost: '127.0.0.1',
      port: 8093,
      serviceId: 'spool',
      serviceVersion: '0.0.0',
      peer: 'cfg-peer',
      httpPaths: DEFAULT_SPOOL_HTTP_PATHS,
    })
    expect(spool.peer).toBe('cfg-peer')
  })
})