<template>
  <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-box">
      <div class="modal-header">
        <h3>⚙️ OpenAI 兼容 LLM 服务配置</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="preset-row">
          <label>快速预设：</label>
          <div class="preset-btns">
            <button class="preset-btn" @click="applyPreset('deepseek')">DeepSeek</button>
            <button class="preset-btn" @click="applyPreset('openai')">OpenAI</button>
            <button class="preset-btn" @click="applyPreset('siliconflow')">硅基流动</button>
            <button class="preset-btn" @click="applyPreset('ollama')">本地 Ollama</button>
            <button class="preset-btn" @click="applyPreset('lmstudio')">LM Studio</button>
          </div>
        </div>

        <div class="form-group">
          <label>API 端点 (Base URL)：</label>
          <input
            v-model="form.apiUrl"
            type="text"
            placeholder="http://127.0.0.1:1234/v1 或 https://api.openai.com/v1"
            class="input-control"
          />
          <small>支持任意兼容 OpenAI /chat/completions 格式的接口地址</small>
        </div>

        <div class="form-group">
          <label>API Key：</label>
          <input
            v-model="form.apiKey"
            type="password"
            placeholder="sk-... (本地无鉴权可留空)"
            class="input-control"
          />
        </div>

        <div class="form-group">
          <div class="model-label-row">
            <label>模型名称 (Model)：</label>
            <button
              type="button"
              class="fetch-models-btn"
              :disabled="fetchingModels"
              @click="fetchModelList"
            >
              {{ fetchingModels ? '🔄 获取中...' : '🔍 获取可用模型列表' }}
            </button>
          </div>

          <div v-if="availableModels.length > 0" class="model-select-row">
            <select
              v-model="selectedModel"
              class="select-control"
              @change="onSelectModelChange"
            >
              <option value="">-- 从服务获取的 {{ availableModels.length }} 个模型中快速选择 --</option>
              <option v-for="m in availableModels" :key="m" :value="m">
                {{ m }}
              </option>
            </select>
          </div>

          <input
            v-model="form.model"
            type="text"
            placeholder="如 deepseek-chat, gpt-4o-mini 或 local-model"
            class="input-control"
          />
        </div>

        <div class="form-group">
          <label>采样温度 (Temperature)：{{ form.temperature }}</label>
          <input
            v-model.number="form.temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="range-control"
          />
          <small>建议 0.2~0.4，越低越稳定遵循格式要求</small>
        </div>

        <div class="form-group">
          <label>用户自定义提示词要求（翻译风格与音频匹配偏好）：</label>
          <textarea
            v-model="form.customPrompt"
            rows="4"
            class="textarea-control"
            placeholder="在此添加您的专属要求（作为最高优先级指令追加给LLM），例如：&#10;- 爱蜜莉雅在慌张或害羞时，多加上「え、えっと……」「も、もう！」等结巴语气词；&#10;- 如果出现道歉情节，倾向于选择带有微哭腔/愧疚的参考音频；&#10;- 特殊专有名词翻译：昴翻译为「スバル」，帕克翻译为「パック」等。"
          ></textarea>
          <small>自由补充你对翻译语气、角色口癖、特定词汇或参考音频选取的约束要求</small>
        </div>

        <div
          v-if="testMessage"
          class="test-message"
          :class="{ error: testStatus === 'error', success: testStatus === 'success' }"
        >
          {{ testMessage }}
        </div>
      </div>

      <div class="modal-footer">
        <button class="tool-button" :disabled="testing" @click="testConnection">
          {{ testing ? '测试中...' : '🔌 测试连接' }}
        </button>
        <div class="footer-actions">
          <button class="tool-button" @click="$emit('close')">取消</button>
          <button class="primary-button" @click="save">保存设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { LLMConfig } from '../types'
import { addLog } from '../services/logger'

const props = defineProps<{
  visible: boolean
  config: LLMConfig
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', config: LLMConfig): void
}>()

const form = reactive<LLMConfig>({
  apiUrl: props.config.apiUrl,
  apiKey: props.config.apiKey,
  model: props.config.model,
  temperature: props.config.temperature,
  customPrompt: props.config.customPrompt || ''
})

const availableModels = ref<string[]>([])
const selectedModel = ref('')
const fetchingModels = ref(false)

watch(() => props.config, (newVal) => {
  form.apiUrl = newVal.apiUrl
  form.apiKey = newVal.apiKey
  form.model = newVal.model
  form.temperature = newVal.temperature
  form.customPrompt = newVal.customPrompt || ''
}, { deep: true })

const testing = ref(false)
const testStatus = ref<'idle' | 'success' | 'error'>('idle')
const testMessage = ref('')

function applyPreset(type: 'deepseek' | 'openai' | 'siliconflow' | 'ollama' | 'lmstudio') {
  if (type === 'deepseek') {
    form.apiUrl = 'https://api.deepseek.com/v1'
    form.model = 'deepseek-chat'
  } else if (type === 'openai') {
    form.apiUrl = 'https://api.openai.com/v1'
    form.model = 'gpt-4o-mini'
  } else if (type === 'siliconflow') {
    form.apiUrl = 'https://api.siliconflow.cn/v1'
    form.model = 'deepseek-ai/DeepSeek-V3'
  } else if (type === 'ollama') {
    form.apiUrl = 'http://localhost:11434/v1'
    form.model = 'qwen2.5:7b'
  } else if (type === 'lmstudio') {
    form.apiUrl = 'http://127.0.0.1:1234/v1'
    form.model = 'local-model'
  }
}

async function testConnection() {
  testing.value = true
  testStatus.value = 'idle'
  testMessage.value = '正在向 LLM 发送测试请求...'

  try {
    const url = `${form.apiUrl.replace(/\/+$/, '')}/chat/completions`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (form.apiKey) {
      headers['Authorization'] = `Bearer ${form.apiKey}`
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: form.model,
        messages: [{ role: 'user', content: 'Say "pong"' }],
        max_tokens: 10
      })
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${err || res.statusText}`)
    }

    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content || 'ok'
    testStatus.value = 'success'
    testMessage.value = `✅ 连接成功！模型响应: ${reply.trim()}`
    addLog('success', 'LLM', `LLM 测试连接成功: ${form.model}`)
  } catch (err: any) {
    testStatus.value = 'error'
    testMessage.value = `❌ 连接失败: ${err.message}`
    addLog('error', 'LLM', `LLM 测试连接失败: ${err.message}`)
  } finally {
    testing.value = false
  }
}

async function fetchModelList() {
  if (!form.apiUrl) {
    alert('请先填写 API 端点 (Base URL)')
    return
  }

  fetchingModels.value = true
  testStatus.value = 'idle'
  testMessage.value = '正在向接口拉取模型列表 (/models)...'

  try {
    const url = `${form.apiUrl.replace(/\/+$/, '')}/models`
    const headers: Record<string, string> = {}
    if (form.apiKey) {
      headers['Authorization'] = `Bearer ${form.apiKey}`
    }

    addLog('info', 'LLM', `尝试获取远程模型列表: ${url}`)
    const res = await fetch(url, { method: 'GET', headers })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${err || res.statusText}`)
    }

    const json = await res.json()
    let list: string[] = []

    if (Array.isArray(json.data)) {
      list = json.data.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean)
    } else if (Array.isArray(json.models)) {
      list = json.models.map((item: any) => typeof item === 'string' ? item : item.name || item.id).filter(Boolean)
    } else if (Array.isArray(json)) {
      list = json.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean)
    }

    if (list.length === 0) {
      throw new Error('返回数据中未解析到有效的模型列表')
    }

    list.sort((a, b) => a.localeCompare(b))
    availableModels.value = list

    if (list.includes(form.model)) {
      selectedModel.value = form.model
    }

    testStatus.value = 'success'
    testMessage.value = `✅ 成功获取 ${list.length} 个可用模型！可从下拉列表直接选取。`
    addLog('success', 'LLM', `成功获取 ${list.length} 个模型`, list.slice(0, 10))
  } catch (err: any) {
    testStatus.value = 'error'
    testMessage.value = `❌ 获取模型列表失败: ${err.message}`
    addLog('warn', 'LLM', `获取模型列表失败: ${err.message}`)
  } finally {
    fetchingModels.value = false
  }
}

function onSelectModelChange() {
  if (selectedModel.value) {
    form.model = selectedModel.value
  }
}

function save() {
  emit('save', { ...form })
  emit('close')
}
</script>

<style scoped>
.preset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.preset-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-btn {
  background: var(--surface);
  border: 1px solid var(--rule);
  color: var(--ink);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.preset-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
}

.form-group small {
  font-size: 0.72rem;
  color: var(--muted-ink);
}

.model-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fetch-models-btn {
  background: none;
  border: none;
  color: var(--gold);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}
.fetch-models-btn:hover {
  text-decoration: underline;
}

.model-select-row {
  margin-bottom: 4px;
}

.range-control {
  width: 100%;
  accent-color: var(--gold);
  cursor: pointer;
}

.test-message {
  font-size: 0.78rem;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: var(--font-mono);
}

.test-message.success {
  background: rgba(40, 112, 77, 0.1);
  color: var(--success);
  border: 1px solid var(--success);
}

.test-message.error {
  background: rgba(168, 59, 50, 0.1);
  color: var(--danger);
  border: 1px solid var(--danger);
}
</style>
