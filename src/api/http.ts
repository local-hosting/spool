import type http from 'node:http'

export function writeJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export async function readJsonBody(req: http.IncomingMessage, maxBytes = 1_048_576): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      throw new Error('body too large')
    }
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) as unknown
}

export type BindHost = '127.0.0.1' | '0.0.0.0'

export function assertAllowedBindHost(host: string): asserts host is BindHost {
  if (host !== '127.0.0.1' && host !== '0.0.0.0') {
    throw new Error('bind host must be 127.0.0.1 or 0.0.0.0')
  }
}

export function readBearerToken(req: http.IncomingMessage): string | undefined {
  const header = req.headers.authorization?.trim()
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || undefined
}

export function isAuthorized(req: http.IncomingMessage, apiKey: string | undefined): boolean {
  if (!apiKey?.trim()) return true
  return readBearerToken(req) === apiKey.trim()
}