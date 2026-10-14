export interface AudioReference {
  id: string
  name: string
  audio_path: string
  prompt_text: string
  emotion: string
  description: string
  duration?: number // 参考音频时长（秒，浮点数）
}

export interface DialogueItem {
  id: string
  index: number
  speaker: string
  original_text: string
  text: string // 最终参与 TTS 合成的文本（轻小说日语文本）
  context?: string
  matched_audio_id: string | null
  speed: number // 语速倍率 0.7 - 1.3，默认 0.9
  inferred_emotion?: string
  reason?: string
  status: 'idle' | 'analyzing' | 'synthesizing' | 'done' | 'failed'
  audio_url?: string | null
  output_filename?: string | null
  error_message?: string | null
  // 分段拆分与拼接相关字段
  groupId?: string // 原始所属句子分组ID，同一原句拆分的子句拥有相同的 groupId
  partIndex?: number // 分段序号，从 1 开始
  totalParts?: number // 该句拆分出的总段数
  mergedAudioUrl?: string | null // 拼接后的完整长音频 URL（同一 group 的首行提供）
}

export interface LLMConfig {
  apiUrl: string
  apiKey: string
  model: string
  temperature: number
  customPrompt?: string // 用户自定义的翻译风格或选取要求
}

export interface TTSConfig {
  baseUrl: string
  top_k: number
  top_p: number
  temperature: number
  repetition_penalty: number
  noise_scale: number
  speed: number
  is_cut_text: boolean
  cut_minlen: number
  cut_mute: number
  return_subtitles: boolean
}

export interface LLMMatchResult {
  index: number // 对应原台词的 index
  part_index?: number // 若拆分为多段，从 1 开始的分段序号
  original_part_text?: string // 拆分后的局部中文片段（可选）
  ja_text: string
  matched_audio_id: string
  speed: number
  inferred_emotion: string
  reason: string
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success'

export interface LogItem {
  id: string
  timestamp: string
  level: LogLevel
  module: 'EXTRACT' | 'LLM' | 'TTS' | 'AUDIO' | 'SYS'
  message: string
  detail?: string
}

export interface StudioTaskItem {
  ordinal?: number
  dialogue_id?: string | null
  source_index?: number | null
  speaker?: string | null
  original_text?: string | null
  text?: string | null
  inferred_emotion?: string | null
  reason?: string | null
  matched_audio_id?: string | null
  speed?: number | null
  group_id?: string | null
  part_index?: number | null
  total_parts?: number | null
  llm_status?: string
  audio_status?: string
  output_filename?: string | null
  audio_url?: string | null
  merged_audio_url?: string | null
  error_message?: string | null
}

export interface StudioTask {
  task_id: string
  created_at: string
  updated_at: string
  status: string
  total_items: number
  llm_status: string
  llm_wait_ms: number | null
  tts_status: string
  tts_request_ms: number | null
  tts_inference_ms: number | null
  merge_ms: number | null
  total_ms: number | null
  error_message: string | null
  summary: Record<string, unknown>
  items?: StudioTaskItem[]
}

export interface PluginSettings {
  tts: TTSConfig
  llm: LLMConfig
  xmlTag: string
  auto: boolean
  references: AudioReference[]
  customPrompt: string
}
