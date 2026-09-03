<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Warning, ArrowRight } from '@element-plus/icons-vue'
import { usePortalDashboard } from '@/composables/usePortalDashboard'
import { getMyLeaveQuotaExpiry } from '@/api/portalLeaveQuotaExpiry'
import { getTodayHub } from '@/api/portalClassHub'
import PendingActionsCard from '@/components/portal/home/PendingActionsCard.vue'
import TodayFocusCard from '@/components/portal/home/TodayFocusCard.vue'
import ClassroomOpsCard from '@/components/portal/home/ClassroomOpsCard.vue'
import QuickLinksCard from '@/components/portal/home/QuickLinksCard.vue'

const { summary, loading, error, refresh } = usePortalDashboard()
const router = useRouter()

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

// ===== Phase 2 任務流首頁：班級工作台摘要（現在該做置頂卡） =====
interface HubSummary {
  classroom_id?: number
  classroom_name?: string
  sticky_next?: Record<string, unknown> | null
  counts?: Record<string, number>
  [key: string]: unknown
}

const hub = ref<HubSummary | null>(null)

const loadHub = async () => {
  try {
    const data = (await getTodayHub()) as HubSummary
    // classroom_id=0＝未綁班（class-hub 同語意）；403/錯誤走 catch。兩者都隱藏置頂卡
    hub.value = data && data.classroom_id ? data : null
  } catch {
    hub.value = null
  }
}

function onFocusJump(deepLink?: string) {
  router.push(deepLink || '/portal/class-hub')
}

function openHub() {
  router.push('/portal/class-hub')
}

const doRefresh = () => {
  refresh()
  loadHub()
  loadLeaveQuotaExpiry()
}

onMounted(() => {
  loadLeaveQuotaExpiry()
  loadHub()
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早安'
  if (h < 14) return '中午好'
  if (h < 18) return '午安'
  return '晚安'
})

interface DashboardSummary { me?: Record<string, unknown>; today?: Record<string, unknown>; classrooms?: Record<string, unknown>[]; classrooms_hint?: string | null; actions?: Record<string, unknown>; message?: string }
const summaryData = summary as import('vue').Ref<DashboardSummary | null>
const me = computed(() => summaryData.value?.me || {})
const today = computed(() => summaryData.value?.today || {})
const classrooms = computed(() => summaryData.value?.classrooms || [])
const actions = computed(() => summaryData.value?.actions || {})
const classroomsHint = computed(() => summaryData.value?.classrooms_hint || '')

// 「姓名（工號·職稱）」——與管理端教師下拉同一組辨識欄位，老師才能逐字核對
// 人事指派到的是不是自己這一筆。
const myIdentity = computed(() => {
  const name = (me.value.name as string) || ''
  if (!name) return ''
  const extras = [me.value.employee_no, me.value.position]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
  return extras.length > 0 ? `${name}（${extras.join('·')}）` : name
})

// ===== Hero：日期／班次／打卡（原 TodayShiftCard 內容併入） =====
interface TodayShift { name?: string; work_start?: string; work_end?: string }
interface TodayAttendance { punch_in_at?: string | null; punch_out_at?: string | null; is_anomaly?: boolean }

const dateLabel = computed(() => {
  const iso = today.value?.date as string | undefined
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（週${w}）`
})

const shiftLabel = computed(() => {
  const s = today.value?.shift as TodayShift | null | undefined
  if (!s) return '今日無班次'
  return `${s.name}（${s.work_start || '—'}–${s.work_end || '—'}）`
})

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const attendance = computed(() => (today.value?.attendance as TodayAttendance | null | undefined) || {})
const punchInLabel = computed(() => formatTime(attendance.value?.punch_in_at))
const punchOutLabel = computed(() => formatTime(attendance.value?.punch_out_at))
const isAnomaly = computed(() => Boolean(attendance.value?.is_anomaly))
</script>

<template>
  <div class="portal-home">
    <header class="home-hero">
      <div class="home-hero__top">
        <div>
          <h2 class="home-hero__greeting">{{ greeting }}，{{ me.name || '老師' }}</h2>
          <p class="home-hero__sub">
            <template v-if="dateLabel">{{ dateLabel }}・</template>{{ shiftLabel }}
          </p>
        </div>
        <button
          type="button"
          class="home-hero__refresh"
          :disabled="loading"
          aria-label="重新整理"
          @click="doRefresh"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
            <path d="M18.5 2.5v4h-4" />
          </svg>
        </button>
      </div>
      <button type="button" class="home-hero__punch" @click="router.push('/portal/attendance')">
        <svg class="home-hero__punch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
        <span class="home-hero__punch-text">上班 {{ punchInLabel }}｜下班 {{ punchOutLabel }}</span>
        <span v-if="isAnomaly" class="home-hero__punch-anomaly">出勤異常</span>
        <svg class="home-hero__punch-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.5 6.5 15 12l-5.5 5.5" />
        </svg>
      </button>
    </header>

    <div v-if="error" class="error-banner">載入失敗：{{ (error as Record<string, unknown>).message || '請稍後再試' }}</div>

    <TodayFocusCard
      v-if="hub"
      :next="hub.sticky_next"
      :counts="hub.counts"
      :classroom-name="hub.classroom_name"
      @jump="onFocusJump"
      @open-hub="openHub"
    />

    <div v-if="!summary && loading" class="loading-state">
      <div class="pt-shimmer skeleton-block" v-for="i in 3" :key="i"></div>
    </div>

    <template v-else-if="summary">
      <PendingActionsCard :actions="actions" />

      <!-- 與同頁 PendingActionsCard／QuickLinksCard 同一套 pt-card 語彙（原本獨自用 el-card + header 分隔線） -->
      <section v-if="leaveQuotaInfo" class="pt-card leave-quota-card">
        <h3 class="card-title">補休結餘</h3>
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
            <router-link to="/portal/leave-history" class="history-link">
              查看詳細歷史<el-icon aria-hidden="true"><ArrowRight /></el-icon>
            </router-link>
          </div>
        </div>
      </section>

      <div class="classroom-section pt-stagger">
        <h3 class="pt-section-title">我的班級</h3>
        <div v-if="!classrooms.length" class="empty">
          <p>您目前未綁定任何班級</p>
          <!-- 空班級時附上身分與後端診斷提示：同名員工在系統裡是兩筆不同資料，
               老師看得到自己的工號才有辦法跟人事核對指派對象（2026-08-14 實例）。 -->
          <p v-if="myIdentity" class="empty-identity">目前身分：{{ myIdentity }}</p>
          <p v-if="classroomsHint" class="empty-hint">{{ classroomsHint }}</p>
        </div>
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

/* ===== Hero（Phase 2 任務流首頁）===== */
.home-hero {
  background: var(--pt-gradient-portal);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.home-hero__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
}

.home-hero__greeting {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: #ffffff;
}

.home-hero__sub {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: var(--text-sm);
}

.home-hero__refresh {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--radius-lg);
  color: #ffffff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.home-hero__refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

.home-hero__refresh svg {
  width: 20px;
  height: 20px;
}

.home-hero__refresh:focus-visible,
.home-hero__punch:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.home-hero__punch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-3) var(--space-4);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--radius-lg);
  color: #ffffff;
  font-family: inherit;
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.home-hero__punch-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.home-hero__punch-text {
  flex: 1 1 auto;
  text-align: left;
}

.home-hero__punch-anomaly {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 700;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: #fef3c7;
  color: #b45309;
}

.home-hero__punch-chev {
  width: 16px;
  height: 16px;
  opacity: 0.7;
  flex-shrink: 0;
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

.empty-identity {
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
}

.empty-hint {
  margin-top: var(--space-2);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  text-align: left;
  max-width: 34rem;
  margin-inline: auto;
}

/* 補休結餘 widget */
.leave-quota-card {
  padding: var(--space-4);
}
.leave-quota-card .card-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-base);
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
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-sm);
  color: var(--el-color-primary);
  text-decoration: none;
}
.history-link:hover {
  text-decoration: underline;
}
</style>
