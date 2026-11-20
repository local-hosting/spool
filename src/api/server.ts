import http from 'node:http'
import { createSpool, loadSpoolConfig, type SpoolServiceConfig } from '../config.js'
import type { Spool } from '../spool.js'
import { assertAllowedBindHost, isAuthorized, writeJson } from './http.js'
import type { SpoolHttpRouteOptions } from './path-config.js'
import { handleSpoolRoutes } from './routes.js'

export type SpoolServerOptions = {
  config?: SpoolServiceConfig
  spool?: Spool
  /** Merged per request over `config` paths / mount strip (e.g. `mountPrefix: '/spool'`). */
  httpRoute?: SpoolHttpRouteOptions
}

export function createSpoolServer(options: SpoolServerOptions = {}): http.Server {
  const config = options.config ?? loadSpoolConfig()
  const spool = options.spool ?? createSpool(config)
  const httpRoute = options.httpRoute

  return http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      writeJson(res, 400, { error: 'bad request' })
      return
    }

    const url = new URL(req.url, `http://${config.bindHost}:${config.port}`)

    if (!isAuthorized(req, config.apiKey)) {
      writeJson(res, 401, { error: 'unauthorized' })
      return
    }

    try {
      const handled = await handleSpoolRoutes(req, res, url, spool, config, options.httpRoute)
      if (!handled) {
        writeJson(res, 404, { error: 'not found' })
      }
    } catch (e) {
      writeJson(res, 500, { error: e instanceof Error ? e.message : 'internal error' })
    }
  })
}

export function startSpoolServer(options: SpoolServerOptions = {}): http.Server {
  const config = options.config ?? loadSpoolConfig()
  assertAllowedBindHost(config.bindHost)
  const server = createSpoolServer({ config, spool: options.spool })
  server.listen(config.port, config.bindHost, () => {
    console.log(`spool on http://${config.bindHost}:${config.port}`)
  })
  return server
}