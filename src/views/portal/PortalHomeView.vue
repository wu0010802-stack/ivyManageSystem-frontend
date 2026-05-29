<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Warning } from '@element-plus/icons-vue'
import { usePortalDashboard } from '@/composables/usePortalDashboard'
import { getMyLeaveQuotaExpiry } from '@/api/portalLeaveQuotaExpiry'
import PendingActionsCard from '@/components/portal/home/PendingActionsCard.vue'
import TodayShiftCard from '@/components/portal/home/TodayShiftCard.vue'
import ClassroomOpsCard from '@/components/portal/home/ClassroomOpsCard.vue'
import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

const { summary, loading, error, refresh } = usePortalDashboard()

interface LeaveQuotaExpiryInfo {
  compensatory_balance: number
  earliest_expiring_grant: { expires_at: string; unexpired_hours: number } | null
  next_anniversary: string | null
  expected_payout_month: string | null
}

const leaveQuotaInfo = ref<LeaveQuotaExpiryInfo | null>(null)
const leaveQuotaLoading = ref(false)

const loadLeaveQuotaExpiry = async () => {
  leaveQuotaLoading.value = true
  try {
    const res = await getMyLeaveQuotaExpiry()
    leaveQuotaInfo.value = res.data as LeaveQuotaExpiryInfo
  } catch (e) {
    leaveQuotaInfo.value = null
  } finally {
    leaveQuotaLoading.value = false
  }
}

onMounted(loadLeaveQuotaExpiry)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早安'
  if (h < 14) return '中午好'
  if (h < 18) return '午安'
  return '晚安'
})

interface DashboardSummary { me?: Record<string, unknown>; today?: Record<string, unknown>; classrooms?: Record<string, unknown>[]; actions?: Record<string, unknown>; message?: string }
const summaryData = summary as import('vue').Ref<DashboardSummary | null>
const me = computed(() => summaryData.value?.me || {})
const today = computed(() => summaryData.value?.today || {})
const classrooms = computed(() => summaryData.value?.classrooms || [])
const actions = computed(() => summaryData.value?.actions || {})
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

    <div v-if="error" class="error-banner">載入失敗：{{ (error as Record<string, unknown>).message || '請稍後再試' }}</div>

    <div v-if="!summary && loading" class="loading-state">
      <div class="pt-shimmer skeleton-block" v-for="i in 3" :key="i"></div>
    </div>

    <template v-else-if="summary">
      <PendingActionsCard :actions="actions" />
      <TodayShiftCard :today="today" />

      <el-card v-if="leaveQuotaInfo" class="leave-quota-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>補休結餘</span>
          </div>
        </template>
        <div class="leave-quota-content">
          <div class="balance">
            <span class="number">{{ leaveQuotaInfo.compensatory_balance.toFixed(1) }}</span>
            <span class="unit">h</span>
          </div>
          <div v-if="leaveQuotaInfo.earliest_expiring_grant" class="warning-row">
            <el-icon><Warning /></el-icon>
            <span>
              最早到期：{{ leaveQuotaInfo.earliest_expiring_grant.expires_at }}
              （{{ leaveQuotaInfo.earliest_expiring_grant.unexpired_hours.toFixed(1) }}h）
            </span>
          </div>
          <div v-if="leaveQuotaInfo.next_anniversary" class="info-row">
            下個週年：{{ leaveQuotaInfo.next_anniversary }}
          </div>
          <div v-if="leaveQuotaInfo.expected_payout_month" class="info-row">
            下個結算月：{{ leaveQuotaInfo.expected_payout_month }}
            <span class="hint">（未休將自動折算工資）</span>
          </div>
          <div class="history-link-row">
            <router-link to="/portal/leave-history" class="history-link">查看詳細歷史 →</router-link>
          </div>
        </div>
      </el-card>

      <div class="classroom-section pt-stagger">
        <h3 class="pt-section-title">我的班級</h3>
        <p v-if="!classrooms.length" class="empty">您目前未綁定任何班級</p>
        <ClassroomOpsCard
          v-for="c in classrooms"
          :key="(c.classroom_id as PropertyKey)"
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

/* 補休結餘 widget */
.leave-quota-card {
  border-radius: var(--radius-md);
}
.leave-quota-card .card-header {
  font-weight: 600;
  color: var(--pt-text-strong);
}
.leave-quota-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.balance {
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.balance .number {
  font-size: var(--text-3xl, 1.875rem);
  font-weight: 700;
  color: var(--pt-text-strong);
}
.balance .unit {
  font-size: var(--text-lg, 1.125rem);
  color: var(--pt-text-muted);
}
.warning-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-warning, #e6a23c);
  font-size: var(--text-sm);
}
.info-row {
  font-size: var(--text-sm);
  color: var(--pt-text-muted);
}
.hint {
  color: var(--pt-text-muted);
}
.history-link-row {
  margin-top: var(--space-1);
}
.history-link {
  font-size: var(--text-sm);
  color: var(--el-color-primary);
  text-decoration: none;
}
.history-link:hover {
  text-decoration: underline;
}
</style>
