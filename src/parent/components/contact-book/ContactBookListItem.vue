<script setup lang="ts">
import { computed } from 'vue'
import MoodBadge from './MoodBadge.vue'
import ParentIcon from '../ParentIcon.vue'

interface ContactBookEntry {
  log_date?: string
  my_acknowledged_at?: string | null
  mood?: string | null
  photos?: unknown[]
  teacher_note?: string
  learning_highlight?: string
}

const props = defineProps<{
  entry: ContactBookEntry
}>()

const isUnread = computed<boolean>(() => !props.entry?.my_acknowledged_at)
const photoCount = computed<number>(() => (props.entry?.photos || []).length)

const dateLabel = computed<string>(() => {
  const raw = props.entry?.log_date
  if (!raw) return ''
  const [y, m, d] = raw.split('-')
  return `${Number(m)}/${Number(d)}`
})
const weekdayLabel = computed<string>(() => {
  const raw = props.entry?.log_date
  if (!raw) return ''
  const [y, m, d] = raw.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`
})

const previewText = computed<string>(() => {
  const t = props.entry?.teacher_note || props.entry?.learning_highlight
  if (!t) return '老師尚未填寫留言'
  return t.length > 40 ? t.slice(0, 40) + '…' : t
})
</script>

<template>
  <div class="item" :class="{ unread: isUnread }">
    <div class="date-col">
      <div class="day-num">{{ dateLabel }}</div>
      <div class="weekday">{{ weekdayLabel }}</div>
    </div>
    <MoodBadge :mood="entry.mood" size="sm" />
    <div class="body">
      <p class="preview" :class="{ 'is-empty': !entry?.teacher_note && !entry?.learning_highlight }">{{ previewText }}</p>
      <div v-if="photoCount > 0" class="meta">
        <ParentIcon name="camera" size="xs" />
        <span>{{ photoCount }} 張</span>
      </div>
    </div>
    <span v-if="isUnread" class="unread-dot" aria-label="未簽收" />
    <ParentIcon v-else name="chevron-right" size="sm" />
  </div>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--pt-surface-card, #fff);
  border-bottom: 1px solid var(--pt-border-light, #ecf5f9);
  text-decoration: none;
  color: inherit;
  transition: background 160ms ease;
}
.item:hover { background: var(--pt-surface-mute-soft, #fefcf3); }
.item:active { background: var(--cream, #fffcf2); }
.item:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: -2px;
}

.date-col {
  flex: 0 0 44px;
  text-align: center;
}
.day-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1;
}
.weekday {
  margin-top: 2px;
  font-size: 11px;
  color: var(--pt-text-muted);
  letter-spacing: 0.04em;
}

.body {
  flex: 1;
  min-width: 0;
}
.preview {
  margin: 0;
  font-size: 14px;
  color: var(--pt-text-body);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview.is-empty {
  color: var(--pt-text-faint);
  font-style: italic;
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--pt-text-faint);
}

.unread-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--coral-500, #ff8b8b);
  flex-shrink: 0;
}
.item.unread .preview {
  color: var(--pt-text-strong);
  font-weight: 500;
}
</style>
