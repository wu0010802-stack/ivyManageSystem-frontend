<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

interface PendingActions {
  pending_substitute?: number
  pending_swap?: number
  pending_anomaly_confirms?: number
  /** 最早一筆待確認異常所在年月；badge 統計全期間、異常頁一次只看一個月，
   *  沒有它就無從把老師帶到看得到那筆異常的月份 */
  pending_anomaly_earliest?: { year: number; month: number } | null
  unread_announcements?: number
  [key: string]: unknown
}

const props = defineProps<{
  actions: PendingActions
}>()

const router = useRouter()

// 帶上最早待確認月份，否則點進去固定看當月、舊的異常永遠找不到，badge 也消不掉
const anomalyTarget = computed(() => {
  const e = props.actions?.pending_anomaly_earliest
  return e ? `/portal/anomalies?year=${e.year}&month=${e.month}` : '/portal/anomalies'
})

const items = computed(() => [
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
    to: anomalyTarget.value,
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

function go(to: string) {
  router.push(to)
}
</script>

<template>
  <div class="pt-card pending-actions">
    <h3 class="card-title">今日待辦</h3>
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

.tint-leave { background: var(--pt-tint-leave); color: var(--pt-tint-leave-fg); }
.tint-calendar { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.tint-announcement { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }

.tile-label {
  font-size: var(--text-sm);
  color: var(--pt-text-muted);
}
</style>
