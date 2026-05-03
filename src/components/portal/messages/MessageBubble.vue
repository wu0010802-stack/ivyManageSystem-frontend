<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: { type: Object, required: true },
  ownRole: { type: String, default: 'teacher' },
})

const emit = defineEmits(['recall'])

const isOwn = computed(() => props.message.sender_role === props.ownRole)
const time = computed(() => {
  const iso = props.message.created_at
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const canRecall = computed(() => {
  if (!isOwn.value || props.message.deleted) return false
  if (!props.message.created_at) return false
  const created = new Date(props.message.created_at).getTime()
  return Date.now() - created < 30 * 60 * 1000
})
</script>

<template>
  <div class="bubble-row" :class="{ own: isOwn }">
    <div class="bubble" :class="{ own: isOwn, deleted: message.deleted }">
      <p v-if="message.deleted" class="body deleted-text">（訊息已撤回）</p>
      <p v-else class="body">{{ message.body }}</p>

      <div v-if="message.attachments?.length" class="attachments">
        <a
          v-for="att in message.attachments"
          :key="att.id"
          :href="att.url"
          target="_blank"
          rel="noopener"
          class="attachment"
        >
          📎 {{ att.original_filename || '附件' }}
        </a>
      </div>

      <div class="meta">
        <span>{{ time }}</span>
        <span v-if="message._pending" class="pending-mark">送出中…</span>
        <button v-if="canRecall" class="recall-btn" @click="emit('recall', message.id)">撤回</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bubble-row { display: flex; margin-bottom: var(--space-3); }
.bubble-row.own { justify-content: flex-end; }

.bubble {
  max-width: 75%;
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg);
  padding: var(--space-2) var(--space-3);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
}

.bubble.own {
  background: var(--color-primary-lighter);
  border-color: rgba(79, 70, 229, 0.15);
}

.bubble.deleted .body { color: var(--pt-text-muted); font-style: italic; }

.body {
  margin: 0 0 var(--space-1);
  color: var(--pt-text-strong);
  white-space: pre-wrap;
  font-size: var(--text-base);
  line-height: 1.5;
}

.attachments {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-1);
}

.attachment {
  font-size: var(--text-xs);
  color: var(--pt-info-link, var(--color-primary));
  text-decoration: none;
}
.attachment:hover { text-decoration: underline; }

.meta {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
  margin-top: var(--space-1);
}
.pending-mark { color: var(--color-warning); }
.recall-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-danger);
  font-size: var(--text-xs);
  padding: 0;
}
</style>
