import { createApp, ref } from 'vue'
import StudioApp from './components/StudioApp.vue'
import './styles.css'
import { createScriptIdDiv, teleportStyle } from '@util/script'
import type { DialogueItem, PluginSettings } from './types'
import { loadPluginSettings, savePluginSettings } from './services/storage'
import { extractDialogues, extractXmlTagContent } from './services/dialogueExtractor'
import { matchDialogueEmotionsWithLLM } from './services/llm'
import { checkTTSHealth, getAudioFileUrl, synthesizeBatchedDialogues } from './services/tts'
import { concatenateAudioUrls } from './services/audioMerger'
import { addLog, logs } from './services/logger'
import { normalizeLlmSpeed } from './config'

const studioVisible = ref(false)
let appMounted = false
let studioContainer: JQuery<HTMLDivElement> | null = null
let runningAutoTask = false

let settings: PluginSettings = loadPluginSettings()

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] as string))
}

export function openStudio() {
  ensureStudioMounted()
  studioVisible.value = true
  addLog('info', 'SYS', '打开 Emilia TTS 工作台界面')
}

export function closeStudio() {
  studioVisible.value = false
}

export function toggleStudio() {
  if (studioVisible.value) {
    closeStudio()
  } else {
    openStudio()
  }
}

function ensureStudioMounted() {
  if (appMounted && studioContainer) return

  studioContainer = createScriptIdDiv()
    .attr('id', 'emilia-tts-studio-mount')
    .appendTo('body')

  const app = createApp(StudioApp, {
    visible: studioVisible,
    onClose: closeStudio
  })

  app.mount(studioContainer[0])
  appMounted = true
}

/**
 * 在酒馆消息气泡中注入音频播放按钮
 */
function insertAudioButton(messageId: number, source: string, url: string, key: string) {
  const $message = retrieveDisplayedMessage(messageId)
  if (!$message.length) return
  if ($message.find(`[data-emilia-tts="${key}"]`).length) return

  const root = $message[0]
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null

  while ((node = walker.nextNode())) {
    if ((node.nodeValue || '').includes(source)) {
      const el = document.createElement('button')
      el.dataset.emiliaTts = key
      el.type = 'button'
      el.className = 'emilia-tts-chat-btn'
      el.innerHTML = '<span>🔊 播放</span>'
      el.title = '播放 Emilia TTS 语音'
      el.onclick = () => {
        const audio = new Audio(url)
        el.classList.add('playing')
        audio.onended = () => el.classList.remove('playing')
        audio.onerror = () => el.classList.remove('playing')
        void audio.play()
      }
      ;(node.parentNode as Node).insertBefore(el, node.nextSibling)
      return
    }
  }

  // 兜底插入到消息末尾
  const $btn = $(
    `<button type="button" class="emilia-tts-chat-btn" data-emilia-tts="${key}"><span>🔊 播放</span></button>`
  )
  $btn.on('click', function () {
    const audio = new Audio(url)
    $(this).addClass('playing')
    audio.onended = () => $(this).removeClass('playing')
    audio.onerror = () => $(this).removeClass('playing')
    void audio.play()
  })
  $message.append($btn)
}

/**
 * 监听酒馆新消息事件，进行自动解析与合成
 */
export async function processMessage(messageId: number) {
  settings = loadPluginSettings()
  if (runningAutoTask || !settings.auto) return

  const msgs = getChatMessages(messageId)
  const msg = msgs && msgs.length > 0 ? msgs[0] : null
  if (!msg || !msg.message) return

  const rawText = String(msg.message)
  let targetText = ''

  if (settings.xmlTag) {
    targetText = extractXmlTagContent(rawText, settings.xmlTag)
  }
  if (!targetText) {
    targetText = rawText
  }

  const dialogues = extractDialogues(targetText)
  if (dialogues.length === 0) return

  runningAutoTask = true
  addLog('info', 'SYS', `检测到第 ${messageId} 楼消息含待合成对白 (${dialogues.length} 句)，开始后台处理...`)

  try {
    const results = await matchDialogueEmotionsWithLLM(
      dialogues,
      settings.references,
      settings.llm,
      rawText
    )

    const finalDialogues: DialogueItem[] = []
    let currentGlobalIndex = 1

    dialogues.forEach(originalItem => {
      const matchedParts = results.filter(r => r.index === originalItem.index)
      if (matchedParts.length > 1) {
        const groupId = `group_${Date.now()}_${originalItem.index}`
        matchedParts.forEach((part, partIdx) => {
          finalDialogues.push({
            id: `dialogue_${Date.now()}_${currentGlobalIndex}`,
            index: currentGlobalIndex++,
            speaker: originalItem.speaker,
            original_text: part.original_part_text || originalItem.original_text,
            text: part.ja_text || '',
            context: originalItem.context,
            matched_audio_id: part.matched_audio_id,
            speed: normalizeLlmSpeed(part.speed),
            inferred_emotion: part.inferred_emotion,
            reason: part.reason,
            status: 'idle',
            groupId,
            partIndex: partIdx + 1,
            totalParts: matchedParts.length
          })
        })
      } else if (matchedParts.length === 1) {
        const match = matchedParts[0]
        finalDialogues.push({
          ...originalItem,
          index: currentGlobalIndex++,
          original_text: originalItem.original_text,
          text: match.ja_text || originalItem.text,
          matched_audio_id: match.matched_audio_id,
          speed: normalizeLlmSpeed(match.speed),
          inferred_emotion: match.inferred_emotion,
          reason: match.reason
        })
      }
    })

    const synthRes = await synthesizeBatchedDialogues(
      finalDialogues,
      settings.references,
      settings.tts
    )

    finalDialogues.forEach((d, i) => {
      d.output_filename = synthRes.filenames[i]
      d.audio_url = getAudioFileUrl(settings.tts.baseUrl, synthRes.filenames[i])
    })

    // 检查是否有拆分多句的分组音频，若有则拼接整句
    const groupMap = new Map<string, DialogueItem[]>()
    finalDialogues.forEach(item => {
      if (item.groupId) {
        if (!groupMap.has(item.groupId)) groupMap.set(item.groupId, [])
        groupMap.get(item.groupId)!.push(item)
      }
    })

    for (const [groupId, items] of groupMap.entries()) {
      const urls = items.map(it => it.audio_url).filter(Boolean) as string[]
      if (urls.length === items.length && urls.length > 1) {
        try {
          const mergedUrl = await concatenateAudioUrls(urls, 0.2)
          items.forEach(it => { it.mergedAudioUrl = mergedUrl })
        } catch (e) {
          console.warn('音频拼接失败:', e)
        }
      }
    }

    // 注入播放按钮到当前消息气泡
    finalDialogues.forEach((d, i) => {
      const playUrl = (d.mergedAudioUrl && d.partIndex === 1) ? d.mergedAudioUrl : (d.audio_url || '')
      if (playUrl) {
        insertAudioButton(messageId, d.original_text, playUrl, `emilia_${messageId}_${i}`)
      }
    })

    addLog('success', 'SYS', `第 ${messageId} 楼对白合成并注入播放按钮成功！`)
  } catch (err: any) {
    addLog('error', 'SYS', `处理第 ${messageId} 楼消息合成失败: ${err.message}`)
  } finally {
    runningAutoTask = false
  }
}

// 插件初始化
$(() => {
  // 注册酒馆按钮
  appendInexistentScriptButtons([
    {
      name: '打开 Emilia TTS Studio',
      visible: true
    }
  ])

  eventOn(getButtonEvent('打开 Emilia TTS Studio'), toggleStudio)

  // 监听新消息到达事件
  eventOn(tavern_events.MESSAGE_RECEIVED, (id: number) => {
    void processMessage(id)
  })

  // 导出全局 API
  const api = {
    openStudio,
    closeStudio,
    toggleStudio,
    processMessage,
    get settings() {
      return loadPluginSettings()
    },
    saveSettings: (newSettings: PluginSettings) => {
      savePluginSettings(newSettings)
    },
    checkTTSHealth: () => checkTTSHealth(loadPluginSettings().tts.baseUrl),
    get logs() {
      return logs.value
    }
  }

  ;(globalThis as any).EmiliaTTS = api
  ;(window as any).EmiliaTTS = api

  addLog('success', 'SYS', 'Emilia TTS Studio 插件初始化就绪')
})
