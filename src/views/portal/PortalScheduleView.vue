<script setup lang="ts">
import { ref, reactive, computed, toRef, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMySchedule, getSwapRequests, getSwapCandidates, createSwapRequest, respondToSwap, cancelSwapRequest } from '@/api/portal'
import { apiError } from '@/utils/error'
import { useScheduleCalendar } from '@/composables/useScheduleCalendar'
import ScheduleMonthHeader from './components/schedule/ScheduleMonthHeader.vue'
import ScheduleCalendarGrid from './components/schedule/ScheduleCalendarGrid.vue'
import ScheduleSwapTable from './components/schedule/ScheduleSwapTable.vue'
import ScheduleSwapDialog from './components/schedule/ScheduleSwapDialog.vue'

const loading = ref(false)

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

interface DayObj { day?: number; date: string; is_weekend?: boolean; shift_name?: string; work_start?: string; work_end?: string; is_override?: boolean; [key: string]: unknown }
interface SwapRequest { is_mine?: boolean; id?: number; [key: string]: unknown }
interface SwapCandidate { employee_id?: number; name?: string; shift_name?: string; work_start?: string; work_end?: string; has_pending_swap?: boolean; [key: string]: unknown }

// Schedule data
const scheduleData = ref<{ days: { date: string; day: number; weekday?: string }[] } | null>(null)

// Swap requests
const swapRequests = ref<SwapRequest[]>([])
const swapLoading = ref(false)

// Create swap dialog
const showSwapDialog = ref(false)
const swapInitialDate = ref('')
const swapSubmitLoading = ref(false)
const candidates = ref<SwapCandidate[]>([])
const candidatesLoading = ref(false)

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

// ============ Calendar (composable) ============
const { calendarWeeks, isToday, isFutureDate } = useScheduleCalendar(
  scheduleData,
  toRef(query, 'year'),
  toRef(query, 'month'),
)

// ============ 行動裝置偵測 ============
const isMobile = ref(false)
let mqList: MediaQueryList | null = null
const onMqChange = (e: MediaQueryListEvent) => { isMobile.value = e.matches }

// ============ Day Detail BottomSheet（mobile only）============
const showDaySheet = ref(false)
const selectedDay = ref<DayObj | null>(null)

const onCellClick = (day: DayObj) => {
  if (!day || !isMobile.value) return
  selectedDay.value = day
  showDaySheet.value = true
}

const onSwapClick = (day: DayObj) => {
  openSwapDialog(day.date)
}

const selectedDayLabel = computed(() => {
  const d = selectedDay.value
  if (!d?.date) return ''
  const [, m, dd] = d.date.split('-')
  const w = WEEKDAY_NAMES[new Date(d.date).getDay()]
  return `${m}/${dd}（星期${w}）`
})

const canSwapSelected = computed(() => {
  const d = selectedDay.value
  if (!d) return false
  return !!d.shift_name && isFutureDate(d.date ?? '') && !d.is_weekend
})

const swapDisabledReason = computed(() => {
  const d = selectedDay.value
  if (!d) return ''
  if (!d.shift_name) return '此日無排班，不需申請換班'
  if (d.is_weekend) return '週末無排班，不需申請換班'
  if (!isFutureDate(d.date ?? '')) return '換班僅限今日（含）之後的日期'
  return ''
})

const swapFromSheet = () => {
  if (!selectedDay.value) return
  showDaySheet.value = false
  openSwapDialog(selectedDay.value.date ?? '')
}

// ============ Fetch Schedule ============
const fetchSchedule = async () => {
  loading.value = true
  try {
    const res = await getMySchedule({ year: query.year, month: query.month })
    scheduleData.value = res.data as { days: { date: string; day: number; weekday?: string }[] }
  } catch (error) {
    ElMessage.error('載入排班失敗')
  } finally {
    loading.value = false
  }
}

// ============ Swap Requests ============
const fetchSwapRequests = async () => {
  swapLoading.value = true
  try {
    const res = await getSwapRequests()
    swapRequests.value = res.data
  } catch {
    ElMessage.error('載入換班申請失敗')
  } finally {
    swapLoading.value = false
  }
}

const receivedRequests = computed(() =>
  swapRequests.value.filter(r => !r.is_mine)
)
const sentRequests = computed(() =>
  swapRequests.value.filter(r => r.is_mine)
)

// ============ Create Swap ============
const openSwapDialog = (dateStr: string) => {
  swapInitialDate.value = dateStr || ''
  candidates.value = []
  showSwapDialog.value = true
  if (dateStr) {
    fetchCandidates(dateStr)
  }
}

const fetchCandidates = async (dateStr: string) => {
  candidatesLoading.value = true
  try {
    const res = await getSwapCandidates({ date: dateStr })
    // codegen 型別 work_start/work_end 為 string | null，本元件 SwapCandidate 用 ?: string；narrow 對齊。
    candidates.value = res.data as SwapCandidate[]
  } catch {
    ElMessage.error('載入候選老師失敗')
  } finally {
    candidatesLoading.value = false
  }
}

const submitSwap = async (payload: { swap_date: string; target_id: number | null; reason: string }) => {
  // 後端 SwapRequestCreate.target_id 為必填，缺對象不可送出。
  if (payload.target_id == null) {
    ElMessage.error('請選擇換班對象')
    return
  }
  swapSubmitLoading.value = true
  try {
    await createSwapRequest({
      target_id: payload.target_id,
      swap_date: payload.swap_date,
      reason: payload.reason,
    })
    ElMessage.success('換班申請已送出')
    showSwapDialog.value = false
    fetchSwapRequests()
  } catch (error) {
    ElMessage.error(apiError(error, '送出失敗'))
  } finally {
    swapSubmitLoading.value = false
  }
}

// ============ Respond / Cancel ============
const respondSwap = async (id: number, action: string) => {
  const label = action === 'accept' ? '接受' : '拒絕'
  try {
    await ElMessageBox.confirm(`確定要${label}此換班申請？`, '確認', { type: 'warning' })
    await respondToSwap(id, action)
    ElMessage.success(`已${label}換班申請`)
    fetchSwapRequests()
    fetchSchedule()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    if (e !== 'cancel') {
      ElMessage.error(err.response?.data?.detail || `${label}失敗`)
    }
  }
}

const cancelSwap = async (id: number) => {
  try {
    await ElMessageBox.confirm('確定要撤銷此換班申請？', '確認', { type: 'warning' })
    await cancelSwapRequest(id)
    ElMessage.success('已撤銷')
    fetchSwapRequests()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    if (e !== 'cancel') {
      ElMessage.error(err.response?.data?.detail || '撤銷失敗')
    }
  }
}

// ============ Month Navigation ============
const changeMonth = (offset: number) => {
  let y = query.year
  let m = query.month + offset
  if (m > 12) { m = 1; y++ }
  if (m < 1) { m = 12; y-- }
  query.year = y
  query.month = m
  fetchSchedule()
}

onMounted(() => {
  fetchSchedule()
  fetchSwapRequests()
  mqList = window.matchMedia('(max-width: 767px)')
  isMobile.value = mqList.matches
  mqList.addEventListener('change', onMqChange)
})

onUnmounted(() => {
  mqList?.removeEventListener('change', onMqChange)
})
</script>

<template>
  <div class="schedule-page">
    <h2>我的排班</h2>

    <!-- Month Navigation + CTA -->
    <el-card class="control-panel">
      <div class="controls">
        <ScheduleMonthHeader
          :year="query.year"
          :month="query.month"
          @prev="changeMonth(-1)"
          @next="changeMonth(1)"
        />
        <div class="spacer" />
        <el-button type="primary" class="ctrl-btn ctrl-btn--cta" @click="openSwapDialog('')">發起換班</el-button>
      </div>
    </el-card>

    <!-- Calendar Grid -->
    <el-card v-loading="loading" class="calendar-card">
      <ScheduleCalendarGrid
        :weeks="calendarWeeks"
        :is-today="isToday"
        :is-future-date="isFutureDate"
        :is-mobile="isMobile"
        @cell-click="onCellClick"
        @swap-click="onSwapClick"
      />
    </el-card>

    <!-- Swap Requests -->
    <el-card class="swap-section">
      <template #header>
        <div class="swap-header">
          <span>換班申請</span>
        </div>
      </template>
      <ScheduleSwapTable
        :received-requests="receivedRequests"
        :sent-requests="sentRequests"
        :loading="swapLoading"
        @respond="respondSwap"
        @cancel="cancelSwap"
      />
    </el-card>

    <!-- Day Detail BottomSheet（mobile only）-->
    <el-drawer
      v-model="showDaySheet"
      direction="btt"
      size="auto"
      :title="selectedDayLabel"
      :with-header="true"
    >
      <div class="day-sheet" v-if="selectedDay">
        <div class="day-sheet__row">
          <span class="day-sheet__label">班別</span>
          <span class="day-sheet__val">{{ selectedDay.shift_name || '無排班' }}</span>
        </div>
        <div class="day-sheet__row" v-if="selectedDay.work_start">
          <span class="day-sheet__label">時間</span>
          <span class="day-sheet__val">{{ selectedDay.work_start }} ~ {{ selectedDay.work_end }}</span>
        </div>
        <div class="day-sheet__row" v-if="selectedDay.is_override">
          <span class="day-sheet__label">狀態</span>
          <el-tag size="small" type="warning" effect="plain">調班</el-tag>
        </div>

        <div class="day-sheet__actions">
          <el-button
            type="primary"
            size="large"
            class="day-sheet__cta"
            :disabled="!canSwapSelected"
            @click="swapFromSheet"
          >申請換班</el-button>
          <p v-if="!canSwapSelected" class="day-sheet__hint">{{ swapDisabledReason }}</p>
        </div>
      </div>
    </el-drawer>

    <!-- Swap Dialog（mobile: TeacherBottomSheet; desktop: el-dialog）-->
    <ScheduleSwapDialog
      v-model="showSwapDialog"
      :is-mobile="isMobile"
      :initial-date="swapInitialDate"
      :candidates="candidates"
      :candidates-loading="candidatesLoading"
      :loading="swapSubmitLoading"
      @date-change="fetchCandidates"
      @submit="submitSwap"
    />
  </div>
</template>

<style scoped>
.schedule-page h2 {
  margin-bottom: var(--space-4);
}

.control-panel {
  margin-bottom: var(--space-4);
}

.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.ctrl-btn {
  min-height: var(--touch-target-min);
  padding-left: var(--space-4);
  padding-right: var(--space-4);
}

.spacer {
  flex: 1;
}

/* Calendar Grid */
.calendar-card {
  margin-bottom: var(--space-4);
}

/* ===== Day Detail BottomSheet ===== */
.day-sheet {
  padding: 0 var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.day-sheet__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-color-light, #ebeef5);
}

.day-sheet__row:last-of-type {
  border-bottom: none;
}

.day-sheet__label {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.day-sheet__val {
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
  font-size: var(--text-base);
}

.day-sheet__actions {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.day-sheet__cta {
  width: 100%;
  min-height: var(--touch-target-min);
}

.day-sheet__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  text-align: center;
}

/* Swap Section */
.swap-section {
  margin-bottom: var(--space-4);
}

.swap-header {
  font-weight: 600;
}

/* Mobile */
@media (max-width: 767px) {
  .controls {
    justify-content: center;
  }

  .spacer {
    display: none;
  }
}
</style>
