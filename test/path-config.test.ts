import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPOOL_HTTP_PATHS,
  applySpoolHttpRouteOptions,
  loadSpoolHttpRouteOptionsFromEnv,
  normalizeHttpPath,
  resolveSpoolHttpPaths,
  resolveSpoolHttpRouteOptions,
  spoolRequestPathname,
} from '../src/api/path-config.js'

describe('resolveSpoolHttpPaths', () => {
  it('defaults to lantern paths', () => {
    expect(resolveSpoolHttpPaths()).toEqual(DEFAULT_SPOOL_HTTP_PATHS)
  })

  it('applies path prefix', () => {
    expect(resolveSpoolHttpPaths({ pathPrefix: '/lantern' })).toMatchObject({
      outbox: '/lantern/api/outbox',
      inboxProcess: '/lantern/api/inbox/process',
    })
  })

  it('allows full path overrides', () => {
    const paths = resolveSpoolHttpPaths({
      paths: { outbox: '/mesh/egress', inbox: '/mesh/ingress' },
    })
    expect(paths.outbox).toBe('/mesh/egress')
    expect(paths.inbox).toBe('/mesh/ingress')
    expect(paths.info).toBe('/api/info')
  })
})

describe('normalizeHttpPath', () => {
  it('collapses slashes and trims trailing slash', () => {
    expect(normalizeHttpPath('//api//outbox/')).toBe('/api/outbox')
    expect(normalizeHttpPath('api/outbox')).toBe('/api/outbox')
  })
})

describe('spoolRequestPathname', () => {
  it('strips mount prefix before route match', () => {
    expect(spoolRequestPathname('/lantern/api/outbox', '/lantern')).toBe('/api/outbox')
  })

  it('maps mount-only path to root', () => {
    expect(spoolRequestPathname('/lantern', '/lantern')).toBe('/')
  })

  it('leaves path unchanged when it does not start with mount', () => {
    expect(spoolRequestPathname('/api/outbox', '/lantern')).toBe('/api/outbox')
  })
})

describe('applySpoolHttpRouteOptions', () => {
  it('overrides paths but keeps existing mount when route omits mountPrefix', () => {
    const base = {
      httpPaths: DEFAULT_SPOOL_HTTP_PATHS,
      httpMountPrefix: '/gateway',
    }
    const next = applySpoolHttpRouteOptions(base, { pathPrefix: '/hub' })
    expect(next.httpPaths.outbox).toBe('/hub/api/outbox')
    expect(next.httpMountPrefix).toBe('/gateway')
  })

  it('clears mount when route sets mountPrefix empty', () => {
    const base = {
      httpPaths: DEFAULT_SPOOL_HTTP_PATHS,
      httpMountPrefix: '/gateway',
    }
    const next = applySpoolHttpRouteOptions(base, { mountPrefix: '' })
    expect(next.httpMountPrefix).toBeUndefined()
  })
})

describe('resolveSpoolHttpRouteOptions', () => {
  it('combines path prefix and mount strip', () => {
    const route = resolveSpoolHttpRouteOptions({
      pathPrefix: '/hub',
      mountPrefix: '/gateway',
    })
    expect(route.httpPaths.outbox).toBe('/hub/api/outbox')
    expect(route.httpMountPrefix).toBe('/gateway')
  })

  it('loads mount from env', () => {
    const route = loadSpoolHttpRouteOptionsFromEnv({
      SPOOL_HTTP_MOUNT_PREFIX: '/spool',
      SPOOL_HTTP_PATH_PREFIX: '/spool',
    })
    expect(route.httpMountPrefix).toBe('/spool')
    expect(route.httpPaths.inbox).toBe('/spool/api/inbox')
  })
})