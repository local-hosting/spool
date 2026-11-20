import { mkdirSync } from 'node:fs'

export function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
}