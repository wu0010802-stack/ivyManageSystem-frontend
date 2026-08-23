<template>
  <div class="so-timeline" data-test="signoff-timeline">
    <p v-if="loading" class="so-timeline__hint">載入異動紀錄…</p>
    <p v-else-if="!events.length" class="so-timeline__hint">尚無異動紀錄</p>
    <ol v-else class="so-timeline__list">
      <li v-for="ev in events" :key="ev.id" class="so-timeline__item">
        <span class="so-timeline__dot" aria-hidden="true" />
        <div class="so-timeline__body">
          <span class="so-timeline__action">{{ actionLabel(ev.action) }}</span>
          <span v-if="ev.actor_name" class="so-timeline__actor">{{ ev.actor_name }}</span>
          <span class="so-timeline__time">{{ formatTime(ev.created_at) }}</span>
          <p v-if="ev.note" class="so-timeline__note">{{ ev.note }}</p>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
export interface SignoffEvent {
  id: number
  action: string
  from_status?: string | null
  to_status?: string | null
  note?: string | null
  actor_name?: string | null
  created_at?: string | null
}

defineProps<{
  events: SignoffEvent[]
  loading?: boolean
}>()

const ACTION_LABELS: Record<string, string> = {
  create: '建立單據',
  update: '編輯內容',
  submit: '送出審核',
  approve: '核准',
  reject: '駁回',
  settle: '確認收付',
  reconcile: '完成對帳',
  mark_exception: '標記異常',
  sign: '附上憑證',
  delete: '刪除',
}

const actionLabel = (a: string) => ACTION_LABELS[a] ?? a

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}
</script>

<style scoped>
.so-timeline__hint {
  margin: 0;
  font-size: var(--text-sm, 13px);
  color: var(--text-tertiary, var(--neutral-400));
}
.so-timeline__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.so-timeline__item {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: baseline;
}
.so-timeline__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--neutral-300);
  transform: translateY(-1px);
}
.so-timeline__body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2, 8px);
  font-size: var(--text-sm, 13px);
}
.so-timeline__action {
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary, var(--neutral-800));
}
.so-timeline__actor {
  color: var(--text-secondary, var(--neutral-500));
}
.so-timeline__time {
  color: var(--text-tertiary, var(--neutral-400));
  font-size: var(--text-xs, 12px);
  font-variant-numeric: tabular-nums;
}
.so-timeline__note {
  flex-basis: 100%;
  margin: 0;
  color: var(--text-secondary, var(--neutral-500));
}
</style>
