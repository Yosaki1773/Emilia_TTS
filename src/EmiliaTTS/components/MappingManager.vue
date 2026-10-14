<template>
  <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-box large">
      <div class="modal-header">
        <div class="header-left">
          <h3>🎵 情感参考音频库配置 (Mapping Table)</h3>
          <span class="count-tag">共 {{ list.length }} 条</span>
          <span v-if="searchQuery" class="filtered-tag">筛选出 {{ filteredList.length }} 条</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-toolbar">
        <div class="toolbar-left">
          <button class="tool-button" @click="addNewRow">+ 添加参考音频</button>
          <button class="tool-button" @click="resetToDefault">🔄 恢复默认预设 (234条)</button>
          <input
            v-model="searchQuery"
            type="text"
            class="field-control search-input"
            placeholder="搜索 ID / 情感 / 名称 / 描述..."
          />
        </div>
        <div class="toolbar-right">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleImportFile"
          />
          <button class="tool-button" @click="triggerImport">📥 导入 JSON 文件</button>
          <button class="tool-button" @click="exportJson">📤 导出 JSON 文件</button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 120px">编号 (ID)</th>
              <th style="width: 130px">展示名称</th>
              <th style="width: 90px">情感</th>
              <th style="width: 90px">时长 (秒)</th>
              <th style="width: 250px">情感特征描述 (供 LLM 匹配决策)</th>
              <th style="width: 190px">本地音频路径 / URL</th>
              <th>参考音频台词文本 (prompt_text)</th>
              <th style="width: 50px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in filteredList" :key="item.id || idx">
              <td>
                <input v-model="item.id" class="field-control sm font-mono" placeholder="ref_xxx" />
              </td>
              <td>
                <input v-model="item.name" class="field-control sm" placeholder="如: 冷静陈述" />
              </td>
              <td>
                <input v-model="item.emotion" class="field-control sm" placeholder="如: 平静" />
              </td>
              <td>
                <input
                  v-model.number="item.duration"
                  type="number"
                  step="0.1"
                  min="0"
                  class="field-control sm"
                  placeholder="3.5"
                />
              </td>
              <td>
                <textarea
                  v-model="item.description"
                  class="field-control sm resize-y"
                  rows="2"
                  placeholder="语调特征描述..."
                ></textarea>
              </td>
              <td>
                <input
                  v-model="item.audio_path"
                  class="field-control sm font-mono"
                  placeholder="E:/tts/emt/愛蜜莉雅 (1).wav"
                />
              </td>
              <td>
                <textarea
                  v-model="item.prompt_text"
                  class="field-control sm resize-y"
                  rows="2"
                  placeholder="音频中的发音台词..."
                ></textarea>
              </td>
              <td class="text-center">
                <button class="icon-button danger-icon" title="删除此条" @click="removeRow(item)">
                  <Trash2 :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-footer">
        <span class="footer-tip">
          💡 提示：ID 将作为 LLM 输出的选择项；prompt_text 必须与音频中的实际发音台词 100% 一致；导入 JSON 会覆盖或更新当前音频库。
        </span>
        <div class="footer-actions">
          <button class="tool-button" @click="$emit('close')">取消</button>
          <button class="primary-button" @click="save">保存并应用</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import type { AudioReference } from '../types'
import defaultMapping from '../mapping.json'
import { addLog } from '../services/logger'

const props = defineProps<{
  visible: boolean
  references: AudioReference[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', references: AudioReference[]): void
}>()

const list = ref<AudioReference[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')

watch(() => props.references, (newVal) => {
  list.value = JSON.parse(JSON.stringify(newVal || []))
}, { immediate: true, deep: true })

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter(item => {
    return (
      (item.id && item.id.toLowerCase().includes(q)) ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.emotion && item.emotion.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.prompt_text && item.prompt_text.toLowerCase().includes(q))
    )
  })
})

function addNewRow() {
  const index = list.value.length + 1
  list.value.unshift({
    id: `ref_custom_${index}`,
    name: `自定义音频-${index}`,
    audio_path: 'examples/laffey.mp3',
    prompt_text: '我叫拉菲。',
    emotion: '平静',
    description: '【平静淡然】语速适中，语气平淡从容，适合普通叙述。',
    duration: 2.5
  })
}

function removeRow(target: AudioReference) {
  const idx = list.value.indexOf(target)
  if (idx !== -1) {
    list.value.splice(idx, 1)
  }
}

function resetToDefault() {
  if (confirm(`确定要恢复为默认的 ${defaultMapping.length} 条爱蜜莉雅参考音频预设吗？当前修改将会被覆盖。`)) {
    list.value = JSON.parse(JSON.stringify(defaultMapping))
    addLog('info', 'SYS', `已恢复默认参考音频映射预设 (${defaultMapping.length} 条)`)
  }
}

function triggerImport() {
  fileInputRef.value?.click()
}

function handleImportFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string
      const parsed = JSON.parse(content)

      if (!Array.isArray(parsed)) {
        throw new Error('导入的 JSON 必须是一个数组 (Array)')
      }

      const validList: AudioReference[] = []
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i]
        if (!item.id || !item.name || !item.audio_path) {
          throw new Error(`第 ${i + 1} 项缺少必要的 id、name 或 audio_path 字段`)
        }
        validList.push({
          id: String(item.id),
          name: String(item.name),
          audio_path: String(item.audio_path),
          prompt_text: String(item.prompt_text || ''),
          emotion: String(item.emotion || '平静'),
          description: String(item.description || ''),
          duration: typeof item.duration === 'number' ? item.duration : undefined
        })
      }

      list.value = validList
      addLog('success', 'SYS', `成功导入 ${validList.length} 条参考音频配置: ${file.name}`)
      alert(`🎉 成功导入 ${validList.length} 条参考音频配置！请点击“保存并应用”使其生效。`)
    } catch (err: any) {
      addLog('error', 'SYS', `导入参考音频 JSON 失败: ${err.message}`)
      alert(`❌ 导入 JSON 失败: ${err.message}`)
    } finally {
      if (target) target.value = ''
    }
  }

  reader.onerror = () => {
    alert('读取文件发生错误')
    if (target) target.value = ''
  }

  reader.readAsText(file)
}

function exportJson() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(list.value, null, 2))
  const downloadAnchor = document.createElement('a')
  downloadAnchor.setAttribute('href', dataStr)
  downloadAnchor.setAttribute('download', `gsv_audio_mapping_${Date.now()}.json`)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  downloadAnchor.remove()
  addLog('info', 'SYS', `已导出 ${list.value.length} 条参考音频配置为 JSON`)
}

function save() {
  emit('save', JSON.parse(JSON.stringify(list.value)))
  emit('close')
}
</script>

<style scoped>
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-tag, .filtered-tag {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 9999px;
}

.count-tag {
  background: var(--surface);
  border: 1px solid var(--rule);
  color: var(--muted-ink);
}

.filtered-tag {
  background: rgba(184, 134, 11, 0.1);
  border: 1px solid var(--gold);
  color: var(--gold);
}

.modal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
  gap: 10px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.search-input {
  width: 200px;
  min-height: 34px;
  padding: 4px 8px;
  font-size: 0.78rem;
}

.table-container {
  flex: 1;
  overflow-y: auto;
  max-height: calc(85vh - 160px);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  text-align: left;
}

.data-table th {
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 5;
  padding: 10px 8px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted-ink);
  text-transform: uppercase;
  border-bottom: 1px solid var(--rule);
}

.data-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}

.data-table tr:hover {
  background: rgba(245, 243, 240, 0.5);
}

.field-control.sm {
  min-height: 30px;
  padding: 4px 6px;
  font-size: 0.78rem;
  border-radius: 6px;
}

.footer-tip {
  font-size: 0.72rem;
  color: var(--muted-ink);
  max-width: 65%;
  line-height: 1.4;
}

.danger-icon {
  color: var(--danger);
}
.danger-icon:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.text-center { text-align: center; }
.font-mono { font-family: var(--font-mono); }
</style>
