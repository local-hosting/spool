import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Machine-wide override for peer identity files (profile / install-id). */
export const LOCAL_PEER_DATA_HOME_ENV = 'LOCAL_PEER_DATA_HOME'

export const DEFAULT_PEER_DATA_BASENAME = '.local-peer'

export const PEER_INSTALL_ID_FILE = 'install-id'

export const PEER_PROFILE_FILES = ['profile.yml', 'session.yml'] as const

const INSTALL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SpoolPeerSource = 'explicit' | 'session_actor' | 'install_id' | 'random'

export type ResolvedSpoolPeer = {
  peer: string
  source: SpoolPeerSource
}

export type ResolveSpoolPeerOptions = {
  /** Config or `SPOOL_PEER` — any opaque id (often a DID). */
  explicitPeer?: string
  env?: NodeJS.ProcessEnv
  homedir?: () => string
}

export function isValidInstallId(value: string): boolean {
  return INSTALL_ID_PATTERN.test(value.trim())
}

export function resolvePeerDataHome(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  const fromSpool = env.SPOOL_PEER_DATA_HOME?.trim()
  if (fromSpool) return fromSpool
  const fromSharedDir = env[LOCAL_PEER_DATA_HOME_ENV]?.trim()
  if (fromSharedDir) return fromSharedDir
  return path.join(home, DEFAULT_PEER_DATA_BASENAME)
}

function readScalarFromYamlText(text: string, field: string): string | undefined {
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(
      new RegExp(`^${field}:\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))\\s*(?:#.*)?$`),
    )
    if (!match) continue
    const value = (match[1] ?? match[2] ?? match[3])?.trim()
    return value || undefined
  }
  return undefined
}

function readScalarFromYamlFile(filePath: string, field: string): string | undefined {
  if (!existsSync(filePath)) return undefined
  try {
    const text = readFileSync(filePath, 'utf8')
    return readScalarFromYamlText(text, field)
  } catch {
    return undefined
  }
}

export function readSessionActorDid(dataHome: string): string | undefined {
  for (const name of PEER_PROFILE_FILES) {
    const actor = readScalarFromYamlFile(path.join(dataHome, name), 'actor')
    if (actor?.startsWith('did:')) return actor
  }
  return undefined
}

export function readPeerInstallId(dataHome: string): string | undefined {
  const legacy = path.join(dataHome, PEER_INSTALL_ID_FILE)
  if (existsSync(legacy)) {
    try {
      const trimmed = readFileSync(legacy, 'utf8').trim()
      if (isValidInstallId(trimmed)) return trimmed
    } catch {
      /* fall through */
    }
  }
  for (const name of PEER_PROFILE_FILES) {
    const installId = readScalarFromYamlFile(path.join(dataHome, name), 'installId')
    if (installId && isValidInstallId(installId)) return installId
  }
  return undefined
}

function randomSpoolPeer(): string {
  return randomBytes(6).toString('hex')
}

export function resolveInitialSpoolPeer(options: ResolveSpoolPeerOptions = {}): ResolvedSpoolPeer {
  const explicit = options.explicitPeer?.trim()
  if (explicit) {
    return { peer: explicit, source: 'explicit' }
  }

  const env = options.env ?? process.env
  const home = resolvePeerDataHome(env, options.homedir?.() ?? homedir())

  const actor = readSessionActorDid(home)
  if (actor) {
    return { peer: actor, source: 'session_actor' }
  }

  const installId = readPeerInstallId(home)
  if (installId) {
    return { peer: installId, source: 'install_id' }
  }

  return { peer: randomSpoolPeer(), source: 'random' }
}