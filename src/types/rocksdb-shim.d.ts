declare module 'rocksdb' {
  type RocksDb = {
    open: (
      options: { createIfMissing?: boolean; errorIfExists?: boolean },
      callback: (err?: Error) => void,
    ) => void
    close: (callback: (err?: Error) => void) => void
    get: (key: string, callback: (err: Error | undefined, value?: string) => void) => void
    put: (key: string, value: string, callback: (err?: Error) => void) => void
  }

  export default function rocksdb(location: string): RocksDb
}