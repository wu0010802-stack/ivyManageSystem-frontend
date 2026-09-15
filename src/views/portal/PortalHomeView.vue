<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Warning, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { usePortalDashboard } from '@/composables/usePortalDashboard'
import { usePortalClassHub } from '@/composables/usePortalClassHub'
import { usePortalDismissalAlerts } from '@/composables/usePortalDismissalAlerts'
import { getMyLeaveQuotaExpiry } from '@/api/portalLeaveQuotaExpiry'
import { getPortalPickupPendingCount } from '@/api/portal'
import { getMeasurementsLatest } from '@/api/portalMeasurements'
import PortalBatchMeasurementSheet from '@/components/portal/sheets/PortalBatchMeasurementSheet.vue'
import TodayFocusCard from '@/components/portal/home/TodayFocusCard.vue'
import ClassroomOpsCard from '@/components/portal/home/ClassroomOpsCard.vue'
import {
  visibleClassFeatures,
  resolveFeatureBadge,
  type ClassFeatureDef,
  type ClassFeatureGroup,
  type PortalPendingActions,
} from '@/constants/portalClassFeatures'
import type { PortalHubCounts } from '@/utils/portalHubCounts'

const { summary, loading, error, refresh } = usePortalDashboard()
const router = useRouter()
const route = useRoute()

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

// ===== 班級工作台（原 /portal/class，2026-09-14 併入首頁）=====
// 「現在該做」置頂卡與下方功能格的數字都取自這一份。整併前首頁與班級頁各自
// 打一次 getTodayHub，現在合成同一個 composable：只打一次，而且首頁順帶拿到
// 原本只有班級頁才有的 60 秒輪詢、切回前景重抓與切班能力。
interface HubSummary {
  classroom_id?: number
  classroom_name?: string
  sticky_next?: Record<string, unknown> | null
  counts?: Record<string, number>
  [key: string]: unknown
}

// null = 用後端解析的預設班（head > assistant > art）
const classroomId = ref<number | null>(null)
const { data: hubData, error: hubError, refresh: refreshHub } = usePortalClassHub(classroomId)

// classroom_id=0＝未綁班（class-hub 同語意）；403／載入失敗時 data 仍是 null。
// 三者都隱藏置頂卡與班級列，但**不影響功能格**——格子是靜態清單，沒有 hub
// 資料只是不掛數字。首頁對全體 portal 使用者開放，沒帶班的行政同仁本來就會
// 拿到 403，不該因此看到錯誤狀態或失去所有入口。
const hub = computed<HubSummary | null>(() => {
  const d = hubData.value as HubSummary | null
  return d && d.classroom_id ? d : null
})

// 只在「使用者主動切班」後失敗才提示；首次載入（沒帶班的行政同仁預設拿
// 403）維持原本靜默。切班失敗不是本來就該預期的狀態，完全不提示會讓老師
// 以為自己點錯，或誤以為畫面已經切過去（composable 已把 data 清空，
// 但不主動告知就等於沒發生過）。
let switchAttempted = false
watch(hubError, (e) => {
  if (!e || !switchAttempted) return
  switchAttempted = false
  ElMessage.error('切換班級失敗，請重新選擇或稍後再試')
})

function onFocusJump(deepLink?: string) {
  // deep_link 可能是存量推播的 /portal/class-hub?sheet=medication&id=，
  // 由 router 的永久 redirect 接住；沒有 deep link 就捲到下方功能格。
  if (deepLink) {
    router.push(deepLink)
    return
  }
  scrollToFeatures()
}

function openHub() {
  scrollToFeatures()
}

const featuresEl = ref<HTMLElement | null>(null)

function scrollToFeatures() {
  featuresEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const doRefresh = () => {
  refresh()
  refreshHub().catch(() => {})
  loadLeaveQuotaExpiry()
  loadPickupCount()
}

onMounted(() => {
  loadLeaveQuotaExpiry()
  refreshLastBatchDate()
  loadPickupCount()
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

// ===== 功能格（原 /portal/class 的兩組，加上承接首頁三張卡的「我的」組）=====

const { pendingCount: dismissalPendingCount } = usePortalDismissalAlerts()
const pickupPendingCount = ref(0)

async function loadPickupCount() {
  try {
    const { data: res } = await getPortalPickupPendingCount()
    pickupPendingCount.value = (res as { count?: number })?.count || 0
  } catch (_) {
    pickupPendingCount.value = 0
  }
}

const GROUPS: { id: ClassFeatureGroup; title: string }[] = [
  { id: 'teach', title: '教學' },
  { id: 'manage', title: '管理' },
  { id: 'mine', title: '我的' },
]

function featuresOf(group: ClassFeatureGroup): ClassFeatureDef[] {
  return visibleClassFeatures(group)
}

const badgeSources = computed(() => ({
  counts: (hubData.value?.counts ?? null) as PortalHubCounts | null,
  actions: actions.value as PortalPendingActions,
  dismissal: dismissalPendingCount.value,
  pickup: pickupPendingCount.value,
}))

function badgeOf(f: ClassFeatureDef): number {
  return resolveFeatureBadge(f, badgeSources.value)
}

// 帶上最早待確認月份，否則點進去固定看當月、舊的異常永遠找不到，badge 也消不掉。
const anomalyTarget = computed(() => {
  const e = (actions.value as PortalPendingActions).pending_anomaly_earliest as
    | { year: number; month: number }
    | null
    | undefined
  return e ? `/portal/anomalies?year=${e.year}&month=${e.month}` : '/portal/anomalies'
})

function onFeatureClick(f: ClassFeatureDef) {
  if (f.action === 'measurement') {
    measurementSheetOpen.value = true
    return
  }
  if (f.key === 'anomalies') {
    router.push(anomalyTarget.value)
    return
  }
  if (!f.to) return
  // 會讀 ?classroom_id= 的目的頁要帶上當前班級，否則多班老師切了班再點進去，
  // 目的頁會落回它自己的第一班（誤寫聯絡簿、誤點名）。
  const id = hub.value?.classroom_id
  if (f.classroomScoped && id) {
    router.push({ path: f.to, query: { classroom_id: id } })
    return
  }
  router.push(f.to)
}

// ── 全班量體位抽屜（無獨立頁，只有抽屜）──
const measurementSheetOpen = ref(false)
const lastBatchMeasuredOn = ref<string | null>(null)

async function refreshLastBatchDate() {
  try {
    const { data: latestData } = await getMeasurementsLatest()
    const dates = (latestData as { last_measurement?: { measured_on?: string } }[])
      .map((r) => r.last_measurement?.measured_on)
      .filter((d): d is string => Boolean(d))
      .sort()
    lastBatchMeasuredOn.value = dates.length > 0 ? dates[dates.length - 1] : null
  } catch (_) {
    lastBatchMeasuredOn.value = null
  }
}

function captionOf(f: ClassFeatureDef): string {
  if (f.action === 'measurement') {
    return lastBatchMeasuredOn.value ? `上次 ${lastBatchMeasuredOn.value}` : '尚未量測'
  }
  return ''
}

function onMeasurementDone() {
  refreshLastBatchDate()
}

// 深連結：桌機側欄「全班量體位」與存量通知都靠 ?sheet=measurement 進來。
// immediate 讓直接貼網址也有效；已在本頁時 push 只改 query 不重掛元件，
// 沒有這個 watch 抽屜就不會開。
watch(
  () => route.query.sheet,
  (name) => {
    const key = Array.isArray(name) ? name[0] : name
    if (key === 'measurement') measurementSheetOpen.value = true
  },
  { immediate: true },
)

// 抽屜關閉要把 URL 上的 ?sheet=measurement 清掉，否則第二次點側欄同一項時
// query 沒變化、上面的 watch 不會觸發，抽屜就再也開不了。用 replace 避免多留
// 一筆瀏覽紀錄；保留 query 裡其他參數（例如 classroom_id）。
watch(measurementSheetOpen, (open) => {
  if (open) return
  if (route.query.sheet === undefined) return
  const query = { ...route.query }
  delete query.sheet
  router.replace({ query })
})

// ── 班級切換（多班教師）──
interface ClassroomOption {
  classroom_id?: number
  classroom_name?: string
  student_count?: number
  [key: string]: unknown
}

// 沒有 classroom_id 的項目無法作為切換選項（el-option 的 value 不接受 undefined），
// 先濾掉再收斂型別。
const classroomOptions = computed(() =>
  (classrooms.value as ClassroomOption[]).filter(
    (c): c is ClassroomOption & { classroom_id: number } =>
      typeof c.classroom_id === 'number',
  ),
)
const showSwitch = computed(() => classroomOptions.value.length > 1)
const selectedClassroomId = computed(() => hub.value?.classroom_id)
const classroomName = computed(() => hub.value?.classroom_name || '')
const studentCount = computed(() => {
  const id = hub.value?.classroom_id
  const hit = classroomOptions.value.find((c) => c.classroom_id === id)
  return hit?.student_count ?? null
})

function onSwitchClassroom(id: number) {
  classroomId.value = id
  switchAttempted = true
  // 主動觸發一次（composable 內部的 watch(classroomId) 也會觸發，但 key
  // 相同會被 inflight 去重共用同一個 promise，不會打兩次 API）：
  // 藉由這個 promise 的 settle 結果，知道要不要在成功時歸位旗標——
  // 失敗時旗標交由上面 watch(hubError) 歸位，兩者互斥、不會漏歸位。
  refreshHub()
    .then(() => {
      switchAttempted = false
    })
    .catch(() => {})
}

watch(
  () => route.query.classroom_id,
  (raw) => {
    const v = Array.isArray(raw) ? raw[0] : raw
    const parsed = v == null ? null : Number(v)
    classroomId.value = Number.isFinite(parsed) ? (parsed as number) : null
  },
  { immediate: true },
)
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

    <!-- 功能格：原 /portal/class 整頁（教學／管理）＋承接首頁三張卡的「我的」組。
         刻意放在 summary 的載入分支之外——格子是靜態清單，沒有 summary 也該進得去，
         summary 只決定「我的」那組要不要掛數字。 -->
    <section ref="featuresEl" class="feature-section">
      <div class="class-bar">
        <div class="class-bar__title">
          <span class="class-bar__name">{{ classroomName || '班級功能' }}</span>
          <span v-if="studentCount != null" class="class-bar__meta">
            {{ studentCount }} 位學生
          </span>
        </div>
        <el-select
          v-if="showSwitch"
          data-test="classroom-switch"
          size="small"
          class="class-bar__switch"
          :model-value="selectedClassroomId"
          placeholder="切換班級"
          @change="onSwitchClassroom"
        >
          <el-option
            v-for="c in classroomOptions"
            :key="c.classroom_id"
            :label="c.classroom_name"
            :value="c.classroom_id"
          />
        </el-select>
      </div>

      <div v-for="g in GROUPS" :key="g.id" class="feature-group">
        <h3 class="group-title">{{ g.title }}</h3>
        <div class="feature-grid">
          <button
            v-for="f in featuresOf(g.id)"
            :key="f.key"
            type="button"
            class="feature-tile press-scale"
            :data-test="`feature-${f.key}`"
            @click="onFeatureClick(f)"
          >
            <span class="feature-label">{{ f.label }}</span>
            <span v-if="badgeOf(f) > 0" class="feature-badge">{{ badgeOf(f) }}</span>
            <span v-if="captionOf(f)" class="feature-caption">{{ captionOf(f) }}</span>
          </button>
        </div>
      </div>
    </section>

    <div v-if="!summary && loading" class="loading-state">
      <div class="pt-shimmer skeleton-block" v-for="i in 3" :key="i"></div>
    </div>

    <template v-else-if="summary">
      <!-- 與同頁功能格同一套 pt-card 語彙（原本獨自用 el-card + header 分隔線） -->
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

      <!-- 班級提醒：連續缺席／近期生日／過敏注意。原「我的班級」卡的四格 KPI
           已被上方功能格取代，但這三條提醒全系統只有這裡看得到，不能跟著刪。
           逐班各一張（標了班名），不隨上方的班級切換過濾——漏看過敏或連續缺席
           的代價比多看一張卡高。 -->
      <div class="classroom-section pt-stagger">
        <h3 class="pt-section-title">班級提醒</h3>
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
    </template>

    <PortalBatchMeasurementSheet
      v-model="measurementSheetOpen"
      @done="onMeasurementDone"
    />
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

/* ===== 功能格（自 /portal/class 搬入）===== */
.feature-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.class-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.class-bar__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.class-bar__name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.class-bar__meta {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}

.class-bar__switch {
  width: 10rem;
  max-width: 100%;
}

.feature-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.group-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin: 0;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-2);
}

.feature-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 64px;
  padding: var(--space-3);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
}
.feature-tile:hover {
  background: var(--el-fill-color-light);
}

.feature-label {
  font-size: var(--text-sm);
  color: var(--el-text-color-primary);
}

.feature-caption {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

.feature-badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-danger);
  color: var(--el-color-white);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
