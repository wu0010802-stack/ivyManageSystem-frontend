<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: { type: Object, required: true },
  canRecall: { type: Boolean, default: false },
})
const emit = defineEmits(['recall'])

const isMine = computed(() => props.message.sender_role === 'parent')
const isPending = computed(() => props.message._pending === true)
const time = computed(() => {
  if (!props.message.created_at) return ''
  const d = new Date(props.message.created_at)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
})
</script>

<template>
  <div class="bubble-row" :class="{ mine: isMine }">
    <div class="bubble" :class="{ deleted: message.deleted, pending: isPending }">
      <template v-if="message.deleted">
        <em>此訊息已撤回</em>
      </template>
      <template v-else>
        <div v-if="message.body" class="body">{{ message.body }}</div>
        <div v-if="(message.attachments || []).length" class="attachments">
          <a
            v-for="att in message.attachments"
            :key="att.id"
            :href="att.url"
            target="_blank"
            rel="noopener"
          >
            <img v-if="att.thumb_url" :src="att.thumb_url" :alt="att.original_filename" />
            <span v-else>📄 {{ att.original_filename }}</span>
          </a>
        </div>
      </template>
      <div class="meta">
        <span class="time">{{ time }}</span>
        <span v-if="isPending" class="status">傳送中…</span>
        <button
          v-if="canRecall && isMine && !message.deleted && !isPending"
          class="recall"
          @click="emit('recall', message.id)"
        >撤回</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bubble-row { display: flex; margin-bottom: 6px; }
.bubble-row.mine { justify-content: flex-end; }
.bubble {
  max-width: 75%;
  padding: 8px 12px;
  border-radius: 12px;
  background: #f0f2f5;
  color: #2c3e50;
  font-size: 14px;
  line-height: 1.4;
}
.bubble-row.mine .bubble {
  background: #3f7d48;
  color: #fff;
}
.bubble.deleted { font-style: italic; opacity: 0.6; background: #f7f7f7 !important; color: #888 !important; }
.bubble.pending { opacity: 0.7; }
.body { white-space: pre-wrap; word-break: break-word; }
.attachments { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.attachments a img { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; }
.attachments a span { padding: 4px 8px; background: rgba(255,255,255,.2); border-radius: 4px; }
.meta { display: flex; gap: 8px; align-items: center; margin-top: 4px; font-size: 11px; opacity: 0.7; }
.bubble-row:not(.mine) .meta { color: #888; }
.recall { background: none; border: none; color: inherit; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 0; }
.status { font-style: italic; }
</style>
