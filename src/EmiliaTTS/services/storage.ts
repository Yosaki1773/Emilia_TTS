import type { AudioReference, LLMConfig, PluginSettings, TTSConfig } from '../types'
import { DEFAULT_LLM_SPEED } from '../config'
import mappingData from '../mapping.json'

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  baseUrl: 'http://127.0.0.1:9880',
  top_k: 15,
  top_p: 1.0,
  temperature: 1.0,
  repetition_penalty: 1.35,
  noise_scale: 0.5,
  speed: DEFAULT_LLM_SPEED,
  is_cut_text: true,
  cut_minlen: 10,
  cut_mute: 0.3,
  return_subtitles: false
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  apiUrl: 'http://127.0.0.1:1234/v1',
  apiKey: '',
  model: 'local-model',
  temperature: 0.3,
  customPrompt: ''
}

export const DEFAULT_SETTINGS: PluginSettings = {
  tts: { ...DEFAULT_TTS_CONFIG },
  llm: { ...DEFAULT_LLM_CONFIG },
  xmlTag: 'tts',
  auto: true,
  references: (mappingData as AudioReference[]) || [],
  customPrompt: ''
}

const VAR_TYPE = { type: 'script' as const }
const STORAGE_KEY = 'emilia_tts_plugin_settings'

export function loadPluginSettings(): PluginSettings {
  let saved: any = null

  // 尝试从酒馆变量加载
  try {
    if (typeof getVariables === 'function') {
      const vars = getVariables(VAR_TYPE)
      if (vars && vars.emilia_tts_settings) {
        saved = vars.emilia_tts_settings
      }
    }
  } catch (e) {
    // ignore
  }

  // 尝试从 localStorage 加载
  if (!saved) {
    try {
      const local = localStorage.getItem(STORAGE_KEY)
      if (local) {
        saved = JSON.parse(local)
      }
    } catch (e) {
      // ignore
    }
  }

  if (!saved) {
    return {
      ...DEFAULT_SETTINGS,
      references: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.references))
    }
  }

  // 兼容扁平结构与嵌套结构
  const tts: TTSConfig = {
    ...DEFAULT_TTS_CONFIG,
    ...(saved.tts || {}),
    baseUrl: saved.tts?.baseUrl || saved.ttsBaseUrl || DEFAULT_TTS_CONFIG.baseUrl,
    speed: saved.tts?.speed ?? saved.speed ?? DEFAULT_TTS_CONFIG.speed
  }

  const llm: LLMConfig = {
    ...DEFAULT_LLM_CONFIG,
    ...(saved.llm || {}),
    apiUrl: saved.llm?.apiUrl || saved.llmApiUrl || DEFAULT_LLM_CONFIG.apiUrl,
    apiKey: saved.llm?.apiKey ?? saved.llmApiKey ?? DEFAULT_LLM_CONFIG.apiKey,
    model: saved.llm?.model || saved.llmModel || DEFAULT_LLM_CONFIG.model,
    temperature: saved.llm?.temperature ?? saved.temperature ?? DEFAULT_LLM_CONFIG.temperature,
    customPrompt: saved.llm?.customPrompt ?? saved.customPrompt ?? ''
  }

  const references: AudioReference[] = Array.isArray(saved.references) && saved.references.length > 0
    ? saved.references
    : JSON.parse(JSON.stringify(DEFAULT_SETTINGS.references))

  return {
    tts,
    llm,
    xmlTag: saved.xmlTag || 'tts',
    auto: saved.auto ?? true,
    references,
    customPrompt: llm.customPrompt || ''
  }
}

export function savePluginSettings(settings: PluginSettings): void {
  // 保存到 localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    // ignore
  }

  // 保存到酒馆变量
  try {
    if (typeof replaceVariables === 'function' && typeof getVariables === 'function') {
      const current = getVariables(VAR_TYPE) || {}
      replaceVariables({ ...current, emilia_tts_settings: settings }, VAR_TYPE)
    }
  } catch (e) {
    // ignore
  }
}
