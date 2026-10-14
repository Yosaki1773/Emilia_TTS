import type { AudioReference, DialogueItem, TTSConfig } from '../types'
import { addLog } from './logger'

export interface TTSBatchResponse {
  success: boolean
  count: number
  filenames: string[]
  prompt_text_used: string | string[]
  subtitles?: any[]
}

/**
 * 检查 TTS 服务连通性
 */
export async function checkTTSHealth(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/`
    const res = await fetch(url)
    if (!res.ok) {
      return { ok: false, message: `服务响应异常: HTTP ${res.status}` }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, message: data.message || 'GSV-TTS 服务连接正常' }
  } catch (err: any) {
    return { ok: false, message: `无法连接到 TTS 服务: ${err.message}` }
  }
}

/**
 * 批量合成音频请求
 */
export async function synthesizeBatchedDialogues(
  dialogues: DialogueItem[],
  references: AudioReference[],
  config: TTSConfig,
  studioTaskId?: string
): Promise<TTSBatchResponse> {
  const refMap = new Map<string, AudioReference>()
  references.forEach(r => refMap.set(r.id, r))

  const validDialogues = dialogues.filter(d => d.text && d.matched_audio_id)
  if (validDialogues.length === 0) {
    throw new Error('没有已分配参考音频的对话待合成')
  }

  const texts: string[] = []
  const speaker_audios: string[] = []
  const prompt_audios: string[] = []
  const prompt_texts: string[] = []

  for (const item of validDialogues) {
    const ref = refMap.get(item.matched_audio_id!)
    if (!ref) {
      throw new Error(`找不到对话 #${item.index} 所匹配的参考音频编号 [${item.matched_audio_id}]`)
    }
    texts.push(item.text)
    speaker_audios.push(ref.audio_path)
    prompt_audios.push(ref.audio_path)
    prompt_texts.push(ref.prompt_text)
  }

  const speeds = validDialogues.map(d => d.speed ?? config.speed)
  const allSameSpeed = speeds.every(s => s === speeds[0])

  const requestBody: any = {
    texts,
    speaker_audio: speaker_audios,
    prompt_audio: prompt_audios,
    prompt_text: prompt_texts,
    is_cut_text: config.is_cut_text,
    cut_minlen: config.cut_minlen,
    cut_mute: config.cut_mute,
    return_subtitles: config.return_subtitles,
    top_k: config.top_k,
    top_p: config.top_p,
    temperature: config.temperature,
    repetition_penalty: config.repetition_penalty,
    noise_scale: config.noise_scale,
    speed: allSameSpeed ? speeds[0] : speeds
  }

  if (studioTaskId) {
    requestBody.studio_task_id = studioTaskId
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/tts/batched`
  addLog('info', 'TTS', `开始向 GSV-TTS 发起批量推理请求 (${validDialogues.length} 条)`, {
    endpoint,
    texts,
    speeds: requestBody.speed
  })

  let res: Response
  const requestStartedAt = performance.now()
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
  } catch (netErr: any) {
    addLog('error', 'TTS', `连接 GSV-TTS 失败: ${netErr.message}`, { endpoint })
    throw netErr
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    const msg = `TTS 批量推理请求失败 (${res.status}): ${errText || res.statusText}`
    addLog('error', 'TTS', msg, { status: res.status, errText })
    throw new Error(msg)
  }

  const result: TTSBatchResponse = await res.json()
  if (studioTaskId) {
    ;(result as any).studio_tts_request_ms = performance.now() - requestStartedAt
  }
  addLog('success', 'TTS', `GSV-TTS 批量推理成功，生成 ${result.filenames.length} 个文件`, result.filenames)
  return result
}

/**
 * 获取音频文件的完整访问 URL
 */
export function getAudioFileUrl(baseUrl: string, filename: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/audio/${encodeURIComponent(filename)}`
}
