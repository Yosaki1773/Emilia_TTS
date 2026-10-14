<template>
  <header class="studio-header">
    <div class="header-inner">
      <div class="brand-group">
        <div class="brand-icon">
          <Mic2 :size="20" :stroke-width="1.8" />
        </div>
        <div class="brand-text">
          <h1 class="brand-title">Emilia TTS Studio</h1>
          <p class="brand-subtitle">剧本对白 · 情感匹配 · 批量合成 · 酒馆助手</p>
        </div>
      </div>

      <div class="actions-group">
        <div class="status-indicator" :class="ttsConnected ? 'online' : 'offline'">
          <span class="status-dot"></span>
          <span>{{ ttsConnected ? 'TTS 在线' : 'TTS 未连接' }}</span>
          <button class="refresh-icon-btn" title="刷新 TTS 状态" @click="$emit('check-tts')">
            <RefreshCw :size="14" />
          </button>
        </div>

        <button class="header-action" @click="$emit('open-llm-config')">
          <Settings2 :size="15" />
          <span>LLM 设置</span>
          <span v-if="hasLlmKey" class="status-pill success">已配置</span>
        </button>

        <button class="header-action" @click="$emit('open-mapping')">
          <LibraryBig :size="15" />
          <span>音频库</span>
          <span class="count-pill">{{ refCount }}</span>
        </button>

        <button class="header-action" @click="$emit('open-tts-config')">
          <SlidersHorizontal :size="15" />
          <span>合成参数</span>
        </button>

        <button class="header-action" @click="$emit('open-history')">
          <History :size="15" />
          <span>历史任务</span>
        </button>

        <button class="header-action" @click="$emit('open-logs')">
          <ScrollText :size="15" />
          <span>运行日志</span>
          <span v-if="errorCount > 0" class="status-pill danger">{{ errorCount }}</span>
        </button>

        <button class="close-studio-btn" title="关闭工作台 (可随时重新打开)" @click="$emit('close')">
          <X :size="18" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  History,
  LibraryBig,
  Mic2,
  RefreshCw,
  ScrollText,
  Settings2,
  SlidersHorizontal,
  X
} from 'lucide-vue-next'
import { logs } from '../services/logger'

defineProps<{
  ttsConnected: boolean
  hasLlmKey: boolean
  refCount: number
}>()

defineEmits<{
  (e: 'check-tts'): void
  (e: 'open-llm-config'): void
  (e: 'open-mapping'): void
  (e: 'open-tts-config'): void
  (e: 'open-logs'): void
  (e: 'open-history'): void
  (e: 'close'): void
}>()

const errorCount = computed(() => logs.value.filter(l => l.level === 'error').length)
</script>

<style scoped>
.studio-header {
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
  padding: 12px 24px;
  flex-shrink: 0;
  user-select: none;
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid rgba(184, 134, 11, 0.4);
  background: rgba(184, 134, 11, 0.08);
  color: var(--gold);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.brand-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  font-family: var(--font-display);
}

.brand-subtitle {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted-ink);
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--rule);
  background: var(--surface);
  border-radius: 8px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
}

.status-indicator.online {
  color: var(--success);
}

.status-indicator.offline {
  color: var(--danger);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.refresh-icon-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 2px;
  display: grid;
  place-items: center;
  opacity: 0.7;
}

.refresh-icon-btn:hover {
  opacity: 1;
}

.header-action {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--rule);
  background: var(--paper);
  padding: 0 12px;
  color: var(--ink);
  font-size: 0.78rem;
  cursor: pointer;
  border-radius: 8px;
  transition: all 150ms ease;
}

.header-action:hover {
  border-color: var(--gold);
  color: var(--gold);
  background: var(--surface);
}

.status-pill, .count-pill {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 4px;
}

.status-pill.success {
  background: rgba(40, 112, 77, 0.12);
  color: var(--success);
  border: 1px solid var(--success);
}

.status-pill.danger {
  background: rgba(168, 59, 50, 0.12);
  color: var(--danger);
  border: 1px solid var(--danger);
}

.count-pill {
  color: var(--gold);
  background: rgba(184, 134, 11, 0.1);
  font-weight: 600;
}

.close-studio-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--muted-ink);
  cursor: pointer;
  transition: all 150ms ease;
  margin-left: 4px;
}

.close-studio-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(168, 59, 50, 0.08);
}
</style>
