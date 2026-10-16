import { createApp, ref } from 'vue'
import StudioApp from './components/StudioApp.vue'
import './styles.css'
import { createScriptIdDiv } from '@util/script'
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

// 自动任务状态机：使用时间戳实现真正的超时 watchdog，避免 LLM/TTS 卡死后永久阻塞
type AutoTaskState = {
  running: boolean
  startedAt: number
  lastMessageId: number
}
const AUTO_TASK_TIMEOUT_MS = 90_000 // 90 秒无进展自动释放锁
let autoTask: AutoTaskState = { running: false, startedAt: 0, lastMessageId: -1 }

function acquireAutoTask(messageId: number): boolean {
  // 清理陈旧锁：超时或同一消息重复触发直接放行
  const now = Date.now()
  if (autoTask.running) {
    if (now - autoTask.startedAt > AUTO_TASK_TIMEOUT_MS) {
      addLog('warn', 'SYS', `自动合成任务超过 ${Math.round(AUTO_TASK_TIMEOUT_MS / 1000)}s 未完成，已强制释放`)
      autoTask = { running: false, startedAt: 0, lastMessageId: -1 }
    } else if (autoTask.lastMessageId === messageId) {
      // 同一消息在任务进行中重复触发，跳过
      return false
    }
  }
  autoTask = { running: true, startedAt: now, lastMessageId: messageId }
  return true
}

function releaseAutoTask() {
  autoTask = { running: false, startedAt: 0, lastMessageId: -1 }
}

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

  // 防御：若酒馆页面尚未加载 body 完毕，则延后挂载
  if (!document.body) {
    addLog('warn', 'SYS', 'document.body 尚未就绪，500ms 后重试挂载')
    setTimeout(ensureStudioMounted, 500)
    return
  }

  try {
    studioContainer = createScriptIdDiv()
      .attr('id', 'emilia-tts-studio-mount')
      .appendTo('body')
  } catch (e: any) {
    addLog('error', 'SYS', `创建 Studio 容器失败: ${e?.message || e}`)
    return
  }

  const app = createApp(StudioApp, {
    visible: studioVisible,
    onClose: closeStudio
  })

  // 集中捕获组件错误，避免单点异常破坏整个挂载
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[Emilia TTS Studio] Vue error:', err, info)
  }

  try {
    app.mount(studioContainer[0])
    appMounted = true
    addLog('success', 'SYS', 'Emilia TTS Studio 组件已成功挂载到 body')
  } catch (e: any) {
    addLog('error', 'SYS', `Studio 挂载失败: ${e?.message || e}`)
  }
}

/**
 * 在酒馆消息气泡中注入音频播放按钮
 *
 * 重要：source 是用于定位插入位置的「锚点文本」，通常传整段 context。
 * 同一锚点（normalized 后相同）在本条消息中只会插入一次。
 */
function insertAudioButton(messageId: number, source: string, url: string, key: string) {
  const $message = retrieveDisplayedMessage(messageId)
  if (!$message.length) return
  if ($message.find(`[data-emilia-tts="${key}"]`).length) return

  // 同一消息气泡内已经使用过的锚点缓存（避免多段插入时按钮堆叠）
  const $root = $message[0]
  const cache = (($root as any).__emiliaInsertedAnchors as Set<string>) ||
    (($root as any).__emiliaInsertedAnchors = new Set<string>())

  const root = $message[0]
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  const sourceNormalized = (source || '').replace(/\s+/g, ' ').trim()

  if (source && !cache.has(sourceNormalized)) {
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
        cache.add(sourceNormalized)
        return
      }
    }
  }

  // 兜底插入到消息末尾（仅当该 key 还没插入过）
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
  if (!settings.auto) return
  if (!acquireAutoTask(messageId)) return

  let msg: any = null
  try {
    const msgs = getChatMessages(messageId)
    msg = msgs && msgs.length > 0 ? msgs[0] : null
  } catch (e: any) {
    addLog('error', 'SYS', `读取酒馆消息 #${messageId} 失败: ${e?.message || e}`)
    releaseAutoTask()
    return
  }

  if (!msg || !msg.message) {
    releaseAutoTask()
    return
  }

  const rawText = String(msg.message)
  let targetText = ''

  if (settings.xmlTag) {
    try {
      targetText = extractXmlTagContent(rawText, settings.xmlTag)
    } catch (e: any) {
      addLog('warn', 'EXTRACT', `提取 <${settings.xmlTag}> 标签内容失败，将使用原始文本: ${e?.message || e}`)
      targetText = ''
    }
  }
  if (!targetText) {
    targetText = rawText
  }

  const dialogues = extractDialogues(targetText)
  if (dialogues.length === 0) {
    releaseAutoTask()
    return
  }

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
        const totalParts = matchedParts.length

        // 关键修复：按 part_index 升序排序，避免 LLM 乱序输出导致拼接错位
        const sortedParts = [...matchedParts].sort((a, b) => {
          const ai = a.part_index ?? 0
          const bi = b.part_index ?? 0
          return ai - bi
        })

        // 若 LLM 没有为每个分段单独返回 original_part_text（很常见），
        // 把整句原文只赋给 part_index = 1，其余分段填空字符串，
        // 避免“同一句中文重复填入每个分段”导致展示与提示词污染。
        const hasAnyPartText = sortedParts.some(p => Boolean(p.original_part_text))
        if (!hasAnyPartText) {
          addLog('warn', 'LLM', `第 ${originalItem.index} 句被拆分为 ${totalParts} 段，但 LLM 未返回 original_part_text；将保留整句原文于第 1 段。`)
        }

        sortedParts.forEach((part, partIdx) => {
          const isFirstPart = partIdx === 0
          const partOriginalText = part.original_part_text
            ? part.original_part_text
            : (isFirstPart ? (originalItem.original_text || originalItem.text) : '')

          finalDialogues.push({
            id: `dialogue_${Date.now()}_${currentGlobalIndex}`,
            index: currentGlobalIndex++,
            sourceIndex: originalItem.index,
            speaker: originalItem.speaker,
            original_text: partOriginalText,
            text: part.ja_text || '',
            context: originalItem.context,
            matched_audio_id: part.matched_audio_id,
            speed: normalizeLlmSpeed(part.speed),
            inferred_emotion: part.inferred_emotion,
            reason: part.reason || `[第${partIdx + 1}/${totalParts}段]`,
            status: 'idle',
            groupId,
            partIndex: partIdx + 1,
            totalParts
          })
        })
      } else if (matchedParts.length === 1) {
        const match = matchedParts[0]
        finalDialogues.push({
          ...originalItem,
          index: currentGlobalIndex++,
          sourceIndex: originalItem.index,
          original_text: originalItem.original_text || originalItem.text,
          text: match.ja_text || originalItem.text,
          matched_audio_id: match.matched_audio_id,
          speed: normalizeLlmSpeed(match.speed),
          inferred_emotion: match.inferred_emotion,
          reason: match.reason
        })
      } else {
        // 极端情况：LLM 完全没为该 index 输出结果 —— 保留原文作为待手动分配的草稿
        addLog('warn', 'LLM', `LLM 未为对白 #${originalItem.index} 返回任何结果，将作为待手动分配的草稿条目。`)
        finalDialogues.push({ ...originalItem, index: currentGlobalIndex++, sourceIndex: originalItem.index })
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
    // 优先用整句原文（context）作为锚点文本，确保能在酒馆消息 DOM 中找到；
    // 找不到时降级到 original_text；最后才尝试 single part text。
    //
    // 注意：合并后的 finalDialogues.index 已重新编号，必须用 sourceIndex 回查原始对白，
    // 否则有拆分时索引会错位（例如句A的第2段会误取句B的 context）。
    finalDialogues.forEach((d, i) => {
      const playUrl = (d.mergedAudioUrl && d.partIndex === 1) ? d.mergedAudioUrl : (d.audio_url || '')
      if (!playUrl) return

      const originalItem = dialogues.find(src => src.index === (d.sourceIndex ?? d.index))
      const anchorCandidates: string[] = []
      if (originalItem?.context && originalItem.context.length >= 4) {
        anchorCandidates.push(originalItem.context)
      }
      if (d.original_text && d.original_text.length >= 4) {
        anchorCandidates.push(d.original_text)
      }
      if (d.text && !anchorCandidates.includes(d.text) && d.text.length >= 4) {
        anchorCandidates.push(d.text)
      }

      // 取第一个能在 DOM 中找到的候选锚点
      let inserted = false
      for (const source of anchorCandidates) {
        const before = document.querySelectorAll(`[data-emilia-tts="emilia_${messageId}_${i}"]`).length
        insertAudioButton(messageId, source, playUrl, `emilia_${messageId}_${i}`)
        const after = document.querySelectorAll(`[data-emilia-tts="emilia_${messageId}_${i}"]`).length
        if (after > before) {
          inserted = true
          break
        }
      }
      if (!inserted) {
        addLog('warn', 'SYS', `第 ${i + 1} 句无法定位到酒馆消息 DOM 锚点，已跳过注入播放按钮`)
      }
    })

    addLog('success', 'SYS', `第 ${messageId} 楼对白合成并注入播放按钮成功！`)
  } catch (err: any) {
    addLog('error', 'SYS', `处理第 ${messageId} 楼消息合成失败: ${err.message}`)
  } finally {
    releaseAutoTask()
  }
}

// 插件初始化
$(() => {
  try {
    // 1) 注册酒馆按钮（若名称已存在则不会重复添加）
    appendInexistentScriptButtons([
      {
        name: '打开 Emilia TTS Studio',
        visible: true
      }
    ])
  } catch (btnErr: any) {
    console.error('[Emilia TTS] 注册脚本按钮失败:', btnErr)
  }

  // 2) 绑定按钮事件：使用 try-catch 包裹避免 listener 抛错导致事件失效
  const buttonEvent = (() => {
    try {
      return getButtonEvent('打开 Emilia TTS Studio')
    } catch (e) {
      console.error('[Emilia TTS] getButtonEvent 调用失败:', e)
      return null
    }
  })()

  if (buttonEvent) {
    eventOn(buttonEvent, () => {
      try {
        toggleStudio()
      } catch (err) {
        console.error('[Emilia TTS] toggleStudio 抛出错误:', err)
      }
    })
  } else {
    console.warn('[Emilia TTS] 无法绑定酒馆按钮事件，请使用 window.EmiliaTTS.openStudio() 手动打开')
  }

  // 3) 注册 SlashCommand（备用方案：即便按钮注册失败，斜杠命令也能打开）
  try {
    const sc = (window as any).SillyTavern?.slashCommands || (window as any).slash_commands
    if (sc && typeof sc.add === 'function') {
      sc.add('emilia-tts', '打开 Emilia TTS Studio 工作台（与脚本按钮功能一致）', [], () => {
        toggleStudio()
        return ''
      })
      addLog('info', 'SYS', '已注册斜杠命令 /emilia-tts 作为备用入口')
    }
  } catch (scErr) {
    console.warn('[Emilia TTS] 注册斜杠命令失败（不影响主功能）:', scErr)
  }

  // 4) 监听新消息到达事件
  eventOn(tavern_events.MESSAGE_RECEIVED, (id: number) => {
    void processMessage(id)
  })

  // 5) 监听聊天切换：重置自动任务锁，防止上一聊天失败导致锁死
  try {
    eventOn(tavern_events.CHAT_CHANGED, () => {
      if (autoTask.running) {
        addLog('warn', 'SYS', '检测到聊天切换，重置进行中的自动合成任务状态')
        releaseAutoTask()
      }
    })
  } catch (e) {
    // 忽略
  }

  // 6) 定期 watchdog：兜底防止 autoTask 长时间卡死
  setInterval(() => {
    if (autoTask.running) {
      const elapsed = Date.now() - autoTask.startedAt
      if (elapsed > AUTO_TASK_TIMEOUT_MS) {
        addLog('warn', 'SYS', `自动合成任务超时 (${Math.round(elapsed / 1000)}s)，强制释放锁`)
        releaseAutoTask()
      }
    }
  }, 30_000)

  // 7) 导出全局 API —— 供酒馆脚本、SlashCommand、浏览器控制台等任意渠道直接调用
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
    },
    get runningAutoTask() {
      return autoTask.running
    }
  }

  ;(globalThis as any).EmiliaTTS = api
  ;(window as any).EmiliaTTS = api

  addLog('success', 'SYS', 'Emilia TTS Studio 插件初始化就绪')
})
