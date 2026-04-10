// ============================================================
// TrocoJá — Logger estruturado
//
// Desenvolvimento: console colorido com [INFO]/[WARN]/[ERROR]
// Produção:        JSON estruturado { level, message, timestamp, ...context }
// ============================================================

type LogLevel = 'info' | 'warn' | 'error'

interface LogContext {
  applicationId?: string
  userId?: string
  phone?: string
  [key: string]: unknown
}

const IS_PROD = process.env.NODE_ENV === 'production'

function log(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString()

  if (IS_PROD) {
    // JSON estruturado para ingestão por ferramentas de observabilidade (Datadog, Axiom, etc.)
    const entry = { level, message, timestamp, ...context }
    if (level === 'error') {
      console.error(JSON.stringify(entry))
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
    return
  }

  // Desenvolvimento: saída colorida e legível
  const colors: Record<LogLevel, string> = {
    info:  '\x1b[36m', // cyan
    warn:  '\x1b[33m', // yellow
    error: '\x1b[31m', // red
  }
  const reset = '\x1b[0m'
  const label = `${colors[level]}[${level.toUpperCase()}]${reset}`
  const time  = `\x1b[90m${timestamp}${reset}`
  const ctx   = context ? ` ${JSON.stringify(context)}` : ''

  if (level === 'error') {
    console.error(`${time} ${label} ${message}${ctx}`)
  } else if (level === 'warn') {
    console.warn(`${time} ${label} ${message}${ctx}`)
  } else {
    console.log(`${time} ${label} ${message}${ctx}`)
  }
}

export const logger = {
  info:  (message: string, context?: LogContext) => log('info',  message, context),
  warn:  (message: string, context?: LogContext) => log('warn',  message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
}
