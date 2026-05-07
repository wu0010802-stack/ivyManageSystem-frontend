<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '輸入訊息…' },
})
const emit = defineEmits(['send'])

const body = ref('')
const files = ref([])
const sending = ref(false)

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf']

function onPickFile(e) {
  const fs = Array.from(e.target.files || [])
  for (const f of fs) {
    const ext = f.name.includes('.') ? '.' + f.name.split('.').pop().toLowerCase() : ''
    if (!ALLOWED_EXT.includes(ext)) {
      ElMessage.warning(`不支援的檔案格式：${f.name}`)
      continue
    }
    files.value.push(f)
  }
  e.target.value = ''
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

async function submit() {
  const text = body.value.trim()
  if (!text || sending.value || props.disabled) return
  sending.value = true
  // Vue 的 emit 不回傳 Promise，無法 await 父層 async handler。
  // 改為傳遞 done(success: boolean) callback，父層 try/catch 後告知結果，
  // 失敗時保留 body/attachments 讓使用者能重送。
  try {
    const success = await new Promise((resolve) => {
      emit('send', {
        body: text,
        attachments: [...files.value],
        done: (ok = true) => resolve(ok !== false),
      })
    })
    if (success) {
      body.value = ''
      files.value = []
    }
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <div v-if="files.length" class="file-row">
      <span v-for="(f, i) in files" :key="i" class="file-chip">
        {{ f.name }}
        <button type="button" @click="removeFile(i)">×</button>
      </span>
    </div>
    <div class="input-row">
      <textarea
        v-model="body"
        :placeholder="placeholder"
        :disabled="disabled || sending"
        rows="2"
      ></textarea>
      <label class="attach-btn">
        📎
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.heic,.heif,.pdf"
          multiple
          hidden
          @change="onPickFile"
        />
      </label>
      <button
        type="submit"
        class="send-btn"
        :disabled="!body.trim() || sending || disabled"
      >
        {{ sending ? '送出中…' : '送出' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.composer {
  background: var(--pt-surface-card);
  border-top: var(--pt-hairline);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.file-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.file-chip {
  display: inline-flex; gap: 4px; align-items: center;
  background: var(--pt-surface-mute);
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
}
.file-chip button { background: none; border: none; cursor: pointer; }

.input-row {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
}
textarea {
  flex: 1;
  resize: vertical;
  min-height: 60px;
  padding: var(--space-2);
  border: 1px solid var(--pt-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-base);
}
.attach-btn {
  cursor: pointer;
  padding: var(--space-2);
  font-size: 18px;
}
.send-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-base);
}
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
