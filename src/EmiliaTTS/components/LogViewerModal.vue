<template>
  <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-box logs-modal">
      <div class="modal-header">
        <div class="header-left">
          <h3>📋 系统运行与排错日志 (Logs)</h3>
          <span class="count-tag">{{ logs.length }} 条记录</span>
        </div>
        <div class="header-right">
          <button class="tool-button" @click="copyAllLogs">📋 复制全部</button>
          <button class="tool-button" @click="clearLogs">🗑️ 清空日志</button>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-group">
          <label>级别筛选:</label>
          <button
            class="filter-tag"
            :class="{ active: currentLevel === 'all' }"
            @click="currentLevel = 'all'"
          >
            全部
          </button>
          <button
            class="filter-tag error"
            :class="{ active: currentLevel === 'error' }"
            @click="currentLevel = 'error'"
          >
            错误 ({{ errorCount }})
          </button>
          <button
            class="filter-tag warn"
            :class="{ active: currentLevel === 'warn' }"
            @click="currentLevel = 'warn'"
          >
            警告 ({{ warnCount }})
          </button>
          <button
            class="filter-tag success"
            :class="{ active: currentLevel === 'success' }"
            @click="currentLevel = 'success'"
          >
            成功
          </button>
          <button
            class="filter-tag info"
            :class="{ active: currentLevel === 'info' }"
            @click="currentLevel = 'info'"
          >
            信息
          </button>
        </div>

        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            class="field-control search-input"
            placeholder="搜索日志关键字..."
          />
        </div>
      </div>

      <div class="logs-container">
        <div v-if="filteredLogs.length === 0" class="empty-logs">
          <span>暂无匹配的日志记录</span>
        </div>
        <div
          v-for="log in filteredLogs"
          :key="log.id"
          class="log-row"
          :class="log.level"
        >
          <div class="log-meta">
            <span class="time">{{ log.timestamp }}</span>
            <span class="module-tag" :class="log.module.toLowerCase()">{{ log.module }}</span>
            <span class="level-badge" :class="log.level">{{ log.level.toUpperCase() }}</span>
          </div>
          <div class="log-body">
            <div class="log-msg">{{ log.message }}</div>
            <pre v-if="log.detail" class="log-detail">{{ log.detail }}</pre>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <span class="footer-tip">
          💡 提示：所有台词提取、LLM 翻译交互、TTS 合成请求与音频拼接细节均已记录在此。
        </span>
        <button class="tool-button" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { logs, clearLogs } from '../services/logger'

defineProps<{
  visible: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()

const currentLevel = ref<'all' | 'info' | 'warn' | 'error' | 'success'>('all')
const searchQuery = ref('')

const errorCount = computed(() => logs.value.filter(l => l.level === 'error').length)
const warnCount = computed(() => logs.value.filter(l => l.level === 'warn').length)

const filteredLogs = computed(() => {
  let list = logs.value

  if (currentLevel.value !== 'all') {
    list = list.filter(l => l.level === currentLevel.value)
  }

  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter(l =>
      l.message.toLowerCase().includes(query) ||
      l.module.toLowerCase().includes(query) ||
      (l.detail && l.detail.toLowerCase().includes(query))
    )
  }

  return list
})

function copyAllLogs() {
  if (logs.value.length === 0) return
  const text = logs.value.map(l =>
    `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.module}] ${l.message}${l.detail ? '\n' + l.detail : ''}`
  ).join('\n---\n')

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 日志已成功复制到剪贴板！')
  }).catch(() => {
    alert('复制失败，请手动在控制台查看。')
  })
}
</script>

<style scoped>
.logs-modal {
  max-width: 960px;
  width: 95%;
  height: 85vh;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
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

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
  gap: 10px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}

.filter-tag {
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--ink);
  transition: all 150ms ease;
}

.filter-tag:hover {
  border-color: var(--gold);
}

.filter-tag.active {
  background: var(--ink);
  color: #fff;
  border-color: var(--ink);
}

.filter-tag.error { color: var(--danger); }
.filter-tag.warn { color: var(--warning); }
.filter-tag.success { color: var(--success); }

.search-input {
  width: 220px;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 0.78rem;
}

.logs-container {
  flex: 1;
  overflow-y: auto;
  padding: 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--canvas);
}

.empty-logs {
  display: grid;
  place-items: center;
  padding: 60px;
  color: var(--muted-ink);
  font-size: 0.85rem;
}

.log-row {
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.log-row.error {
  border-left: 3px solid var(--danger);
  background: rgba(168, 59, 50, 0.04);
}
.log-row.warn {
  border-left: 3px solid var(--warning);
}
.log-row.success {
  border-left: 3px solid var(--success);
}
.log-row.info {
  border-left: 3px solid var(--rule-strong);
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.7rem;
}

.time { color: var(--muted-ink); }

.module-tag {
  background: var(--surface);
  border: 1px solid var(--rule);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}
.module-tag.extract { color: #805ad5; }
.module-tag.llm { color: #3182ce; }
.module-tag.tts { color: #d69e2e; }
.module-tag.audio { color: #38a169; }
.module-tag.sys { color: #718096; }

.level-badge {
  font-size: 0.65rem;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
}
.level-badge.error { background: var(--danger); color: #fff; }
.level-badge.warn { background: var(--warning); color: #fff; }
.level-badge.success { background: var(--success); color: #fff; }
.level-badge.info { background: var(--surface); color: var(--muted-ink); }

.log-msg {
  color: var(--ink);
  word-break: break-word;
}

.log-detail {
  margin: 4px 0 0;
  padding: 8px;
  background: var(--surface);
  border-radius: 6px;
  font-size: 0.72rem;
  overflow-x: auto;
  color: var(--muted-ink);
  max-height: 180px;
}

.footer-tip {
  font-size: 0.75rem;
  color: var(--muted-ink);
}
</style>
