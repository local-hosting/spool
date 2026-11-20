import path from 'node:path'
import type { PackId } from '@local-hosting/vocab'
import {
  applySpoolHttpRouteOptions,
  loadSpoolHttpRouteOptionsFromEnv,
  type SpoolHttpPaths,
  type SpoolHttpRouteOptions,
} from './api/path-config.js'
import { parseSpoolStorageKind } from './store/create-store.js'
import { Spool } from './spool.js'
import type { SpoolConfig } from './types/config.js'

export type BindHost = '127.0.0.1' | '0.0.0.0'

export type SpoolServiceConfig = SpoolConfig & {
  bindHost: BindHost
  port: number
  apiKey?: string
  serviceId: string
  serviceVersion: string
  /** Absolute pathnames used by {@link handleSpoolRoutes} (defaults: lantern `/api/...`). */
  httpPaths: SpoolHttpPaths
  /**
   * If set, strip this mount prefix from `url.pathname` before matching `httpPaths`
   * (for reverse proxies that forward the full path). Set via `SPOOL_HTTP_MOUNT_PREFIX` or
   * {@link SpoolHttpRouteOptions.mountPrefix}.
   */
  httpMountPrefix?: string
}

/** HTTP-only slice for embedders (paths + mount strip). */
export type SpoolHttpRouteConfig = Pick<SpoolServiceConfig, 'httpPaths' | 'httpMountPrefix'>

function envString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim()
  return v || undefined
}

function parseBindHost(raw: string | undefined): BindHost {
  return raw === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
}

export function loadSpoolConfig(env: NodeJS.ProcessEnv = process.env): SpoolServiceConfig {
  const dataDir =
    envString(env, 'SPOOL_DATA_DIR') ??
    envString(env, 'SPOOL_DATA') ??
    path.resolve(process.cwd(), 'data')

  return {
    dataDir,
    peer: envString(env, 'SPOOL_PEER'),
    maxDepth: env.SPOOL_MAX_DEPTH ? Number(env.SPOOL_MAX_DEPTH) : undefined,
    defaultPackId: (envString(env, 'SPOOL_DEFAULT_PACK') ?? 'resilience') as PackId,
    defaultBearerId: envString(env, 'SPOOL_DEFAULT_BEARER') ?? 'lora',
    defaultOverlayId: envString(env, 'SPOOL_DEFAULT_OVERLAY'),
    storage: parseSpoolStorageKind(envString(env, 'SPOOL_STORAGE')),
    bindHost: parseBindHost(envString(env, 'SPOOL_BIND_HOST') ?? envString(env, 'BIND_HOST')),
    port: Number(envString(env, 'SPOOL_PORT') ?? envString(env, 'PORT') ?? 8093),
    apiKey: envString(env, 'SPOOL_API_KEY') ?? envString(env, 'API_KEY'),
    serviceId: envString(env, 'SPOOL_SERVICE_ID') ?? 'spool',
    serviceVersion: env.npm_package_version?.trim() || '0.1.0',
    ...loadSpoolHttpRouteOptionsFromEnv(env),
  }
}

export function withSpoolHttpRouteOptions(
  config: SpoolServiceConfig,
  route: SpoolHttpRouteOptions,
): SpoolServiceConfig {
  return { ...config, ...applySpoolHttpRouteOptions(config, route) }
}

export function createSpool(config: SpoolServiceConfig = loadSpoolConfig()): Spool {
  return new Spool({
    dataDir: config.dataDir,
    peer: config.peer,
    maxDepth: config.maxDepth,
    defaultPackId: config.defaultPackId,
    defaultBearerId: config.defaultBearerId,
    defaultOverlayId: config.defaultOverlayId,
    storage: config.storage,
    store: config.store,
  })
}