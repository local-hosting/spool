import { createRequire } from 'node:module'

const { loopUntil, waitForCallback, waitForGet, waitForPut } = createRequire(
  import.meta.url,
)('./sync-wait.cjs') as {
  loopUntil: (predicate: () => boolean) => void
  waitForCallback: (run: (done: (err?: Error) => void) => void) => void
  waitForGet: (
    db: {
      get: (
        key: string,
        callback: (err: Error & { notFound?: boolean }, value?: string) => void,
      ) => void
    },
    key: string,
  ) => string | undefined
  waitForPut: (
    db: { put: (key: string, value: string, callback: (err?: Error) => void) => void },
    key: string,
    value: string,
  ) => void
}

export { loopUntil, waitForCallback, waitForGet, waitForPut }