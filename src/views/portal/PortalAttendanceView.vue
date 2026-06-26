<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Printer } from '@element-plus/icons-vue'
import { getAttendanceSheet, getAttendanceSheetPdf } from '@/api/portal'
import { openPdfInNewTab } from '@/utils/printPdfWindow'
import { getUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { useIsMobile } from '@/composables/useIsMobile'
import AttendanceMonthSticky from './components/attendance/AttendanceMonthSticky.vue'
import AttendanceStatsRow from './components/attendance/AttendanceStatsRow.vue'
import AttendanceCardsView from './components/attendance/AttendanceCardsView.vue'
import AttendanceTableView from './components/attendance/AttendanceTableView.vue'

const loading = ref(false)
const userInfo = getUserInfo()

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

interface DayEntry {
  day: number
  weekday?: string
  is_holiday?: boolean
  holiday_name?: string
  is_weekend?: boolean
  punch_in?: string | null
  punch_out?: string | null
  work_hours?: number | null
  is_late?: boolean
  late_minutes?: number
  is_early_leave?: boolean
  is_missing_punch_in?: boolean
  is_missing_punch_out?: boolean
  leave_type_label?: string
  shift_name?: string
  scheduled_start?: string
  scheduled_end?: string
  leave_requests?: Record<string, unknown>[]
  overtime_requests?: Record<string, unknown>[]
}
interface SheetData { employee_name?: string; summary?: Record<string, unknown>; days?: DayEntry[]; uses_shift?: boolean; [key: string]: unknown }
const sheetData = ref<SheetData | null>(null)
const viewMode = ref('table') // 'table' or 'cards'
const sheetCache = new Map() // key: 'YYYY-M'，唯讀 View 快取可永久保留

// Auto-detect mobile（immediate: true 保留原 onMounted 內 onResize() 初始同步）
const { isMobile } = useIsMobile()
watch(isMobile, (m) => {
  if (m && viewMode.value === 'table') viewMode.value = 'cards'
  if (!m && viewMode.value === 'cards') viewMode.value = 'table'
}, { immediate: true })

const fetchSheet = async (force = false) => {
  const key = `${query.year}-${query.month}`
  if (!force && sheetCache.has(key)) {
    sheetData.value = sheetCache.get(key)
    return
  }
  loading.value = true
  try {
    const res = await getAttendanceSheet({ year: query.year, month: query.month })
    // 後端缺 response_model，res.data 為 unknown，narrow 成本元件的 SheetData。
    const sheet = res.data as SheetData
    sheetData.value = sheet
    sheetCache.set(key, sheet)
  } catch (error) {
    ElMessage.error('載入失敗: ' + apiError(error, (error as Error)?.message ?? '錯誤'))
  } finally {
    loading.value = false
  }
}

const prevMonth = () => {
  if (query.month === 1) {
    query.year--
    query.month = 12
  } else {
    query.month--
  }
  fetchSheet()
}

const nextMonth = () => {
  if (query.month === 12) {
    query.year++
    query.month = 1
  } else {
    query.month++
  }
  fetchSheet()
}

// ===== Mobile sticky 月份 bar =====
// header-card 滑出 viewport 後再顯示，避免 sticky bar 與 header 同時出現重複資訊
const topSentinel = ref(null)
const showStickyBar = ref(false)
let stickyObserver: IntersectionObserver | null = null

const isViewingCurrentMonth = computed(() => {
  const t = new Date()
  return query.year === t.getFullYear() && query.month === (t.getMonth() + 1)
})

// isCurrentMonth：供 AttendanceMonthSticky prop 使用（與 isViewingCurrentMonth 同義）
const isCurrentMonth = computed(() => isViewingCurrentMonth.value)

const printSheet = async () => {
  await openPdfInNewTab({
    fetchBlob: async () => {
      const res = await getAttendanceSheetPdf({ year: query.year, month: query.month })
      return res.data
    },
    loadingText: '月考勤表載入中…',
    onError: (err) => {
      ElMessage.error(apiError(err, '載入考勤表 PDF 失敗'))
    },
  })
}

const scrollToToday = () => {
  if (!isViewingCurrentMonth.value) return
  const todayNum = new Date().getDate()
  // 從 AttendanceCardsView 渲染的 .day-card[data-day=N] 取 DOM
  const el = document.querySelector(`.day-card[data-day="${todayNum}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('day-card--highlight')
  setTimeout(() => el.classList.remove('day-card--highlight'), 1500)
}

onMounted(() => {
  fetchSheet()
  if ('IntersectionObserver' in window && topSentinel.value) {
    stickyObserver = new IntersectionObserver(
      ([entry]) => { showStickyBar.value = !entry.isIntersecting },
      { threshold: 0 },
    )
    stickyObserver.observe(topSentinel.value)
  }
})

onUnmounted(() => {
  stickyObserver?.disconnect()
})
</script>

<template>
  <div class="portal-attendance">
    <!-- Mobile sticky 月份 bar：header-card 滑出後顯示 -->
    <AttendanceMonthSticky
      :visible="showStickyBar && isMobile"
      :year="query.year"
      :month="query.month"
      :is-current-month="isCurrentMonth"
      @prev="prevMonth"
      @next="nextMonth"
      @today="scrollToToday"
    />

    <el-card class="header-card">
      <div class="sheet-header">
        <h2>我的出勤</h2>
        <div class="month-nav">
          <el-button :icon="ArrowLeft" circle class="month-nav__btn" aria-label="上個月" @click="prevMonth" />
          <span class="month-label">{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
          <el-button :icon="ArrowRight" circle class="month-nav__btn" aria-label="下個月" @click="nextMonth" />
          <el-button v-if="sheetData" :icon="Printer" @click="printSheet">列印</el-button>
        </div>
      </div>
      <div class="employee-info" v-if="sheetData">
        <span><strong>姓名：</strong>{{ sheetData.employee_name }}</span>
        <span><strong>職稱：</strong>{{ userInfo?.title || '-' }}</span>
        <span class="hide-mobile"><strong>考核日期：</strong>{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
      </div>
    </el-card>

    <!-- Sentinel: 觀察 header-card 是否仍在 viewport，控制 sticky bar 顯示 -->
    <div ref="topSentinel" class="top-sentinel" aria-hidden="true" />

    <!-- Summary Stats -->
    <el-card v-if="sheetData" class="summary-card">
      <h3>本月出勤統計</h3>
      <AttendanceStatsRow :summary="sheetData.summary || {}" />
    </el-card>

    <!-- ===== Table View (Desktop) ===== -->
    <el-card v-loading="loading" class="grid-card" v-if="viewMode === 'table'">
      <AttendanceTableView
        v-if="sheetData"
        :days="sheetData.days || []"
        :uses-shift="sheetData.uses_shift || false"
      />
    </el-card>

    <!-- ===== Card View (Mobile) ===== -->
    <div v-if="viewMode === 'cards'" v-loading="loading" class="cards-wrapper">
      <AttendanceCardsView
        v-if="sheetData"
        :days="sheetData.days || []"
        :month="query.month"
      />
    </div>
  </div>
</template>

<style scoped>
.portal-attendance {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: var(--space-6);
  background-color: var(--surface-color);
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.sheet-header h2 {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text-primary);
}

.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.month-nav__btn {
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
}

/* ===== Mobile Sticky sentinel ===== */
.top-sentinel {
  height: 1px;
  margin-top: calc(var(--space-6) * -1);
}

.month-label {
  font-size: var(--text-xl);
  font-weight: 600;
  min-width: 140px;
  text-align: center;
  color: var(--text-primary);
}

.employee-info {
  display: flex;
  gap: var(--space-8);
  font-size: var(--text-base);
  color: var(--text-secondary);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}

.summary-card h3 {
  margin: 0 0 var(--space-5) 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.grid-card {
  margin-bottom: var(--space-6);
  overflow-x: auto;
}

.cards-wrapper {
  margin-bottom: var(--space-6);
}

@keyframes day-card-flash {
  0%, 100% {
    box-shadow: var(--shadow-sm);
  }
  50% {
    box-shadow: 0 0 0 3px var(--color-primary, var(--color-info));
  }
}

.day-card.day-card--highlight {
  animation: day-card-flash 1.5s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .day-card.day-card--highlight {
    animation: none;
    box-shadow: 0 0 0 3px var(--color-primary, var(--color-info));
  }
}

/* ===== Mobile responsive ===== */
@media (--to-sm) {
  .sheet-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .sheet-header h2 {
    font-size: var(--text-2xl);
  }

  .month-label {
    font-size: var(--text-lg);
    min-width: 120px;
  }

  .employee-info {
    flex-direction: column;
    gap: 8px;
    padding-top: 0;
    border-top: none;
  }

  .hide-mobile {
    display: none;
  }

  .summary-card h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-3);
  }
}
</style>
