<script setup>
import { ref } from 'vue'

const emit = defineEmits(['send'])
const body = ref('')
const files = ref([])
const sending = ref(false)

function onPick(e) {
  const incoming = Array.from(e.target.files || [])
  // 最多 3 檔
  for (const f of incoming) {
    if (files.value.length >= 3) break
    if (f.size > 10 * 1024 * 1024) continue
    files.value.push(f)
  }
  e.target.value = ''
}

function removeFile(i) {
  files.value.splice(i, 1)
}

async function submit() {
  if (!body.value.trim() && files.value.length === 0) return
  sending.value = true
  try {
    await new Promise((resolve) => {
      emit('send', {
        body: body.value.trim() || '(附件)',
        attachments: [...files.value],
        done: resolve,
      })
    })
    body.value = ''
    files.value = []
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="composer">
    <div v-if="files.length" class="files">
      <span v-for="(f, i) in files" :key="i" class="file">
        📎 {{ f.name }}
        <button @click="removeFile(i)">×</button>
      </span>
    </div>
    <div class="row">
      <label class="attach-btn">
        📎
        <input type="file" accept="image/*,application/pdf" multiple @change="onPick" hidden />
      </label>
      <textarea
        v-model="body"
        placeholder="輸入訊息…"
        rows="1"
        @keydown.enter.exact.prevent="submit"
      />
      <button class="send" :disabled="sending" @click="submit">
        {{ sending ? '⋯' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer { background: #fff; border-top: 1px solid #e5e7eb; padding: 8px; }
.files { display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 6px; font-size: 12px; }
.file { background: #f0f2f5; padding: 2px 6px; border-radius: 4px; }
.file button { border: none; background: none; cursor: pointer; padding: 0 0 0 4px; }
.row { display: flex; gap: 6px; align-items: flex-end; }
.attach-btn { padding: 6px; background: #f0f2f5; border-radius: 6px; font-size: 18px; cursor: pointer; }
textarea { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; resize: none; max-height: 80px; }
.send { padding: 8px 14px; background: #3f7d48; color: #fff; border: none; border-radius: 6px; font-size: 14px; }
.send:disabled { opacity: 0.5; }
</style>
