<script setup>
import { ref } from 'vue'
import ParentIcon from './ParentIcon.vue'
import { toast } from '../utils/toast'

const MAX_FILES = 3
const MAX_FILE_SIZE = 10 * 1024 * 1024

const emit = defineEmits(['send'])
const body = ref('')
const files = ref([])
const sending = ref(false)

function onPick(e) {
  const incoming = Array.from(e.target.files || [])
  let droppedOversize = 0
  let droppedOverLimit = 0
  for (const f of incoming) {
    if (files.value.length >= MAX_FILES) {
      droppedOverLimit += 1
      continue
    }
    if (f.size > MAX_FILE_SIZE) {
      droppedOversize += 1
      continue
    }
    files.value.push(f)
  }
  // Why: 之前是靜默 drop，家長以為附件全傳了。
  if (droppedOversize > 0) {
    toast.warn(`${droppedOversize} 個附件超過 10MB，已略過`)
  }
  if (droppedOverLimit > 0) {
    toast.warn(`最多 ${MAX_FILES} 個附件，多餘的已略過`)
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
        <ParentIcon name="attachment" size="xs" />
        {{ f.name }}
        <button
          type="button"
          :aria-label="`移除附件 ${f.name}`"
          @click="removeFile(i)"
        >
          <ParentIcon name="close" size="xs" />
        </button>
      </span>
    </div>
    <div class="row">
      <label class="attach-btn" aria-label="加入附件">
        <ParentIcon name="attachment" size="sm" />
        <input type="file" accept="image/*,application/pdf" multiple @change="onPick" hidden />
      </label>
      <label for="msg-composer-body" class="sr-only">輸入訊息</label>
      <textarea
        id="msg-composer-body"
        v-model="body"
        placeholder="輸入訊息…"
        rows="1"
        autocomplete="off"
        @keydown.enter.exact.prevent="submit"
      />
      <button
        type="button"
        class="send"
        :disabled="sending"
        :aria-label="sending ? '送出中' : '送出訊息'"
        @click="submit"
      >
        {{ sending ? '⋯' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer { background: var(--neutral-0); border-top: 1px solid var(--pt-border); padding: 8px; }
.files { display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 6px; font-size: 12px; }
.file { background: var(--pt-surface-mute); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; }
.file button { border: none; background: none; cursor: pointer; padding: 0 0 0 4px; display: inline-flex; align-items: center; }
.row { display: flex; gap: 6px; align-items: flex-end; }
.attach-btn { padding: 6px; background: var(--pt-surface-mute); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
textarea { flex: 1; padding: 8px; border: 1px solid var(--pt-text-hint); border-radius: 6px; font-size: 14px; resize: none; max-height: 80px; }
.send { padding: 8px 14px; background: var(--brand-primary); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 14px; }
.send:disabled { opacity: 0.5; }
</style>
