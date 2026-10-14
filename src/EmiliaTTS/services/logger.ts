import { ref } from 'vue'
import type { LogItem, LogLevel } from '../types'

const MAX_LOGS = 500
export const logs = ref<LogItem[]>([])

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

export function addLog(
  level: LogLevel,
  module: LogItem['module'],
  message: string,
  detail?: any
) {
  let detailStr: string | undefined = undefined
  if (detail !== undefined) {
    if (typeof detail === 'string') {
      detailStr = detail
    } else {
      try {
        detailStr = JSON.stringify(detail, null, 2)
      } catch {
        detailStr = String(detail)
      }
    }
  }

  const item: LogItem = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: formatTime(new Date()),
    level,
    module,
    message,
    detail: detailStr
  }

  logs.value.unshift(item)
  if (logs.value.length > MAX_LOGS) {
    logs.value.pop()
  }

  const prefix = `[Emilia TTS Studio] [${item.timestamp}] [${item.module}]`
  if (level === 'error') {
    console.error(prefix, message, detail || '')
  } else if (level === 'warn') {
    console.warn(prefix, message, detail || '')
  } else {
    console.log(prefix, message, detail || '')
  }
}

export function clearLogs() {
  logs.value = []
}
