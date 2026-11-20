'use strict'

const deasync = require('deasync')

function loopUntil(predicate) {
  deasync.loopWhile(predicate)
}

function waitForCallback(run) {
  let finished = false
  let err
  run((error) => {
    err = error
    finished = true
  })
  loopUntil(() => !finished)
  if (err) throw err
}

function waitForGet(db, key) {
  let finished = false
  let err
  let value
  db.get(key, (error, val) => {
    if (
      error &&
      (error.notFound === true ||
        error.name === 'NotFoundError' ||
        error.name === 'NotFound' ||
        error.code === 'LEVEL_NOT_FOUND' ||
        (typeof error.message === 'string' && error.message.startsWith('NotFound')))
    ) {
      value = undefined
      finished = true
      return
    }
    err = error
    value = val
    finished = true
  })
  loopUntil(() => !finished)
  if (err) throw err
  if (value !== undefined && value !== null && typeof value !== 'string') {
    value = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
  }
  return value
}

function waitForPut(db, key, val) {
  waitForCallback((done) => db.put(key, val, done))
}

module.exports = { loopUntil, waitForCallback, waitForGet, waitForPut }