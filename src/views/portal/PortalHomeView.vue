<script setup>
import { computed } from 'vue'
import { usePortalDashboard } from '@/composables/usePortalDashboard'
import PendingActionsCard from '@/components/portal/home/PendingActionsCard.vue'
import TodayShiftCard from '@/components/portal/home/TodayShiftCard.vue'
import ClassroomOpsCard from '@/components/portal/home/ClassroomOpsCard.vue'
import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

const { summary, loading, error, refresh } = usePortalDashboard()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早安'
  if (h < 14) return '中午好'
  if (h < 18) return '午安'
  return '晚安'
})

const me = computed(() => summary.value?.me || {})
const today = computed(() => summary.value?.today || {})
const classrooms = computed(() => summary.value?.classrooms || [])
const actions = computed(() => summary.value?.actions || {})
</script>

<template>
  <div class="portal-home">
    <header class="home-header">
      <div>
        <h2>{{ greeting }}，{{ me.name || '老師' }}</h2>
        <p class="sub">今日辛苦了 ✨</p>
      </div>
      <el-button :loading="loading" plain @click="refresh">重新整理</el-button>
    </header>

    <div v-if="error" class="error-banner">載入失敗：{{ error.message || '請稍後再試' }}</div>

    <div v-if="!summary && loading" class="loading-state">
      <div class="pt-shimmer skeleton-block" v-for="i in 3" :key="i"></div>
    </div>

    <template v-else-if="summary">
      <PendingActionsCard :actions="actions" />
      <TodayShiftCard :today="today" />

      <div class="classroom-section pt-stagger">
        <h3 class="pt-section-title">我的班級</h3>
        <p v-if="!classrooms.length" class="empty">您目前未綁定任何班級</p>
        <ClassroomOpsCard
          v-for="c in classrooms"
          :key="c.classroom_id"
          :card="c"
        />
      </div>

      <QuickLinksCard />
    </template>
  </div>
</template>

<style scoped>
.portal-home {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 1100px;
  margin: 0 auto;
}

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-2);
}
.home-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--pt-text-strong);
}
.home-header .sub {
  margin: 4px 0 0;
  color: var(--pt-text-muted);
  font-size: var(--text-sm);
}

.error-banner {
  padding: var(--space-3);
  background: var(--color-danger-lighter);
  color: var(--color-danger);
  border-radius: var(--radius-md);
}

.loading-state { display: flex; flex-direction: column; gap: var(--space-3); }
.skeleton-block {
  height: 120px;
  border-radius: var(--radius-md);
}

.classroom-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.empty {
  color: var(--pt-text-muted);
  text-align: center;
  padding: var(--space-6);
}
</style>
