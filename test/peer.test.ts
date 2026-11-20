import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Spool } from '../src/spool.js'
import {
  readPeerInstallId,
  readSessionActorDid,
  resolveInitialSpoolPeer,
  resolvePeerDataHome,
} from '../src/peer.js'

const SAMPLE_INSTALL = 'a1b2c3d4-e5f6-4f89-a012-3456789abcde'
const SAMPLE_DID = 'did:user:z6MkhaXgBZDvotDkL5257faiztiGiC2QtXK5BQAkb48Dac'

describe('resolveInitialSpoolPeer', () => {
  let peerHome: string

  afterEach(() => {
    if (peerHome) rmSync(peerHome, { recursive: true, force: true })
  })

  it('prefers explicit peer', () => {
    const out = resolveInitialSpoolPeer({ explicitPeer: SAMPLE_DID })
    expect(out).toEqual({ peer: SAMPLE_DID, source: 'explicit' })
  })

  it('uses session actor did before install id', () => {
    peerHome = mkdtempSync(join(tmpdir(), 'peer-home-'))
    writeFileSync(
      join(peerHome, 'profile.yml'),
      `actor: ${SAMPLE_DID}\ninstallId: ${SAMPLE_INSTALL}\n`,
      'utf8',
    )
    const out = resolveInitialSpoolPeer({
      env: { SPOOL_PEER_DATA_HOME: peerHome },
    })
    expect(out.source).toBe('session_actor')
    expect(out.peer).toBe(SAMPLE_DID)
  })

  it('uses legacy install-id file when no actor', () => {
    peerHome = mkdtempSync(join(tmpdir(), 'peer-home-'))
    writeFileSync(join(peerHome, 'install-id'), `${SAMPLE_INSTALL}\n`, 'utf8')
    const out = resolveInitialSpoolPeer({
      env: { SPOOL_PEER_DATA_HOME: peerHome },
    })
    expect(out).toEqual({ peer: SAMPLE_INSTALL, source: 'install_id' })
  })

  it('falls back to random hex when nothing is configured', () => {
    peerHome = mkdtempSync(join(tmpdir(), 'peer-home-'))
    mkdirSync(peerHome, { recursive: true })
    const out = resolveInitialSpoolPeer({
      env: { SPOOL_PEER_DATA_HOME: peerHome },
    })
    expect(out.source).toBe('random')
    expect(out.peer).toMatch(/^[0-9a-f]{12}$/)
  })

  it('resolvePeerDataHome honors LOCAL_PEER_DATA_HOME', () => {
    expect(resolvePeerDataHome({ LOCAL_PEER_DATA_HOME: '/tmp/local-peer-data' })).toBe(
      '/tmp/local-peer-data',
    )
  })
})

describe('Spool peer bootstrap', () => {
  let dataDir: string
  let peerHome: string

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
    if (peerHome) rmSync(peerHome, { recursive: true, force: true })
  })

  it('first open picks install id from peer data home', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'spool-peer-'))
    peerHome = mkdtempSync(join(tmpdir(), 'peer-home-'))
    writeFileSync(join(peerHome, 'install-id'), `${SAMPLE_INSTALL}\n`, 'utf8')

    const prevHome = process.env.SPOOL_PEER_DATA_HOME
    process.env.SPOOL_PEER_DATA_HOME = peerHome
    try {
      const spool = new Spool({
        dataDir,
        defaultBearerId: 'lora',
      })
      expect(spool.peer).toBe(SAMPLE_INSTALL)
      expect(spool.peerSource).toBe('install_id')
    } finally {
      if (prevHome === undefined) delete process.env.SPOOL_PEER_DATA_HOME
      else process.env.SPOOL_PEER_DATA_HOME = prevHome
    }
  })

  it('readSessionActorDid and readPeerInstallId', () => {
    peerHome = mkdtempSync(join(tmpdir(), 'peer-home-'))
    writeFileSync(join(peerHome, 'profile.yml'), `actor: "${SAMPLE_DID}"\n`, 'utf8')
    expect(readSessionActorDid(peerHome)).toBe(SAMPLE_DID)
    expect(readPeerInstallId(peerHome)).toBeUndefined()
  })
})