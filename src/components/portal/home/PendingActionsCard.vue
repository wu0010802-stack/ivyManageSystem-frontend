<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  actions: { type: Object, required: true },
})

const router = useRouter()

const items = computed(() => [
  {
    key: 'unread_messages',
    label: '待回覆訊息',
    count: props.actions?.unread_messages || 0,
    to: '/portal/messages',
    tint: 'message',
  },
  {
    key: 'pending_substitute',
    label: '待回應代理',
    count: props.actions?.pending_substitute || 0,
    to: '/portal/leave',
    tint: 'leave',
  },
  {
    key: 'pending_swap',
    label: '待回應換班',
    count: props.actions?.pending_swap || 0,
    to: '/portal/schedule',
    tint: 'calendar',
  },
  {
    key: 'pending_anomaly_confirms',
    label: '異常待確認',
    count: props.actions?.pending_anomaly_confirms || 0,
    to: '/portal/anomalies',
    tint: 'announcement',
  },
  {
    key: 'unread_announcements',
    label: '未讀公告',
    count: props.actions?.unread_announcements || 0,
    to: '/portal/announcements',
    tint: 'announcement',
  },
])

function go(to) {
  router.push(to)
}
</script>

<template>
  <div class="pt-card pending-actions">
    <h3 class="card-title">待辦事項</h3>
    <div class="action-grid">
      <button
        v-for="item in items"
        :key="item.key"
        class="action-tile press-scale"
        :class="{ 'is-empty': item.count === 0 }"
        @click="go(item.to)"
      >
        <span class="tile-count" :class="`tint-${item.tint}`">{{ item.count }}</span>
        <span class="tile-label">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pending-actions {
  padding: var(--space-4);
}

.card-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--pt-text-strong);
  margin: 0 0 var(--space-3);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-3);
}

.action-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  background: var(--pt-surface-mute);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.action-tile:hover {
  background: var(--pt-surface-mute-soft);
}

.action-tile.is-empty {
  opacity: 0.85;
}

.tile-count {
  font-size: 24px;
  font-weight: 700;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.tint-message { background: var(--pt-tint-message); color: var(--pt-tint-message-fg); }
.tint-leave { background: var(--pt-tint-leave); color: var(--pt-tint-leave-fg); }
.tint-calendar { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.tint-announcement { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }

.tile-label {
  font-size: var(--text-sm);
  color: var(--pt-text-muted);
}
</style>
