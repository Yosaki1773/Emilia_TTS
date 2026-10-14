<template>
  <div v-if="visible" class="studio-overlay" @click.self="$emit('close')">
    <div class="studio-window">
      <!-- 顶部导航栏 -->
      <Header
        :tts-connected="ttsConnected"
        :has-llm-key="Boolean(settings.llm.apiKey)"
        :ref-count="settings.references.length"
        @check-tts="verifyTTS"
        @open-llm-config="showLlmModal = true"
        @open-mapping="showMappingModal = true"
        @open-tts-config="showTtsConfigModal = true"
        @open-logs="showLogModal = true"
        @open-history="showTaskHistoryModal = true"
        @close="$emit('close')"
      />

      <!-- 主工作区 -->
      <main class="studio-main">
        <!-- 步骤 1: 文本提取 -->
        <TextExtractor
          :xml-tag="settings.xmlTag"
          @extracted="handleExtractedDialogues"
        />

        <!-- 步骤 2: 对白列表与批量合成 -->
        <DialogueList
          :dialogues="dialogues"
          :references="settings.references"
          :llm-config="settings.llm"
          :tts-config="settings.tts"
          :synthesizing="synthesizing"
          :full-text="fullText"
          @start-synthesize="handleStartBatchSynthesize"
          @clear="dialogues = []"
        />
      </main>

      <!-- 弹窗组件 -->
      <LlmConfigModal
        :visible="showLlmModal"
        :config="settings.llm"
        @close="showLlmModal = false"
        @save="saveLlmConfig"
      />

      <MappingManager
        :visible="showMappingModal"
        :references="settings.references"
        @close="showMappingModal = false"
        @save="saveReferences"
      />

      <TTSConfigModal
        :visible="showTtsConfigModal"
        :config="settings.tts"
        @close="showTtsConfigModal = false"
        @save="saveTtsConfig"
      />

      <LogViewerModal
        :visible="showLogModal"
        @close="showLogModal = false"
      />

      <TaskHistoryModal
        :visible="showTaskHistoryModal"
        :config="settings.tts"
        @close="showTaskHistoryModal = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import Header from './Header.vue'
import TextExtractor from './TextExtractor.vue'
import DialogueList from './DialogueList.vue'
import LlmConfigModal from './LlmConfigModal.vue'
import MappingManager from './MappingManager.vue'
import TTSConfigModal from './TTSConfigModal.vue'
import LogViewerModal from './LogViewerModal.vue'
import TaskHistoryModal from './TaskHistoryModal.vue'

import type { AudioReference, DialogueItem, LLMConfig, PluginSettings, TTSConfig } from '../types'
import { checkTTSHealth, synthesizeBatchedDialogues, getAudioFileUrl } from '../services/tts'
import { createStudioTask, updateStudioTask } from '../services/studioTasks'
import { concatenateAudioUrls } from '../services/audioMerger'
import { addLog } from '../services/logger'
import { loadPluginSettings, savePluginSettings } from '../services/storage'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const settings = reactive<PluginSettings>(loadPluginSettings())

const ttsConnected = ref(false)
const synthesizing = ref(false)

const showLlmModal = ref(false)
const showMappingModal = ref(false)
const showTtsConfigModal = ref(false)
const showLogModal = ref(false)
const showTaskHistoryModal = ref(false)

const dialogues = ref<DialogueItem[]>([])
const fullText = ref('')

onMounted(() => {
  verifyTTS()
})

async function verifyTTS() {
  const health = await checkTTSHealth(settings.tts.baseUrl)
  ttsConnected.value = health.ok
  if (health.ok) {
    addLog('success', 'TTS', 'TTS 服务连接正常', { url: settings.tts.baseUrl })
  } else {
    addLog('warn', 'TTS', `TTS 服务未就绪: ${health.message}`, { url: settings.tts.baseUrl })
  }
}

function saveLlmConfig(cfg: LLMConfig) {
  Object.assign(settings.llm, cfg)
  settings.customPrompt = cfg.customPrompt || ''
  savePluginSettings(settings)
  addLog('info', 'SYS', '已保存 LLM 服务配置')
}

function saveReferences(refs: AudioReference[]) {
  settings.references = refs
  savePluginSettings(settings)
  addLog('info', 'SYS', `已保存参考音频库配置 (共 ${refs.length} 条)`)
}

function saveTtsConfig(cfg: TTSConfig) {
  Object.assign(settings.tts, cfg)
  savePluginSettings(settings)
  verifyTTS()
  addLog('info', 'SYS', '已保存 TTS 语音合成参数')
}

function handleExtractedDialogues(items: DialogueItem[], raw?: string) {
  dialogues.value = items
  if (raw) {
    fullText.value = raw
  }
}

// 批量合成请求处理核心
async function handleStartBatchSynthesize(existingTaskId?: string) {
  const targetItems = dialogues.value.filter(d => d.text && d.matched_audio_id)
  if (targetItems.length === 0) {
    alert('请先为对话分配参考音频后再发起合成！')
    return
  }

  synthesizing.value = true
  const ttsStartedAt = performance.now()
  let taskId = existingTaskId

  try {
    if (!taskId) {
      try {
        const task = await createStudioTask(settings.tts, targetItems, { source: 'tts-only' })
        taskId = task.task_id
      } catch (err) {
        console.warn('创建工作台任务记录失败，将直接调用合成:', err)
      }
    }

    targetItems.forEach(d => {
      d.status = 'synthesizing'
      d.error_message = null
    })

    const res = await synthesizeBatchedDialogues(
      targetItems,
      settings.references,
      settings.tts,
      taskId
    )

    if (!res.filenames || res.filenames.length !== targetItems.length) {
      throw new Error(`返回文件数量 (${res.filenames?.length || 0}) 与请求数量 (${targetItems.length}) 不一致`)
    }

    targetItems.forEach((d, i) => {
      d.status = 'done'
      d.output_filename = res.filenames[i]
      d.audio_url = getAudioFileUrl(settings.tts.baseUrl, res.filenames[i])
    })

    // 检查是否有拆分的句子分组需要通过 Web Audio API 拼接
    const groupMap = new Map<string, DialogueItem[]>()
    targetItems.forEach(item => {
      if (item.groupId) {
        if (!groupMap.has(item.groupId)) groupMap.set(item.groupId, [])
        groupMap.get(item.groupId)!.push(item)
      }
    })

    const mergeStartedAt = performance.now()
    if (groupMap.size > 0) {
      for (const [groupId, items] of groupMap.entries()) {
        const urls = items.map(it => it.audio_url).filter(Boolean) as string[]
        if (urls.length === items.length && urls.length > 1) {
          try {
            const mergedUrl = await concatenateAudioUrls(urls, 0.2)
            items.forEach(it => {
              it.mergedAudioUrl = mergedUrl
            })
          } catch (mergeErr: any) {
            console.warn(`拼接句子音频组 ${groupId} 失败:`, mergeErr)
          }
        }
      }
    }

    if (taskId) {
      await updateStudioTask(settings.tts, taskId, {
        tts_status: 'succeeded',
        tts_request_ms: (res as any).studio_tts_request_ms,
        merge_ms: performance.now() - mergeStartedAt,
        total_ms: performance.now() - ttsStartedAt,
        status: 'succeeded',
        items: targetItems.map(item => ({
          text: item.text,
          inferred_emotion: item.inferred_emotion,
          reason: item.reason,
          matched_audio_id: item.matched_audio_id,
          speed: item.speed,
          groupId: item.groupId,
          partIndex: item.partIndex,
          totalParts: item.totalParts,
          audio_status: 'done',
          output_filename: item.output_filename,
          audio_url: item.audio_url,
          merged_audio_url: item.mergedAudioUrl
        }))
      }).catch(() => {})
    }

    alert(`🎉 恭喜！批量合成成功生成了 ${res.filenames.length} 个音频文件！${groupMap.size > 0 ? '（已自动完成多段台词的自然停顿拼接）' : ''}`)
  } catch (err: any) {
    targetItems.forEach(d => {
      d.status = 'failed'
      d.error_message = err.message
    })

    if (taskId) {
      await updateStudioTask(settings.tts, taskId, {
        tts_status: 'failed',
        status: 'failed',
        tts_request_ms: performance.now() - ttsStartedAt,
        error_message: err.message,
        items: targetItems.map(() => ({ audio_status: 'failed', error_message: err.message }))
      }).catch(() => {})
    }
    alert(`❌ 批量合成失败: ${err.message}`)
  } finally {
    synthesizing.value = false
    verifyTTS()
  }
}
</script>

<style scoped>
/* Scoped styles for the StudioApp window */
</style>
