<template>
  <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-box">
      <div class="modal-header">
        <h3>🎙️ GSV-TTS 语音合成参数设置</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>GSV-TTS 服务地址 (Base URL)：</label>
          <input
            v-model="form.baseUrl"
            type="text"
            placeholder="http://127.0.0.1:9880"
            class="input-control"
          />
          <small>本地 GSV-TTS-Lite 服务运行地址，默认 http://127.0.0.1:9880</small>
        </div>

        <div class="param-grid">
          <div class="form-group">
            <label>默认语速倍率 (Speed)：{{ form.speed }}x</label>
            <input
              v-model.number="form.speed"
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              class="range-control"
            />
          </div>

          <div class="form-group">
            <label>噪声强度 (Noise Scale)：{{ form.noise_scale }}</label>
            <input
              v-model.number="form.noise_scale"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              class="range-control"
            />
          </div>

          <div class="form-group">
            <label>采样温度 (Temperature)：{{ form.temperature }}</label>
            <input
              v-model.number="form.temperature"
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              class="range-control"
            />
          </div>

          <div class="form-group">
            <label>重复惩罚 (Repetition Penalty)：{{ form.repetition_penalty }}</label>
            <input
              v-model.number="form.repetition_penalty"
              type="range"
              min="1.0"
              max="2.0"
              step="0.05"
              class="range-control"
            />
          </div>

          <div class="form-group">
            <label>Top K：{{ form.top_k }}</label>
            <input
              v-model.number="form.top_k"
              type="range"
              min="1"
              max="50"
              step="1"
              class="range-control"
            />
          </div>

          <div class="form-group">
            <label>Top P：{{ form.top_p }}</label>
            <input
              v-model.number="form.top_p"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              class="range-control"
            />
          </div>
        </div>

        <div class="switch-row">
          <label class="switch-label">
            <input v-model="form.is_cut_text" type="checkbox" />
            <span>按标点切分长句 (is_cut_text)</span>
          </label>
          <label class="switch-label">
            <input v-model="form.return_subtitles" type="checkbox" />
            <span>返回时间轴字幕 (return_subtitles)</span>
          </label>
        </div>

        <div v-if="form.is_cut_text" class="cut-params-row">
          <div class="form-group half">
            <label>切分最小长度 (cut_minlen)：</label>
            <input v-model.number="form.cut_minlen" type="number" min="1" max="100" class="input-control" />
          </div>
          <div class="form-group half">
            <label>切分静音时长 (cut_mute 秒)：</label>
            <input v-model.number="form.cut_mute" type="number" step="0.05" min="0" max="2" class="input-control" />
          </div>
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
        <button class="tool-button" :disabled="testing" @click="testTTS">
          {{ testing ? '测试中...' : '🔌 检查服务状态' }}
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
import type { TTSConfig } from '../types'
import { checkTTSHealth } from '../services/tts'

const props = defineProps<{
  visible: boolean
  config: TTSConfig
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', config: TTSConfig): void
}>()

const form = reactive<TTSConfig>({ ...props.config })

watch(() => props.config, (newVal) => {
  Object.assign(form, newVal)
}, { deep: true })

const testing = ref(false)
const testStatus = ref<'idle' | 'success' | 'error'>('idle')
const testMessage = ref('')

async function testTTS() {
  testing.value = true
  testStatus.value = 'idle'
  testMessage.value = '正在向 GSV-TTS 服务发起连通性检查...'

  try {
    const health = await checkTTSHealth(form.baseUrl)
    if (health.ok) {
      testStatus.value = 'success'
      testMessage.value = `✅ ${health.message}`
    } else {
      testStatus.value = 'error'
      testMessage.value = `❌ ${health.message}`
    }
  } catch (err: any) {
    testStatus.value = 'error'
    testMessage.value = `❌ 连接异常: ${err.message}`
  } finally {
    testing.value = false
  }
}

function save() {
  emit('save', { ...form })
  emit('close')
}
</script>

<style scoped>
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

.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}

.range-control {
  width: 100%;
  accent-color: var(--gold);
  cursor: pointer;
}

.switch-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding: 6px 0;
}

.switch-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  cursor: pointer;
  user-select: none;
}

.cut-params-row {
  display: flex;
  gap: 16px;
}

.form-group.half {
  flex: 1;
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
