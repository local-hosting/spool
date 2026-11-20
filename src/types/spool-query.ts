import type { IngressWalRecord } from './envelope.js'
import type { MeshEnvelopeV1 } from './envelope.js'
import type { ProcessedEvent } from './events.js'

/** Feathers-shaped list params (`$limit` / `$skip`). */
export type SpoolPageParams = {
  $limit?: number
  $skip?: number
}

export type SpoolFindIngressQuery = SpoolPageParams & {
  ingress_id?: string | { $in: string[] }
  peer?: string | { $in: string[] }
  bearerId?: string | { $in: string[] }
  /** Not yet in `ingress_processed` (default: unset = all). */
  pending?: boolean
  /** Already processed (default: unset = all). */
  processed?: boolean
}

export type SpoolFindEgressQuery = SpoolPageParams & {
  peer?: string | { $in: string[] }
  bearerId?: string | { $in: string[] }
}

export type SpoolFindProcessedQuery = SpoolPageParams & {
  kind?: 'frame' | 'reject' | { $in: ('frame' | 'reject')[] }
  ingress_id?: string | { $in: string[] }
  peer?: string | { $in: string[] }
  bearerId?: string | { $in: string[] }
}

export type SpoolPaginated<T> = {
  total: number
  limit: number
  skip: number
  data: T[]
}

export type SpoolFindIngressResult = SpoolPaginated<IngressWalRecord>
export type SpoolFindEgressResult = SpoolPaginated<MeshEnvelopeV1 & { _index: number }>
export type SpoolFindProcessedResult = SpoolPaginated<ProcessedEvent>

export type SpoolRemoveIngressQuery = Pick<
  SpoolFindIngressQuery,
  'ingress_id' | 'peer' | 'bearerId' | 'pending' | 'processed'
>