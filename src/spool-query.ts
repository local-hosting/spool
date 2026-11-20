import type { IngressWalRecord } from './types/envelope.js'
import type { MeshEnvelopeV1 } from './types/envelope.js'
import type { ProcessedEvent } from './types/events.js'
import type {
  SpoolFindEgressQuery,
  SpoolFindIngressQuery,
  SpoolFindProcessedQuery,
  SpoolPageParams,
  SpoolPaginated,
  SpoolRemoveIngressQuery,
} from './types/spool-query.js'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 500

export function normalizePage(params?: SpoolPageParams): { limit: number; skip: number } {
  const limitRaw = params?.$limit ?? DEFAULT_LIMIT
  const skipRaw = params?.$skip ?? 0
  const limit = Math.min(MAX_LIMIT, Math.max(0, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT))
  const skip = Math.max(0, Number.isFinite(skipRaw) ? skipRaw : 0)
  return { limit, skip }
}

function matchString(value: string, filter?: string | { $in: string[] }): boolean {
  if (filter === undefined) return true
  if (typeof filter === 'string') return value === filter
  return filter.$in.includes(value)
}

export function filterIngressRecords(
  records: IngressWalRecord[],
  query: SpoolFindIngressQuery | SpoolRemoveIngressQuery,
  ingressProcessed: string[],
): IngressWalRecord[] {
  const processedSet = new Set(ingressProcessed)
  return records.filter((record) => {
    const env = record.envelope
    if (query.ingress_id !== undefined) {
      const id = typeof query.ingress_id === 'string' ? query.ingress_id : query.ingress_id.$in
      if (typeof id === 'string') {
        if (record.id !== id) return false
      } else if (!id.includes(record.id)) {
        return false
      }
    }
    if (!matchString(env.peer, query.peer)) return false
    if (!matchString(env.bearerId, query.bearerId)) return false
    if (query.pending === true && processedSet.has(record.id)) return false
    if (query.processed === true && !processedSet.has(record.id)) return false
    return true
  })
}

export function paginate<T>(items: T[], params?: SpoolPageParams): SpoolPaginated<T> {
  const { limit, skip } = normalizePage(params)
  const total = items.length
  const data = items.slice(skip, skip + limit)
  return { total, limit, skip, data }
}

export function findIngressPage(
  records: IngressWalRecord[],
  query: SpoolFindIngressQuery,
  ingressProcessed: string[],
): SpoolPaginated<IngressWalRecord> {
  const filtered = filterIngressRecords(records, query, ingressProcessed)
  return paginate(filtered, query)
}

export function findEgressPage(
  egress: MeshEnvelopeV1[],
  query: SpoolFindEgressQuery,
): SpoolPaginated<MeshEnvelopeV1 & { _index: number }> {
  const filtered = egress
    .map((envelope, _index) => ({ ...envelope, _index }))
    .filter((row) => matchString(row.peer, query.peer) && matchString(row.bearerId, query.bearerId))
  return paginate(filtered, query)
}

export function findProcessedPage(
  events: ProcessedEvent[],
  query: SpoolFindProcessedQuery,
): SpoolPaginated<ProcessedEvent> {
  const filtered = events.filter((event) => {
    if (query.kind !== undefined) {
      if (typeof query.kind === 'string') {
        if (event.kind !== query.kind) return false
      } else if (!query.kind.$in.includes(event.kind)) {
        return false
      }
    }
    if (query.ingress_id !== undefined) {
      const id =
        typeof query.ingress_id === 'string' ? query.ingress_id : query.ingress_id.$in
      if (typeof id === 'string') {
        if (event.ingress_id !== id) return false
      } else if (!id.includes(event.ingress_id)) {
        return false
      }
    }
    if (!matchString(event.envelope.peer, query.peer)) return false
    if (!matchString(event.envelope.bearerId, query.bearerId)) return false
    return true
  })
  return paginate(filtered, query)
}