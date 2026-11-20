import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPOOL_HTTP_PATHS } from '../src/api/path-config.js'
import { createSpool, withSpoolHttpRouteOptions, type SpoolServiceConfig } from '../src/config.js'
import { createSpoolServer } from '../src/api/server.js'
import type { Server } from 'node:http'

describe('spool HTTP', () => {
  let dataDir: string
  let server: Server
  let baseUrl: string
  let config: SpoolServiceConfig

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-http-'))
    config = {
      dataDir,
      bindHost: '127.0.0.1',
      port: 0,
      serviceId: 'spool',
      serviceVersion: '0.1.0-test',
      defaultBearerId: 'lora',
      defaultPackId: 'resilience',
      httpPaths: DEFAULT_SPOOL_HTTP_PATHS,
    }
    const spool = createSpool(config)
    server = createSpoolServer({ config, spool })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('PUT/POST /api/outbox and PUT /api/inbox round-trip', async () => {
    const put = await fetch(`${baseUrl}/api/outbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'We need milk for breakfast', lang: 'en' }),
    })
    expect(put.status).toBe(201)
    const putJson = (await put.json()) as { ok: boolean; message: string }
    expect(putJson.ok).toBe(true)

    const post = await fetch(`${baseUrl}/api/outbox`, { method: 'POST' })
    expect(post.status).toBe(201)
    const postJson = (await post.json()) as { message: string; rows: number }
    expect(postJson.message).toBe(putJson.message)
    expect(postJson.rows).toBe(0)

    const inbox = await fetch(`${baseUrl}/api/inbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: postJson.message }),
    })
    expect(inbox.status).toBe(201)

    const process = await fetch(`${baseUrl}/api/inbox/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max: 8 }),
    })
    const procJson = (await process.json()) as { ok: boolean; count: number }
    expect(procJson.ok).toBe(true)
    expect(procJson.count).toBe(1)
  })

  it('GET /api/info includes peer', async () => {
    const res = await fetch(`${baseUrl}/api/info`)
    const json = (await res.json()) as { peer: string }
    expect(json.peer).toBeTruthy()
  })

  it('GET /api/outbox lists pending egress after PUT', async () => {
    await fetch(`${baseUrl}/api/outbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Are you home yet?', lang: 'en' }),
    })
    const list = await fetch(`${baseUrl}/api/outbox`)
    const json = (await list.json()) as { messages: string[] }
    expect(json.messages).toHaveLength(1)
  })

  it('returns 401 when API key required', async () => {
    const spool = createSpool({ ...config, apiKey: 'secret-key' })
    const locked = createSpoolServer({ config: { ...config, apiKey: 'secret-key' }, spool })
    await new Promise<void>((resolve) => locked.listen(0, '127.0.0.1', () => resolve()))
    const addr = locked.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    const url = `http://127.0.0.1:${addr.port}/api/info`
    const denied = await fetch(url)
    expect(denied.status).toBe(401)
    const ok = await fetch(url, {
      headers: { Authorization: 'Bearer secret-key' },
    })
    expect(ok.status).toBe(200)
    await new Promise<void>((resolve, reject) => {
      locked.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/api/nope`)
    expect(res.status).toBe(404)
  })

  it('honors pathPrefix on standalone server', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    const prefixed = withSpoolHttpRouteOptions(config, { pathPrefix: '/mesh' })
    const spool = createSpool(prefixed)
    server = createSpoolServer({ config: prefixed, spool })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    baseUrl = `http://127.0.0.1:${addr.port}`

    const health = await fetch(`${baseUrl}/mesh/health`)
    expect(health.status).toBe(200)

    const legacy = await fetch(`${baseUrl}/health`)
    expect(legacy.status).toBe(404)
  })

  it('honors httpRoute mountPrefix with default paths', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    const spool = createSpool(config)
    server = createSpoolServer({
      config,
      spool,
      httpRoute: { mountPrefix: '/embedded' },
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    baseUrl = `http://127.0.0.1:${addr.port}`

    const info = await fetch(`${baseUrl}/embedded/api/info`)
    expect(info.status).toBe(200)

    const bare = await fetch(`${baseUrl}/api/info`)
    expect(bare.status).toBe(200)
  })

  it('honors custom httpPaths', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    const custom: SpoolServiceConfig = {
      ...config,
      httpPaths: {
        ...DEFAULT_SPOOL_HTTP_PATHS,
        outbox: '/mesh/egress',
        inbox: '/mesh/ingress',
        inboxProcess: '/mesh/ingress/process',
      },
    }
    const spool = createSpool(custom)
    server = createSpoolServer({ config: custom, spool })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    baseUrl = `http://127.0.0.1:${addr.port}`

    const put = await fetch(`${baseUrl}/mesh/egress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'We need milk for breakfast', lang: 'en' }),
    })
    expect(put.status).toBe(201)

    const legacy = await fetch(`${baseUrl}/api/outbox`)
    expect(legacy.status).toBe(404)
  })

  it('POST prefixed inbox/process via mount strip', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    const spool = createSpool(config)
    server = createSpoolServer({
      config,
      spool,
      httpRoute: { mountPrefix: '/edge' },
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    baseUrl = `http://127.0.0.1:${addr.port}`

    const put = await fetch(`${baseUrl}/edge/api/outbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'We need milk for breakfast', lang: 'en' }),
    })
    const { message } = (await put.json()) as { message: string }
    await fetch(`${baseUrl}/edge/api/inbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const process = await fetch(`${baseUrl}/edge/api/inbox/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max: 4 }),
    })
    const procJson = (await process.json()) as { count: number }
    expect(procJson.count).toBe(1)
  })

  it('PUT /api/inbox duplicate returns 200', async () => {
    const put = await fetch(`${baseUrl}/api/outbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'We need milk for breakfast', lang: 'en' }),
    })
    const { message } = (await put.json()) as { message: string }
    const first = await fetch(`${baseUrl}/api/inbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    expect(first.status).toBe(201)
    const second = await fetch(`${baseUrl}/api/inbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    expect(second.status).toBe(200)
    const body = (await second.json()) as { duplicate: boolean }
    expect(body.duplicate).toBe(true)
  })
})