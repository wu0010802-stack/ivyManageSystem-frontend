<template>
  <div v-if="modelValue" class="dialog-backdrop" @click.self="cancel">
    <div class="dialog">
      <h3>{{ title }}</h3>
      <p class="hint">理由 ≥ 10 字（必填，會落 audit）</p>
      <textarea v-model="reason" rows="3" placeholder="例如：2027 政府公告比對無異常套用" />
      <p class="error" v-if="touched && reason.length < 10">請輸入至少 10 個字</p>
      <div class="actions">
        <button @click="cancel">取消</button>
        <button :disabled="reason.length < 10" @click="submit">確認</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '確認操作' },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const reason = ref('')
const touched = ref(false)

watch(() => props.modelValue, v => {
  if (v) {
    reason.value = ''
    touched.value = false
  }
})

function cancel() {
  emit('update:modelValue', false)
}
function submit() {
  touched.value = true
  if (reason.value.length < 10) return
  emit('submit', reason.value)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.dialog {
  background: #fff; padding: 24px; border-radius: 8px;
  width: 480px; max-width: 90vw;
}
.dialog textarea { width: 100%; box-sizing: border-box; font-family: inherit; }
.error { color: #d32f2f; font-size: 12px; }
.hint { color: #666; font-size: 13px; margin-top: 0; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.actions button { padding: 6px 16px; border-radius: 4px; border: 1px solid #ddd; cursor: pointer; }
.actions button:last-child {
  background: #4caf50; color: #fff; border-color: #4caf50;
}
.actions button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
