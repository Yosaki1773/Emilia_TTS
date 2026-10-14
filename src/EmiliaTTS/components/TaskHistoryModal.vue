<template>
  <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-box history-modal">
      <div class="modal-header">
        <div class="header-left">
          <h3>🕘 对白合成历史任务</h3>
          <span class="count-tag">{{ tasks.length }} 条</span>
        </div>
        <div class="header-actions">
          <button class="tool-button" :disabled="loading" @click="loadTasks">🔄 刷新</button>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="loading" class="empty-state">正在加载历史任务...</div>
        <div v-else-if="tasks.length === 0" class="empty-state">暂无对白合成历史记录</div>
        <div v-else class="history-layout">
          <div class="task-list">
            <button
              v-for="task in tasks"
              :key="task.task_id"
              class="task-row"
              :class="{ active: selected?.task_id === task.task_id }"
              @click="selectTask(task.task_id)"
            >
              <div class="task-row-top">
                <strong>{{ formatDate(task.created_at) }}</strong>
                <span class="status-pill" :class="task.status">{{ formatStatus(task.status) }}</span>
              </div>
              <div class="task-row-meta">
                {{ task.total_items }} 条对白 · LLM {{ formatMs(task.llm_wait_ms) }} · TTS {{ formatMs(task.tts_inference_ms) }}
              </div>
            </button>
          </div>

          <div v-if="selected" class="task-detail">
            <div class="metrics-grid">
              <div class="metric-card">
                <span>LLM 耗时</span>
                <strong>{{ formatMs(selected.llm_wait_ms) }}</strong>
              </div>
              <div class="metric-card">
                <span>TTS 请求</span>
                <strong>{{ formatMs(selected.tts_request_ms) }}</strong>
              </div>
              <div class="metric-card">
                <span>TTS 推理</span>
                <strong>{{ formatMs(selected.tts_inference_ms) }}</strong>
              </div>
              <div class="metric-card">
                <span>音频拼接</span>
                <strong>{{ formatMs(selected.merge_ms) }}</strong>
              </div>
              <div class="metric-card">
                <span>总耗时</span>
                <strong>{{ formatMs(selected.total_ms) }}</strong>
              </div>
            </div>

            <div v-if="selected.error_message" class="error-box">
              {{ selected.error_message }}
            </div>

            <div class="items-table-wrap">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 36px">#</th>
                    <th style="width: 180px">对白原文</th>
                    <th style="width: 220px">日语台词</th>
                    <th style="width: 90px">情绪/语速</th>
                    <th style="width: 140px">音频</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in selected.items || []" :key="`${selected.task_id}-${index}`">
                    <td class="text-center font-mono">{{ item.source_index || index + 1 }}</td>
                    <td>{{ item.original_text || '-' }}</td>
                    <td>{{ item.text || '-' }}</td>
                    <td>{{ item.inferred_emotion || '-' }} / {{ item.speed || '-' }}</td>
                    <td>
                      <audio v-if="item.audio_url" controls :src="item.audio_url" class="mini-audio"></audio>
                      <span v-else class="text-muted">{{ item.audio_status || '-' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <span class="footer-tip">历史记录基于后端任务接口与本地会话自动记录。</span>
        <button class="tool-button" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { StudioTask, TTSConfig } from '../types'
import { getStudioTask, listStudioTasks } from '../services/studioTasks'

const props = defineProps<{
  visible: boolean
  config: TTSConfig
}>()

defineEmits<{
  (e: 'close'): void
}>()

const tasks = ref<StudioTask[]>([])
const selected = ref<StudioTask | null>(null)
const loading = ref(false)

watch(() => props.visible, (visible) => {
  if (visible) {
    loadTasks()
  }
})

async function loadTasks() {
  loading.value = true
  try {
    const res = await listStudioTasks(props.config, 30, 0)
    tasks.value = res.items || []
    if (tasks.value.length > 0) {
      selectTask(tasks.value[0].task_id)
    } else {
      selected.value = null
    }
  } catch (err) {
    tasks.value = []
    selected.value = null
  } finally {
    loading.value = false
  }
}

async function selectTask(taskId: string) {
  try {
    const task = await getStudioTask(props.config, taskId)
    selected.value = task
  } catch (err) {
    selected.value = tasks.value.find(t => t.task_id === taskId) || null
  }
}

function formatDate(iso: string) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

function formatStatus(status: string) {
  switch (status) {
    case 'succeeded': return '成功'
    case 'failed': return '失败'
    case 'running': return '执行中'
    default: return status || '未知'
  }
}

function formatMs(val?: number | null) {
  if (val === null || val === undefined) return '-'
  if (val < 1000) return `${Math.round(val)}ms`
  return `${(val / 1000).toFixed(2)}s`
}
</script>

<style scoped>
.history-modal {
  max-width: 1080px;
  width: 95%;
  height: 85vh;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-tag {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  background: var(--surface);
  border: 1px solid var(--rule);
  padding: 2px 8px;
  border-radius: 9999px;
  color: var(--muted-ink);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  height: 100%;
  min-height: 420px;
}

.task-list {
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--surface);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.task-row {
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: all 120ms ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-row:hover {
  background: rgba(184, 134, 11, 0.06);
}

.task-row.active {
  background: var(--paper);
  border-left: 3px solid var(--gold);
}

.task-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-row-meta {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--muted-ink);
}

.task-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.metric-card {
  border: 1px solid var(--rule);
  background: var(--surface);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-card span {
  font-size: 0.7rem;
  color: var(--muted-ink);
}

.metric-card strong {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--ink);
}

.items-table-wrap {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--rule);
  border-radius: 8px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.items-table th {
  position: sticky;
  top: 0;
  background: var(--surface);
  padding: 8px 10px;
  border-bottom: 1px solid var(--rule);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--muted-ink);
  text-align: left;
}

.items-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}

.mini-audio {
  height: 28px;
  max-width: 150px;
}

.status-pill {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid currentColor;
}
.status-pill.succeeded { color: var(--success); }
.status-pill.failed { color: var(--danger); }
.status-pill.running { color: var(--gold); }

.error-box {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--danger);
  background: rgba(168, 59, 50, 0.08);
  color: var(--danger);
  font-size: 0.78rem;
}

.footer-tip {
  font-size: 0.75rem;
  color: var(--muted-ink);
}

.empty-state {
  display: grid;
  place-items: center;
  padding: 40px;
  color: var(--muted-ink);
}

.text-muted { color: var(--muted-ink); }
.text-center { text-align: center; }
.font-mono { font-family: var(--font-mono); }
</style>
