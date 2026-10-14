<template>
  <section class="paper-card">
    <div class="card-header">
      <div class="header-left">
        <span class="step-badge">01</span>
        <div>
          <p class="editorial-label">Manuscript input</p>
          <h2 class="card-title">原始剧本文本与对白提取</h2>
        </div>
      </div>
      <div class="header-actions">
        <button class="tool-button" @click="loadFromTavernChat" title="从酒馆当前聊天的最新AI回复中读取台词">
          <MessageSquareText :size="15" /> 从当前酒馆消息导入
        </button>
        <button class="tool-button" @click="loadSampleText">
          <BookOpen :size="15" /> 加载示例
        </button>
        <button class="tool-button" @click="rawText = ''">
          <Eraser :size="15" /> 清空
        </button>
      </div>
    </div>

    <div class="card-body">
      <textarea
        v-model="rawText"
        rows="7"
        class="text-input"
        placeholder="在此粘贴包含 {爱蜜莉雅}「台词」的中文剧本、小说文本或酒馆消息...&#10;提取规则：自动提取所有以“{爱蜜莉雅}”开头的段落台词，也可点击上方“从当前酒馆消息导入”。"
      ></textarea>
    </div>

    <div class="card-footer">
      <p class="rule-hint">
        <Pin :size="14" class="hint-icon" />
        <span>提取规则：支持处理以 <strong>{爱蜜莉雅}</strong> 或 <strong>&lt;tts&gt;</strong> 标记的角色台词。</span>
      </p>
      <div class="footer-right">
        <span class="char-count">{{ rawText.length }} 字</span>
        <button class="primary-button" :disabled="!rawText.trim()" @click="handleExtract">
          <ScanText :size="16" /> 提取对白
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BookOpen, Eraser, MessageSquareText, Pin, ScanText } from 'lucide-vue-next'
import { extractDialogues, extractXmlTagContent } from '../services/dialogueExtractor'
import type { DialogueItem } from '../types'
import sampleInput from '../data/input.txt?raw'
import { addLog } from '../services/logger'

const props = defineProps<{
  xmlTag?: string
}>()

const emit = defineEmits<{
  (e: 'extracted', items: DialogueItem[], fullText: string): void
}>()

const rawText = ref('')

onMounted(() => {
  rawText.value = sampleInput
})

function loadSampleText() {
  rawText.value = sampleInput
  addLog('info', 'EXTRACT', '已载入示例轻小说剧本文本')
}

function loadFromTavernChat() {
  try {
    if (typeof getChatMessages === 'function') {
      const messages = getChatMessages()
      if (messages && messages.length > 0) {
        // 查找最新的非用户消息（AI角色的消息）
        const aiMsgs = messages.filter((m: any) => !m.is_user && m.message)
        const lastMsg = aiMsgs.length > 0 ? aiMsgs[aiMsgs.length - 1] : messages[messages.length - 1]
        if (lastMsg && lastMsg.message) {
          const content = String(lastMsg.message)
          // 如果有 xmlTag，优先提取标签内
          const tag = props.xmlTag || 'tts'
          const extractedTag = extractXmlTagContent(content, tag)
          rawText.value = extractedTag || content
          addLog('success', 'EXTRACT', `成功从酒馆最新消息导入文本 (${rawText.value.length} 字符)`)
          handleExtract()
          return
        }
      }
    }
    alert('未能从当前酒馆对话中读取到消息，请确认当前已打开聊天。')
  } catch (err: any) {
    alert(`读取酒馆消息失败: ${err.message}`)
  }
}

function handleExtract() {
  const list = extractDialogues(rawText.value)
  if (list.length === 0) {
    alert('未在文本中找到任何以“{爱蜜莉雅}”开头的段落或台词，请检查输入格式。')
    return
  }
  emit('extracted', list, rawText.value)
}
</script>

<style scoped>
.card-header {
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

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.card-body {
  padding: 16px 20px;
}

.text-input {
  width: 100%;
  min-height: 140px;
  border: 1px solid var(--rule);
  background: var(--surface);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--ink);
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: all 150ms ease;
}

.text-input:focus {
  border-color: var(--gold);
  background: var(--paper);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid var(--rule);
  background: rgba(245, 243, 240, 0.6);
  flex-wrap: wrap;
  gap: 12px;
}

.rule-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted-ink);
  display: flex;
  align-items: center;
  gap: 6px;
}

.hint-icon {
  color: var(--gold);
  flex-shrink: 0;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.char-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted-ink);
}
</style>
