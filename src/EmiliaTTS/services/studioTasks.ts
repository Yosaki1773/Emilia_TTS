import type { DialogueItem, StudioTask, TTSConfig } from '../types'

function endpoint(config: TTSConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, '')}${path}`
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`工作台任务接口失败 (${response.status}): ${detail || response.statusText}`)
  }
  return response.json() as Promise<T>
}

export function createStudioTask(
  config: TTSConfig,
  items: DialogueItem[],
  summary: Record<string, unknown> = {}
): Promise<StudioTask> {
  const taskId = crypto.randomUUID()
  return requestJson<StudioTask>(endpoint(config, '/studio/tasks'), {
    method: 'POST',
    body: JSON.stringify({
      task_id: taskId,
      items: items.map(item => ({ ...item })),
      summary
    })
  })
}

export function updateStudioTask(
  config: TTSConfig,
  taskId: string,
  update: Record<string, unknown>
): Promise<StudioTask> {
  return requestJson<StudioTask>(endpoint(config, `/studio/tasks/${encodeURIComponent(taskId)}`), {
    method: 'PATCH',
    body: JSON.stringify(update)
  })
}

export async function listStudioTasks(
  config: TTSConfig,
  limit = 20,
  offset = 0
): Promise<{ items: StudioTask[]; limit: number; offset: number }> {
  return requestJson(endpoint(config, `/studio/tasks?limit=${limit}&offset=${offset}`))
}

export function getStudioTask(config: TTSConfig, taskId: string): Promise<StudioTask> {
  return requestJson<StudioTask>(endpoint(config, `/studio/tasks/${encodeURIComponent(taskId)}`))
}
