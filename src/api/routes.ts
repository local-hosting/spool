import type http from 'node:http'
import type { SupportedLanguage } from '@local-hosting/compose'
import type { Spool } from '../spool.js'
import type { SpoolServiceConfig } from '../config.js'
import type { MeshEnvelopeV1 } from '../types/envelope.js'
import { envelopeToWireMessage, isMeshEnvelopeV1, parseWireMessage } from './envelope-wire.js'
import { readJsonBody, writeJson } from './http.js'
import {
  resolveSpoolHttpRouteOptions,
  spoolRequestPathname,
  type SpoolHttpRouteOptions,
} from './path-config.js'

function egressWireMessages(spool: Spool): string[] {
  return spool.getAllEgress().map(envelopeToWireMessage)
}

export async function handleSpoolRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  spool: Spool,
  config: SpoolServiceConfig,
  routeOptions?: SpoolHttpRouteOptions,
): Promise<boolean> {
  const route = routeOptions ? resolveSpoolHttpRouteOptions(routeOptions) : undefined
  const paths = route?.httpPaths ?? config.httpPaths
  const mountPrefix = route?.httpMountPrefix ?? config.httpMountPrefix
  const pathname = spoolRequestPathname(url.pathname, mountPrefix)

  if (req.method === 'GET' && pathname === paths.root) {
    const depth = spool.depth()
    writeJson(res, 200, {
      service: config.serviceId,
      version: config.serviceVersion,
      layer: '@local-hosting/spool',
      peer: spool.peer,
      peer_source: spool.peerSource,
      default_pack: spool.defaultPackId,
      default_bearer: spool.defaultBearerId,
      depth,
    })
    return true
  }

  if (req.method === 'GET' && pathname === paths.health) {
    writeJson(res, 200, { ok: true, peer: spool.peer, ...spool.depth() })
    return true
  }

  if (req.method === 'GET' && pathname === paths.info) {
    writeJson(res, 200, {
      peer: spool.peer,
      peer_source: spool.peerSource,
      online: true,
      cloud: false,
      spool: spool.depth(),
    })
    return true
  }

  if (req.method === 'GET' && pathname === paths.outbox) {
    writeJson(res, 200, { messages: egressWireMessages(spool) })
    return true
  }

  if (req.method === 'PUT' && pathname === paths.outbox) {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const result = handlePutOutbox(spool, body)
      writeJson(res, result.status, result.body)
    } catch (e) {
      writeJson(res, 400, { ok: false, error: e instanceof Error ? e.message : 'bad body' })
    }
    return true
  }

  if (req.method === 'POST' && pathname === paths.outbox) {
    const next = spool.removeOneEgress()
    const remaining = spool.getAllEgress().length
    const data = {
      message: next ? envelopeToWireMessage(next) : null,
      rows: remaining,
      envelope: next,
    }
    writeJson(res, next ? 201 : 200, data)
    return true
  }

  if (req.method === 'GET' && pathname === paths.inbox) {
    const events = spool.getAllProcessed()
    writeJson(res, 200, { messages: events })
    return true
  }

  if (req.method === 'PUT' && pathname === paths.inbox) {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>
      const result = handlePutInbox(spool, body)
      writeJson(res, result.status, result.body)
    } catch (e) {
      writeJson(res, 400, { ok: false, error: e instanceof Error ? e.message : 'bad body' })
    }
    return true
  }

  if (req.method === 'POST' && pathname === paths.inboxProcess) {
    try {
      const body = (await readJsonBody(req)) as { max?: number }
      const max = typeof body.max === 'number' ? body.max : 32
      const events = spool.processIngress(max)
      writeJson(res, 200, { ok: true, count: events.length, events })
    } catch (e) {
      writeJson(res, 500, { ok: false, error: e instanceof Error ? e.message : 'process failed' })
    }
    return true
  }

  if (req.method === 'POST' && pathname === paths.ingressProcess) {
    const max = Number(url.searchParams.get('max') ?? 32)
    const events = spool.processIngress(Number.isFinite(max) ? max : 32)
    writeJson(res, 200, { ok: true, count: events.length, events })
    return true
  }

  return false
}

function handlePutOutbox(
  spool: Spool,
  body: Record<string, unknown>,
): { status: number; body: unknown } {
  if (isMeshEnvelopeV1(body.envelope)) {
    const enq = spool.appendOneEgress(body.envelope)
    if (!enq.ok) return { status: 403, body: { ok: false, reason: enq.reason } }
    return { status: 201, body: { ok: true, message: envelopeToWireMessage(body.envelope) } }
  }

  if (typeof body.text === 'string' && typeof body.lang === 'string') {
    const enq = spool.enqueueText({
      text: body.text,
      lang: body.lang as SupportedLanguage,
      bearerId: typeof body.bearerId === 'string' ? body.bearerId : undefined,
      packId: typeof body.packId === 'string' ? (body.packId as never) : undefined,
    })
    if (!enq.ok) return { status: 403, body: { ok: false, reason: enq.reason } }
    return { status: 201, body: { ok: true, message: envelopeToWireMessage(enq.envelope) } }
  }

  if (typeof body.message === 'string') {
    const parsed = parseWireMessage(body.message)
    if ('error' in parsed) {
      return { status: 403, body: { ok: false, message: body.message, reason: parsed.error } }
    }
    const enq = spool.appendOneEgress(parsed)
    if (!enq.ok) return { status: 403, body: { ok: false, reason: enq.reason } }
    return { status: 201, body: { ok: true, message: body.message } }
  }

  return { status: 400, body: { ok: false, reason: 'expected envelope, text+lang, or message' } }
}

function handlePutInbox(
  spool: Spool,
  body: Record<string, unknown>,
): { status: number; body: unknown } {
  let envelope: MeshEnvelopeV1 | null = null

  if (isMeshEnvelopeV1(body.envelope)) {
    envelope = body.envelope
  } else if (typeof body.message === 'string') {
    const parsed = parseWireMessage(body.message)
    if ('error' in parsed) {
      return { status: 403, body: { ok: false, reason: parsed.error } }
    }
    envelope = parsed
  } else if (isMeshEnvelopeV1(body)) {
    envelope = body
  }

  if (!envelope) {
    return { status: 400, body: { ok: false, reason: 'expected envelope or message' } }
  }

  const append = spool.appendOneIngress(envelope)
  if (!append.ok) {
    return { status: 403, body: { ok: false, reason: append.reason } }
  }
  const status = append.duplicate ? 200 : 201
  return { status, body: { ok: true, id: append.id, duplicate: append.duplicate } }
}