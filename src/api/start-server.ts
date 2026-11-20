import { loadSpoolConfig } from '../config.js'
import { startSpoolServer } from './server.js'

startSpoolServer({ config: loadSpoolConfig() })