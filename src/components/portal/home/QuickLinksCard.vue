<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const links = [
  { label: '班級學生', to: '/portal/students', tint: 'message' },
  { label: '課堂觀察', to: '/portal/observations', tint: 'event' },
  { label: '用藥執行', to: '/portal/medications', tint: 'medication' },
  { label: '事件紀錄', to: '/portal/incidents', tint: 'announcement' },
  { label: '學期評量', to: '/portal/assessments', tint: 'contact' },
  { label: '才藝點名', to: { path: '/portal/activity', query: { tab: 'attendance' } }, tint: 'activity' },
]

function go(to) {
  router.push(to)
}
</script>

<template>
  <div class="pt-card quick-links">
    <h3 class="card-title">快速進入</h3>
    <div class="link-grid">
      <button
        v-for="l in links"
        :key="l.label"
        class="link-tile press-scale"
        @click="go(l.to)"
      >
        <span class="tile-dot" :class="`tint-${l.tint}`"></span>
        <span class="tile-label">{{ l.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.quick-links { padding: var(--space-4); }
.card-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--pt-text-strong);
  margin: 0 0 var(--space-3);
}

.link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-2);
}

.link-tile {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--pt-surface-mute);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.link-tile:hover { background: var(--pt-surface-mute-soft); }

.tile-dot {
  width: 10px; height: 10px; border-radius: 50%;
}
.tint-message { background: var(--pt-tint-message-fg); }
.tint-event { background: var(--pt-tint-event-fg); }
.tint-medication { background: var(--pt-tint-medication-fg); }
.tint-announcement { background: var(--pt-tint-announcement-fg); }
.tint-contact { background: var(--pt-tint-contact-fg); }
.tint-activity { background: var(--pt-tint-activity-fg); }

.tile-label {
  font-size: var(--text-sm);
  color: var(--pt-text-strong);
}
</style>
