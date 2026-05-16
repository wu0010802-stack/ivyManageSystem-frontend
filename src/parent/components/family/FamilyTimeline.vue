<script setup>
import SkeletonBlock from '../SkeletonBlock.vue'

defineProps({
  items: { type: Array, required: true },
  loading: { type: Boolean, default: false },
})

const ICONS = {
  attendance: '📅',
  announcement: '📢',
  contact_book: '📒',
  event_ack: '✍',
  medication: '💊',
  leave_review: '📋',
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  // 24h 內顯示時刻、之外顯示 MM/DD
  const now = new Date()
  const within24h = (now.getTime() - d.getTime()) < 24 * 3600 * 1000
  if (within24h) {
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <section class="family-timeline" aria-labelledby="family-timeline-title">
    <header class="header">
      <h2 id="family-timeline-title" class="title">今日／最近</h2>
    </header>

    <div v-if="loading" data-testid="timeline-skeleton" class="skeleton">
      <SkeletonBlock variant="row" />
      <SkeletonBlock variant="row" />
      <SkeletonBlock variant="row" />
    </div>

    <p v-else-if="items.length === 0" class="empty">目前沒有最新動態</p>

    <ul v-else class="list">
      <li v-for="it in items" :key="it.id" class="row">
        <router-link :to="it.href" class="row-link">
          <span class="icon" aria-hidden="true">{{ ICONS[it.kind] || '•' }}</span>
          <span class="meta">
            <span class="title-line">
              {{ it.title }}
              <span v-if="it.is_pending" class="pending-dot" aria-label="未處理"></span>
            </span>
            <span v-if="it.subtitle" class="sub">{{ it.subtitle }}</span>
          </span>
          <span class="time">{{ fmtTime(it.occurred_at) }}</span>
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.family-timeline {
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  box-shadow: var(--pt-elev-1);
}
.title { font-size: var(--text-base, 15px); font-weight: var(--font-weight-semibold, 600); margin: 0 0 var(--space-3, 12px); }
.skeleton { display: flex; flex-direction: column; gap: var(--space-2, 8px); }
.empty { color: var(--pt-text-muted); margin: 0; }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-1, 4px); }
.row-link {
  display: flex; align-items: center; gap: var(--space-3, 12px);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) var(--space-2, 8px);
  border-radius: var(--radius-md, 10px);
  text-decoration: none; color: inherit;
}
.row-link:active { background: var(--brand-primary-soft); }
.icon { font-size: 22px; flex: 0 0 28px; text-align: center; }
.meta { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.title-line {
  display: inline-flex; align-items: center; gap: var(--space-1, 4px);
  font-weight: var(--font-weight-semibold, 600);
}
.sub { color: var(--pt-text-muted); font-size: var(--text-xs, 11px); }
.time { color: var(--pt-text-placeholder); font-size: var(--text-xs, 11px); font-variant-numeric: tabular-nums; }
.pending-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-danger);
  display: inline-block;
}
</style>
