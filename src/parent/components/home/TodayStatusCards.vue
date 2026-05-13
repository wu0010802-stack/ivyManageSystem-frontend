<script setup>
/**
 * 家長首頁今日狀態卡片組（attendance / leave / medication / dismissal）。
 *
 * 接 useTodayStatusCache（SWR + BroadcastChannel + visibility 觸發）。
 * 不接 props — 自含資料源 + 顯示邏輯。
 * 透過 defineExpose 對外暴露 refresh，給 HomeView 重試流程使用。
 */
import { onMounted, computed } from 'vue'
import { useTodayStatusCache } from '@/parent/composables/useTodayStatusCache'
import ParentIcon from '@/parent/components/ParentIcon.vue'

const { status, refresh } = useTodayStatusCache()

onMounted(() => {
  refresh()
})

const todayChildren = computed(() => status.value?.children || [])

// 接送狀態文案：對應後端 status (pending/acknowledged/completed)
function dismissalLabel(d) {
  if (!d) return null
  if (d.status === 'pending') return '老師處理中'
  if (d.status === 'acknowledged') return '老師已收到，孩子準備中'
  if (d.status === 'completed') return '已接送'
  return d.status
}

defineExpose({ refresh })
</script>

<template>
  <section v-if="todayChildren.length > 0" class="today-section">
    <div class="pt-section-head">
      <h3 class="pt-section-title">今日狀態</h3>
    </div>
    <div v-for="c in todayChildren" :key="c.student_id" class="today-card">
      <div class="today-row">
        <span class="today-avatar">{{ String(c.name || '孩').slice(0, 1) }}</span>
        <span class="today-copy">
          <span class="today-name">{{ c.name }}</span>
          <span v-if="c.classroom_name" class="today-class">{{ c.classroom_name }}</span>
        </span>
      </div>
      <div class="chips">
        <span v-if="c.attendance" class="chip chip-attendance">
          <ParentIcon name="check" size="xs" />
          {{ c.attendance.status }}
        </span>
        <span v-else class="chip chip-muted">尚未到校</span>
        <span v-if="c.leave" class="chip chip-leave">
          <ParentIcon name="clipboard" size="xs" />
          {{ c.leave.type }}
        </span>
        <span v-if="c.medication?.has_order" class="chip chip-med">
          <ParentIcon name="pill" size="xs" />
          用藥 {{ c.medication.order_count }} 次
        </span>
        <span v-if="c.dismissal" class="chip chip-pickup">
          <ParentIcon name="pickup" size="xs" />
          {{ dismissalLabel(c.dismissal) }}
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================
 * 今日狀態
 * ========================================================== */
.today-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.today-card {
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
  border: 1px solid var(--pt-page-border, var(--pt-border));
}
.today-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.today-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)));
  color: var(--brand-primary);
  font-size: 16px;
  font-weight: 900;
  flex-shrink: 0;
}
.today-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.today-name {
  font-size: var(--text-base, 15px);
  font-weight: 800;
  color: var(--pt-text-strong);
}
.today-class {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-placeholder);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 12px);
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--pt-surface-mute);
  color: var(--pt-text-muted);
  font-weight: 700;
}
.chip-attendance { background: var(--color-success-soft); color: var(--pt-success-text); }
.chip-leave      { background: var(--color-warning-soft); color: var(--pt-warning-text); }
.chip-med        { background: var(--pt-violet-bg); color: var(--pt-violet-text); }
.chip-pickup     { background: var(--color-info-soft); color: var(--pt-info-text); }
.chip-muted      { background: var(--pt-surface-mute-warm); color: var(--pt-text-placeholder); }
</style>
