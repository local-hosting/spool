# `@local-hosting/spool`

Edge **spool** for mesh traffic: one facility for **ingress** (inbound frames) and **egress** (outbound frames). One WAL can mix **LoRa** (`lora`) and **Bluetooth mesh** (`bluetooth`) envelopes from different `peer` ids; dedupe is per sender + payload. No HTTP required — library + file WAL.

## Flow

```text
enqueueText / appendOneEgress  →  egress queue  →  removeOneEgress  →  radio
radio / peer                   →  appendOneIngress  →  processIngress  →  expand (compose/frames)
```

- **Prepare:** `@local-hosting/compose/thin` + `@local-hosting/frames/link` (`thinPrepare`).
- **Receive:** `decodePackedBytes` + `expandWithStore`.
- **Persist:** pluggable **`SpoolStore`** — `jsonl` (default), `sqlite` (`spool.db`), `rocksdb` (`data/rocksdb/`), or `memory` (ephemeral/tests). CRUD: `appendOne*` / `removeOne*` / `removeMany*` / `removeAll*` / `getOne` / `getMany` / `getAll`, plus Feathers-shaped **`find*`** with `$limit` / `$skip` on ingress, egress, and processed events.

## Usage

```ts
import { Spool } from '@local-hosting/spool'

const spool = new Spool({
  dataDir: '/var/spool',
  storage: 'sqlite', // or 'jsonl' (default); or inject `store: mySpoolStore`
  defaultPackId: 'resilience',
  defaultBearerId: 'lora',
})

const lora = spool.enqueueText({
  text: 'We need lodging for three families tonight',
  lang: 'en',
  bearerId: 'lora',
  peer: 'lora-gw-1',
})
const ble = spool.enqueueText({
  text: 'Are you home yet?',
  lang: 'en',
  bearerId: 'bluetooth',
  peer: 'ble-mesh-2',
})
if (!lora.ok || !ble.ok) throw new Error('prepare failed')

for (const wire of [spool.removeOneEgress(), spool.removeOneEgress()]) {
  if (!wire) continue
  spool.appendOneIngress(wire)
}
const events = spool.processIngress()
```

## CLI

```bash
yarn workspace @local-hosting/spool spool status
yarn workspace @local-hosting/spool spool egress send --text "We need milk" --lang en
yarn workspace @local-hosting/spool spool egress pop
yarn workspace @local-hosting/spool spool ingress append --message '<wire-json>'
yarn workspace @local-hosting/spool spool ingress process --max 32
```

## HTTP (optional)

Default `http://127.0.0.1:8093`. Paths are **configurable** (`SpoolServiceConfig.httpPaths`); defaults match lantern:

| Route (default) | Role |
|-----------------|------|
| `GET /api/info` | `peer`, queue depth |
| `GET/PUT/POST /api/outbox` | egress (PUT: `{ text, lang }`, `{ envelope }`, or `{ message }` wire JSON) |
| `GET/PUT /api/inbox` | ingress append |
| `POST /api/inbox/process` | decode + expand batch |

Embed on Express/Feathers: import `handleSpoolRoutes` and a shared `Spool`. Use **`SpoolHttpRouteOptions`** so mounts work either way:

| Mount style | Options |
|-------------|---------|
| App strips prefix (`app.use('/spool', …)` sees `/api/outbox`) | `resolveSpoolHttpPaths({ pathPrefix: '/spool' })` or defaults |
| Host forwards full path (`/spool/api/outbox`) | `{ mountPrefix: '/spool' }` on `handleSpoolRoutes`, `createSpoolServer({ httpRoute })`, or `withSpoolHttpRouteOptions(config, route)` |

Env: `SPOOL_HTTP_PATH_PREFIX`, `SPOOL_HTTP_MOUNT_PREFIX`, or per-route `SPOOL_HTTP_OUTBOX`, etc. (`resolveSpoolHttpRouteOptions` / `loadSpoolHttpRouteOptionsFromEnv`).

```bash
SPOOL_DATA_DIR=./data yarn workspace @local-hosting/spool start
# or: yarn workspace @local-hosting/spool spool serve
```

Env: `SPOOL_DATA_DIR`, `SPOOL_STORAGE` (`jsonl` | `sqlite` | `rocksdb` | `memory`), `SPOOL_PORT` (8093), `SPOOL_BIND_HOST`, `SPOOL_API_KEY`, `SPOOL_DEFAULT_BEARER` (default `lora`; override per send with `bluetooth`, etc.).

**Peer id (this spool node, default egress stamp)** — spool does not parse DIDs; it only stores an opaque string:

1. `SPOOL_PEER` when set (your DID or any label)
2. Else `actor` from `profile.yml` / `session.yml` under the peer data home (`~/.local-peer` by default, or `LOCAL_PEER_DATA_HOME` / `SPOOL_PEER_DATA_HOME`)
3. Else `install-id` or `installId` from that home
4. Else random 12-hex (first run only; then persisted in `state.json`)

## Commands

```bash
yarn workspace @local-hosting/spool ci
```

Depends on `@local-hosting/compose`, `@local-hosting/frames`, `@local-hosting/vocab` (workspace).