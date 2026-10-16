<template>
  <section class="paper-card overflow-hidden">
    <div class="desk-header">
      <div class="header-left">
        <span class="step-badge">02</span>
        <div>
          <p class="editorial-label">Dialogue desk</p>
          <h2 class="card-title">
            对白列表与情感匹配
            <span class="count-tag">({{ dialogues.length }} 句)</span>
          </h2>
        </div>
      </div>

      <div class="header-actions">
        <button class="tool-button" @click="addRow">
          <Plus :size="15" /> 增加行
        </button>
        <button class="tool-button" :disabled="dialogues.length === 0" @click="$emit('clear')">
          <Trash2 :size="15" /> 清空
        </button>
        <button class="accent-button" :disabled="dialogues.length === 0 || matching" @click="handleLlmMatch">
          <Sparkles :size="15" /> {{ matching ? '分析中…' : 'LLM 分析与匹配' }}
        </button>
        <button
          class="tool-button"
          :class="{ active: showPromptQuickEdit }"
          title="调整自定义翻译风格与情感选取要求"
          @click="showPromptQuickEdit = !showPromptQuickEdit"
        >
          <PencilLine :size="15" /> 提示词
          <span v-if="llmConfig.customPrompt" class="prompt-dot">●</span>
        </button>
        <label class="auto-synth-label">
          <input v-model="autoSynthesize" type="checkbox" /> 匹配后自动合成
        </label>
        <button class="success-button" :disabled="!canSynthesize || synthesizing" @click="$emit('start-synthesize')">
          <AudioLines :size="15" /> {{ synthesizing ? '合成中…' : '批量合成' }}
        </button>
      </div>
    </div>

    <!-- 提示词快捷编辑区 -->
    <div v-if="showPromptQuickEdit" class="prompt-drawer">
      <div class="prompt-drawer-header">
        <label class="prompt-label">
          <Lightbulb :size="15" class="gold-icon" /> 自定义翻译与音频匹配提示词要求
        </label>
        <span class="prompt-hint">送入 LLM 的最高优先级附加偏好（角色口癖、语气停顿、特定称呼等）</span>
      </div>
      <textarea
        v-model="llmConfig.customPrompt"
        rows="3"
        class="field-control"
        placeholder="例如：&#10;- 爱蜜莉雅在慌张或害羞时，多加上「え、えっと……」「も、もう！」等结巴语气词；&#10;- 如果出现道歉情节，倾向于选择带有微哭腔/愧疚的参考音频；&#10;- 特殊专有名词：昴翻译为「スバル」，帕克翻译为「パック」等。"
      ></textarea>
    </div>

    <!-- 空列表展示 -->
    <div v-if="dialogues.length === 0" class="empty-state">
      <FileText :size="40" class="empty-icon" />
      <p>暂无待处理对白，请先在上方输入剧本文本并点击“提取对白”。</p>
    </div>

    <!-- 对白表格 -->
    <div v-else class="table-container">
      <table class="dialogue-table">
        <thead>
          <tr>
            <th style="width: 44px">#</th>
            <th style="width: 100px">角色</th>
            <th style="width: 220px">中文原文</th>
            <th style="width: 250px">日语台词 (TTS 输入)</th>
            <th style="width: 110px">情感</th>
            <th style="width: 210px">参考音频 (Mapping)</th>
            <th style="width: 80px">语速</th>
            <th style="width: 80px">状态</th>
            <th style="width: 220px">试听与下载</th>
            <th style="width: 50px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, idx) in dialogues"
            :key="item.id"
            :class="{
              'row-synthesizing': item.status === 'synthesizing',
              'row-done': item.status === 'done',
              'row-failed': item.status === 'failed'
            }"
          >
            <td class="text-center font-mono text-muted">{{ item.index }}</td>
            <td>
              <input v-model="item.speaker" class="field-control sm" placeholder="角色名" />
            </td>
            <td>
              <div class="line-clamp" :title="item.original_text || item.text">
                {{ item.original_text || item.text }}
              </div>
            </td>
            <td>
              <div class="ja-cell">
                <textarea
                  v-model="item.text"
                  rows="2"
                  class="field-control sm resize-y"
                  placeholder="翻译后的日语台词…"
                ></textarea>
                <span
                  v-if="item.original_text && item.text !== item.original_text"
                  class="ja-badge"
                  title="已翻译为日语"
                >JA</span>
              </div>
            </td>
            <td>
              <span v-if="item.inferred_emotion" class="emotion-badge" :title="item.reason">
                {{ item.inferred_emotion }}
                <Info v-if="item.reason" :size="11" />
              </span>
              <span v-else class="text-muted text-xs">待分析</span>
            </td>
            <td>
              <select v-model="item.matched_audio_id" class="field-control sm">
                <option :value="null">-- 请选择参考音频 --</option>
                <option v-for="ref in references" :key="ref.id" :value="ref.id">
                  [{{ ref.emotion }}] {{ ref.name }}{{ ref.duration ? ` (${ref.duration.toFixed(1)}s)` : '' }}
                </option>
              </select>
            </td>
            <td>
              <select
                :value="normalizeLlmSpeed(item.speed)"
                class="field-control sm speed-select"
                @change="item.speed = normalizeLlmSpeed(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="speed in LLM_SPEED_OPTIONS" :key="speed" :value="speed">
                  {{ speed.toFixed(1) }}x
                </option>
              </select>
            </td>
            <td>
              <span class="status-badge" :class="item.status">
                {{ formatStatus(item.status) }}
              </span>
            </td>
            <td>
              <div v-if="item.audio_url" class="audio-cell">
                <div class="audio-row">
                  <audio controls :src="item.audio_url" class="mini-player"></audio>
                  <button
                    class="icon-button"
                    title="下载本片段音频"
                    @click="downloadAudio(item.audio_url, item.output_filename || `audio_${item.index}.wav`)"
                  >
                    <Download :size="14" />
                  </button>
                </div>

                <!-- 若属于被 LLM 拆分的多段台词，且是第 1 段，显示拼接整句播放器 -->
                <div v-if="item.mergedAudioUrl && item.partIndex === 1" class="merged-box">
                  <span class="merged-label">拼接整句 · 自然停顿</span>
                  <div class="audio-row">
                    <audio controls :src="item.mergedAudioUrl" class="mini-player"></audio>
                    <button
                      class="icon-button success-icon"
                      title="下载拼接整句完整音频"
                      @click="downloadAudio(item.mergedAudioUrl, `merged_dialogue_${item.index}_${item.speaker}.wav`)"
                    >
                      <Download :size="14" />
                    </button>
                  </div>
                </div>
              </div>
              <span v-else-if="item.status === 'failed'" class="text-danger text-xs" :title="item.error_message || ''">
                合成失败
              </span>
              <span v-else class="text-muted text-xs">—</span>
            </td>
            <td>
              <button class="icon-button danger-icon" title="删除本条" @click="removeRow(idx)">
                <Trash2 :size="14" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 底部统计与批量下载 -->
    <div v-if="dialogues.length > 0" class="desk-footer">
      <div class="stat-counts">
        <span>已分配音频: <strong>{{ matchedCount }}</strong> / {{ dialogues.length }}</span>
        <span>已完成合成: <strong>{{ doneCount }}</strong> / {{ dialogues.length }}</span>
      </div>
      <button v-if="doneCount > 0" class="tool-button" @click="downloadAllGenerated">
        <Archive :size="15" /> 批量下载全部音频 ({{ doneCount }})
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Archive,
  AudioLines,
  Download,
  FileText,
  Info,
  Lightbulb,
  PencilLine,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-vue-next'
import type { AudioReference, DialogueItem, LLMConfig, TTSConfig } from '../types'
import { DEFAULT_LLM_SPEED, LLM_SPEED_OPTIONS, normalizeLlmSpeed } from '../config'
import { downloadAudioUrl } from '../services/audioMerger'
import { createStudioTask, updateStudioTask } from '../services/studioTasks'
import { matchDialogueEmotionsWithLLM } from '../services/llm'
import { addLog } from '../services/logger'

const props = defineProps<{
  dialogues: DialogueItem[]
  references: AudioReference[]
  llmConfig: LLMConfig
  ttsConfig: TTSConfig
  synthesizing: boolean
  fullText?: string
}>()

const emit = defineEmits<{
  (e: 'update:dialogues', items: DialogueItem[]): void
  (e: 'start-synthesize', taskId?: string): void
  (e: 'clear'): void
}>()

const matching = ref(false)
const showPromptQuickEdit = ref(false)
const autoSynthesize = ref(false)
const activeTaskId = ref<string | null>(null)

const matchedCount = computed(() => props.dialogues.filter(d => Boolean(d.matched_audio_id)).length)
const doneCount = computed(() => props.dialogues.filter(d => Boolean(d.audio_url)).length)
const canSynthesize = computed(() => props.dialogues.length > 0 && matchedCount.value > 0)

function formatStatus(status: DialogueItem['status']) {
  switch (status) {
    case 'idle': return '就绪'
    case 'analyzing': return '分析中'
    case 'synthesizing': return '合成中'
    case 'done': return '已完成'
    case 'failed': return '失败'
    default: return status
  }
}

function addRow() {
  const newIndex = props.dialogues.length + 1
  props.dialogues.push({
    id: `dialogue_${Date.now()}_${newIndex}`,
    index: newIndex,
    speaker: '爱蜜莉雅',
    original_text: '',
    text: '',
    matched_audio_id: null,
    speed: DEFAULT_LLM_SPEED,
    status: 'idle'
  })
}

function removeRow(idx: number) {
  props.dialogues.splice(idx, 1)
  props.dialogues.forEach((item, i) => {
    item.index = i + 1
  })
}

async function handleLlmMatch() {
  if (props.dialogues.length === 0) return
  if (props.references.length === 0) {
    alert('请先在参考音频库中配置可用的音频！')
    return
  }

  matching.value = true
  const sourceDialogues = props.dialogues
  const requestDialogues = sourceDialogues.map(item => ({ ...item }))
  const requestState = JSON.stringify(requestDialogues)
  const requestFullText = props.fullText
  const startedAt = performance.now()
  let taskId: string | null = null

  try {
    try {
      const task = await createStudioTask(props.ttsConfig, requestDialogues, {
        full_text: requestFullText || '',
        references: props.references.map(reference => ({ ...reference }))
      })
      taskId = task.task_id
      activeTaskId.value = taskId
    } catch (taskError) {
      console.warn('创建工作台任务记录失败，将继续执行分析:', taskError)
    }

    const results = await matchDialogueEmotionsWithLLM(
      requestDialogues,
      props.references,
      props.llmConfig,
      requestFullText
    )

    if (taskId) {
      await updateStudioTask(props.ttsConfig, taskId, {
        llm_status: 'succeeded',
        llm_wait_ms: performance.now() - startedAt,
        items: results.map(result => ({
          text: result.ja_text,
          inferred_emotion: result.inferred_emotion,
          reason: result.reason,
          matched_audio_id: result.matched_audio_id,
          speed: result.speed,
          llm_status: 'succeeded'
        }))
      }).catch(() => {})
    }

    if (
      props.dialogues !== sourceDialogues ||
      JSON.stringify(props.dialogues) !== requestState ||
      props.fullText !== requestFullText
    ) {
      alert('分析期间对白或上下文已变化，已丢弃本次结果。当前修改已保留，请重新分析。')
      return
    }

    const newDialogues: DialogueItem[] = []
    let currentGlobalIndex = 1

    requestDialogues.forEach(originalItem => {
      const matchedParts = results.filter(r => r.index === originalItem.index)
      if (matchedParts.length > 1) {
        const groupId = `group_${Date.now()}_${originalItem.index}`
        const totalParts = matchedParts.length
        // 按 part_index 升序，避免 LLM 乱序输出导致拼接错位
        const sortedParts = [...matchedParts].sort((a, b) => (a.part_index ?? 0) - (b.part_index ?? 0))
        // 若 LLM 未逐段返回 original_part_text，则整句原文只放在第 1 段
        const hasAnyPartText = sortedParts.some(p => Boolean(p.original_part_text))
        sortedParts.forEach((part, partIdx) => {
          const isFirstPart = partIdx === 0
          newDialogues.push({
            id: `dialogue_${Date.now()}_${currentGlobalIndex}`,
            index: currentGlobalIndex++,
            sourceIndex: originalItem.index,
            speaker: originalItem.speaker,
            original_text: part.original_part_text
              ? part.original_part_text
              : (isFirstPart ? (originalItem.original_text || originalItem.text) : ''),
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
        if (!hasAnyPartText) {
          addLog('warn', 'LLM', `第 ${originalItem.index} 句被拆分为 ${totalParts} 段，但 LLM 未返回 original_part_text；已保留整句原文于第 1 段。`)
        }
      } else if (matchedParts.length === 1) {
        const match = matchedParts[0]
        newDialogues.push({
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
        newDialogues.push({ ...originalItem, index: currentGlobalIndex++, sourceIndex: originalItem.index })
      }
    })

    props.dialogues.splice(0, props.dialogues.length, ...newDialogues)

    if (autoSynthesize.value) {
      const readyToSynth = props.dialogues.filter(d => d.text && d.matched_audio_id)
      if (readyToSynth.length > 0) {
        emit('start-synthesize', taskId || undefined)
      }
    } else {
      alert(`LLM 成功分析并完成了情绪与音频分配！共输出 ${newDialogues.length} 句合成台词。`)
    }
  } catch (err: any) {
    if (taskId) {
      await updateStudioTask(props.ttsConfig, taskId, {
        llm_status: 'failed',
        status: 'failed',
        llm_wait_ms: performance.now() - startedAt,
        error_message: err.message
      }).catch(() => {})
    }
    alert(`LLM 语境分析分配失败: ${err.message}`)
  } finally {
    matching.value = false
  }
}

async function downloadAudio(url: string | null | undefined, filename: string) {
  if (!url) return
  try {
    await downloadAudioUrl(url, filename)
  } catch (err: any) {
    alert(`下载音频失败: ${err.message}`)
  }
}

function downloadAllGenerated() {
  const finished = props.dialogues.filter(d => d.audio_url)
  if (finished.length === 0) return
  finished.forEach((item, i) => {
    setTimeout(() => {
      void downloadAudio(item.audio_url, item.output_filename || `dialogue_${item.index}_${item.speaker}.wav`)
    }, i * 300)
  })
}
</script>

<style scoped>
.desk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-badge {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--gold);
  background: rgba(184, 134, 11, 0.1);
  color: var(--gold);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 6px;
}

.card-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ink);
  font-family: var(--font-display);
}

.count-tag {
  font-size: 0.82rem;
  font-family: var(--font-body);
  font-weight: normal;
  color: var(--muted-ink);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.auto-synth-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--muted-ink);
  padding: 0 10px;
  height: 36px;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}

.prompt-dot {
  color: var(--gold);
  margin-left: 2px;
}

.prompt-drawer {
  padding: 14px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
}

.gold-icon {
  color: var(--gold);
}

.prompt-hint {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--muted-ink);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted-ink);
  text-align: center;
}

.empty-icon {
  color: var(--gold);
  opacity: 0.6;
  margin-bottom: 12px;
}

.table-container {
  overflow-x: auto;
  max-height: 480px;
  overflow-y: auto;
}

.dialogue-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  text-align: left;
}

.dialogue-table th {
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 5;
  padding: 10px 10px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted-ink);
  text-transform: uppercase;
  border-bottom: 1px solid var(--rule);
}

.dialogue-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}

.dialogue-table tr:hover {
  background: rgba(245, 243, 240, 0.5);
}

.dialogue-table tr.row-synthesizing {
  background: rgba(184, 134, 11, 0.08);
  border-left: 3px solid var(--gold);
}

.dialogue-table tr.row-done {
  border-left: 3px solid var(--success);
}

.dialogue-table tr.row-failed {
  border-left: 3px solid var(--danger);
}

.field-control.sm {
  min-height: 32px;
  padding: 5px 8px;
  font-size: 0.8rem;
  border-radius: 6px;
}

.speed-select {
  width: 72px;
}

.line-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--muted-ink);
}

.ja-cell {
  position: relative;
}

.ja-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  background: rgba(184, 134, 11, 0.15);
  color: var(--gold);
  border: 1px solid var(--gold);
  border-radius: 4px;
  padding: 1px 4px;
}

.emotion-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(184, 134, 11, 0.3);
  background: rgba(184, 134, 11, 0.08);
  color: var(--gold);
  font-size: 0.75rem;
}

.status-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  border: 1px solid var(--rule);
}

.status-badge.synthesizing {
  border-color: var(--gold);
  color: var(--gold);
  background: rgba(184, 134, 11, 0.1);
  animation: pulseStatus 1.2s infinite;
}

.status-badge.done {
  border-color: var(--success);
  color: var(--success);
  background: rgba(40, 112, 77, 0.1);
}

.status-badge.failed {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(168, 59, 50, 0.1);
}

@keyframes pulseStatus {
  50% { opacity: 0.5; }
}

.audio-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.audio-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-player {
  height: 30px;
  max-width: 170px;
}

.merged-box {
  padding: 6px;
  border: 1px dashed rgba(40, 112, 77, 0.4);
  background: rgba(40, 112, 77, 0.06);
  border-radius: 6px;
}

.merged-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--success);
  margin-bottom: 4px;
  font-weight: 600;
}

.success-icon {
  color: var(--success);
}
.success-icon:hover {
  border-color: var(--success);
  color: var(--success);
}

.danger-icon {
  color: var(--danger);
}
.danger-icon:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.desk-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid var(--rule);
  background: rgba(245, 243, 240, 0.6);
  flex-wrap: wrap;
  gap: 12px;
}

.stat-counts {
  display: flex;
  gap: 20px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--muted-ink);
}

.stat-counts strong {
  color: var(--ink);
}

.text-muted { color: var(--muted-ink); }
.text-danger { color: var(--danger); }
.text-center { text-align: center; }
.font-mono { font-family: var(--font-mono); }
.text-xs { font-size: 0.72rem; }
</style>
