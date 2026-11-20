#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createSpool, loadSpoolConfig } from '../config.js'
import { envelopeToWireMessage, parseWireMessage } from '../api/envelope-wire.js'
import type { SupportedLanguage } from '@local-hosting/compose'
import { startSpoolServer } from '../api/server.js'

function usage(): never {
  console.error(`Usage:
  spool status
  spool egress list
  spool egress pop [--json]
  spool egress send --text <msg> --lang <code> [--bearer <id>]
  spool ingress append --file <path> | --message <json-wire>
  spool ingress process [--max <n>]
  spool serve

Env: SPOOL_DATA_DIR, SPOOL_PORT, SPOOL_DEFAULT_BEARER, ...`)
  process.exit(1)
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1 || i + 1 >= args.length) return undefined
  return args[i + 1]
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) usage()

  const cmd = args[0]
  const sub = args[1]

  if (cmd === 'serve') {
    startSpoolServer()
    return
  }

  const spool = createSpool()

  if (cmd === 'status') {
    console.log(
      JSON.stringify(
        {
          peer: spool.peer,
          depth: spool.depth(),
          default_pack: spool.defaultPackId,
          default_bearer: spool.defaultBearerId,
        },
        null,
        2,
      ),
    )
    return
  }

  if (cmd === 'egress') {
    if (sub === 'list') {
      console.log(JSON.stringify(spool.getAllEgress(), null, 2))
      return
    }
    if (sub === 'pop') {
      const next = spool.removeOneEgress()
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify(next))
      } else if (next) {
        console.log(envelopeToWireMessage(next))
      }
      return
    }
    if (sub === 'send') {
      const text = flag(args, '--text')
      const lang = flag(args, '--lang') as SupportedLanguage | undefined
      const bearerId = flag(args, '--bearer')
      if (!text || !lang) usage()
      const enq = spool.enqueueText({ text, lang, bearerId })
      if (!enq.ok) {
        console.error(enq.reason)
        process.exit(1)
      }
      console.log(envelopeToWireMessage(enq.envelope))
      return
    }
    usage()
  }

  if (cmd === 'ingress') {
    if (sub === 'append') {
      const file = flag(args, '--file')
      const message = flag(args, '--message')
      let wire: string
      if (file) {
        wire = readFileSync(file, 'utf8').trim()
      } else if (message) {
        wire = message
      } else if (!process.stdin.isTTY) {
        wire = await readStdin()
      } else {
        usage()
      }
      const parsed = parseWireMessage(wire)
      if ('error' in parsed) {
        console.error(parsed.error)
        process.exit(1)
      }
      const append = spool.appendOneIngress(parsed)
      if (!append.ok) {
        console.error(append.reason)
        process.exit(1)
      }
      console.log(JSON.stringify(append))
      return
    }
    if (sub === 'process') {
      const maxRaw = flag(args, '--max')
      const max = maxRaw ? Number(maxRaw) : 32
      const events = spool.processIngress(Number.isFinite(max) ? max : 32)
      console.log(JSON.stringify({ count: events.length, events }, null, 2))
      return
    }
    usage()
  }

  usage()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})