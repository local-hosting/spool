export type SpoolHttpPaths = {
  root: string
  health: string
  info: string
  outbox: string
  inbox: string
  inboxProcess: string
  ingressProcess: string
}

/** Lantern-shaped defaults (standalone spool on :8093). */
export const DEFAULT_SPOOL_HTTP_PATHS: SpoolHttpPaths = {
  root: '/',
  health: '/health',
  info: '/api/info',
  outbox: '/api/outbox',
  inbox: '/api/inbox',
  inboxProcess: '/api/inbox/process',
  ingressProcess: '/api/ingress/process',
}

export type SpoolHttpPathOverrides = Partial<SpoolHttpPaths>

export type ResolveSpoolHttpPathsInput = {
  /** Prepended to default segment paths, e.g. `/lantern` → `/lantern/api/outbox`. */
  pathPrefix?: string
  paths?: SpoolHttpPathOverrides
}

/**
 * HTTP routing for standalone serve or mount in Express/Feathers/reverse proxies.
 *
 * - **`pathPrefix`** — bake a public prefix into every `httpPaths` entry (what clients call).
 * - **`mountPrefix`** — strip from incoming `url.pathname` before matching `httpPaths`
 *   (host forwards full path; paths stay default `/api/...`).
 */
export type SpoolHttpRouteOptions = {
  pathPrefix?: string
  mountPrefix?: string
  paths?: SpoolHttpPathOverrides
}

export type ResolvedSpoolHttpRouteOptions = {
  httpPaths: SpoolHttpPaths
  httpMountPrefix?: string
}

export function normalizeHttpPath(pathname: string): string {
  if (!pathname) return '/'
  let path = pathname.trim()
  if (!path.startsWith('/')) path = `/${path}`
  path = path.replace(/\/{2,}/g, '/')
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path
}

function joinPathPrefix(prefix: string | undefined, segment: string): string {
  const normalizedSegment = normalizeHttpPath(segment)
  const p = prefix?.trim() ? normalizeHttpPath(prefix) : ''
  if (!p) return normalizedSegment
  if (normalizedSegment === '/') return p
  return normalizeHttpPath(`${p}${normalizedSegment}`)
}

export function resolveSpoolHttpPaths(input: ResolveSpoolHttpPathsInput = {}): SpoolHttpPaths {
  const base = { ...DEFAULT_SPOOL_HTTP_PATHS }
  const prefix = input.pathPrefix?.trim()

  const resolved: SpoolHttpPaths = {
    root: joinPathPrefix(prefix, base.root),
    health: joinPathPrefix(prefix, base.health),
    info: joinPathPrefix(prefix, base.info),
    outbox: joinPathPrefix(prefix, base.outbox),
    inbox: joinPathPrefix(prefix, base.inbox),
    inboxProcess: joinPathPrefix(prefix, base.inboxProcess),
    ingressProcess: joinPathPrefix(prefix, base.ingressProcess),
  }

  const overrides = input.paths
  if (!overrides) return resolved

  const keys = Object.keys(resolved) as (keyof SpoolHttpPaths)[]
  for (const key of keys) {
    const override = overrides[key]
    if (override?.trim()) {
      resolved[key] = normalizeHttpPath(override)
    }
  }
  return resolved
}

/**
 * When a host mounts spool under a prefix but forwards the full pathname, strip before matching.
 * When the host already strips the mount (Express `app.use('/spool', …)`), leave unset and set
 * `httpPaths` to the paths the handler actually sees.
 */
export function spoolRequestPathname(pathname: string, mountPrefix?: string): string {
  const path = normalizeHttpPath(pathname)
  const mount = mountPrefix?.trim() ? normalizeHttpPath(mountPrefix) : ''
  if (!mount || mount === '/') return path
  if (path === mount) return '/'
  if (!path.startsWith(`${mount}/`)) return path
  return normalizeHttpPath(path.slice(mount.length) || '/')
}

function envHttpPathOverrides(env: NodeJS.ProcessEnv): SpoolHttpPathOverrides {
  const path = (key: string): string | undefined => {
    const v = env[key]?.trim()
    return v || undefined
  }
  return {
    root: path('SPOOL_HTTP_ROOT'),
    health: path('SPOOL_HTTP_HEALTH'),
    info: path('SPOOL_HTTP_INFO'),
    outbox: path('SPOOL_HTTP_OUTBOX'),
    inbox: path('SPOOL_HTTP_INBOX'),
    inboxProcess: path('SPOOL_HTTP_INBOX_PROCESS'),
    ingressProcess: path('SPOOL_HTTP_INGRESS_PROCESS'),
  }
}

function envRouteOptions(env: NodeJS.ProcessEnv): SpoolHttpRouteOptions {
  const path = (key: string): string | undefined => {
    const v = env[key]?.trim()
    return v || undefined
  }
  return {
    pathPrefix: path('SPOOL_HTTP_PATH_PREFIX'),
    mountPrefix: path('SPOOL_HTTP_MOUNT_PREFIX'),
    paths: envHttpPathOverrides(env),
  }
}

export function resolveSpoolHttpRouteOptions(
  input: SpoolHttpRouteOptions = {},
): ResolvedSpoolHttpRouteOptions {
  const mount = input.mountPrefix?.trim()
  return {
    httpPaths: resolveSpoolHttpPaths({
      pathPrefix: input.pathPrefix,
      paths: input.paths,
    }),
    httpMountPrefix: mount ? normalizeHttpPath(mount) : undefined,
  }
}

/** Merge route options onto an existing service config (for embed mounts). */
export function applySpoolHttpRouteOptions(
  config: { httpPaths: SpoolHttpPaths; httpMountPrefix?: string },
  route: SpoolHttpRouteOptions,
): { httpPaths: SpoolHttpPaths; httpMountPrefix?: string } {
  const resolved = resolveSpoolHttpRouteOptions(route)
  return {
    httpPaths: resolved.httpPaths,
    httpMountPrefix:
      route.mountPrefix !== undefined ? resolved.httpMountPrefix : config.httpMountPrefix,
  }
}

export function loadSpoolHttpRouteOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedSpoolHttpRouteOptions {
  return resolveSpoolHttpRouteOptions(envRouteOptions(env))
}

export function loadSpoolHttpPathsFromEnv(env: NodeJS.ProcessEnv = process.env): SpoolHttpPaths {
  return loadSpoolHttpRouteOptionsFromEnv(env).httpPaths
}