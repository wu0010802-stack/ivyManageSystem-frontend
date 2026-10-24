<script setup lang="ts">
import { ref, reactive, computed, toRef, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMySchedule, getSwapRequests, createSwapRequest, respondToSwap, cancelSwapRequest } from '@/api/portal'
import { apiError } from '@/utils/error'
import { useScheduleCalendar } from '@/composables/useScheduleCalendar'
import { useSwapCandidates } from '@/composables/useSwapCandidates'
import { useIsMobile } from '@/composables/useIsMobile'
import ScheduleMonthHeader from './components/schedule/ScheduleMonthHeader.vue'
import ScheduleCalendarGrid from './components/schedule/ScheduleCalendarGrid.vue'
import ScheduleSwapTable from './components/schedule/ScheduleSwapTable.vue'
import ScheduleSwapDialog from './components/schedule/ScheduleSwapDialog.vue'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'

const loading = ref(false)

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

interface DayObj { day?: number; date: string; is_weekend?: boolean; shift_name?: string; work_start?: string; work_end?: string; is_override?: boolean; is_holiday?: boolean; holiday_name?: string | null; [key: string]: unknown }
interface SwapRequest { is_mine?: boolean; id?: number; [key: string]: unknown }

// Schedule data
const scheduleData = ref<{ days: { date: string; day: number; weekday?: string }[] } | null>(null)

// Swap requests
const swapRequests = ref<SwapRequest[]>([])
const swapLoading = ref(false)

// Create swap dialog
const showSwapDialog = ref(false)
const swapInitialDate = ref('')
const swapSubmitLoading = ref(false)
const { candidates, loading: candidatesLoading, load: loadCandidates, clear: clearCandidates } = useSwapCandidates()

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

// 過去日期（或今天已打卡）不直接改班表，而是建「補登」確認項目，對方同意後由行政套用（SPEC-026 3-3）
const SWAP_SENT_MESSAGE = '換班申請已送出'
const BACKDATED_SENT_MESSAGE = '已送出補登，等對方同意後由行政套用；可在「出勤確認」查看'
const BACKDATED_SHEET_HINT = '過去日期會以補登方式送出'

// ============ Calendar (composable) ============
const { calendarWeeks, isToday, isFutureDate } = useScheduleCalendar(
  scheduleData,
  toRef(query, 'year'),
  toRef(query, 'month'),
)

// ============ 行動裝置偵測 ============
const { isMobile } = useIsMobile()

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
  return !!d.shift_name && !d.is_weekend && !d.is_holiday
})

// 抽屜底下的說明：不能換的原因；能換但日期已過則提醒會走補登
const swapSheetHint = computed(() => {
  const d = selectedDay.value
  if (!d) return ''
  if (d.is_holiday) return `${d.holiday_name || '國定假日'}：國定假日不需申請換班`
  if (!d.shift_name) return '此日無排班，不需申請換班'
  if (d.is_weekend) return '週末無排班，不需申請換班'
  if (!isFutureDate(d.date ?? '')) return BACKDATED_SHEET_HINT
  return ''
})

const swapFromSheet = () => {
  if (!selectedDay.value) return
  showDaySheet.value = false
  openSwapDialog(selectedDay.value.date ?? '')
}

// ============ Fetch Schedule ============
// request-sequence guard（比照 PortalAttendanceView）：換月後在途的舊月回應晚到不得蓋掉目前月份，
// 否則日期錯位、換班鈕送出舊月日期（QA #23）
let fetchSeq = 0
const fetchSchedule = async () => {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const res = await getMySchedule({ year: query.year, month: query.month })
    if (seq !== fetchSeq) return
    scheduleData.value = res.data as { days: { date: string; day: number; weekday?: string }[] }
  } catch (error) {
    if (seq !== fetchSeq) return
    ElMessage.error('載入排班失敗')
  } finally {
    if (seq === fetchSeq) loading.value = false
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
  clearCandidates()
  showSwapDialog.value = true
  if (dateStr) {
    fetchCandidates(dateStr)
  }
}

const fetchCandidates = async (dateStr: string) => {
  // 候選與同事當日職務一起抓（SPEC-026 T5）；職務名單失敗只是少了加註，候選失敗才提示。
  const ok = await loadCandidates(dateStr)
  if (!ok) ElMessage.error('載入候選老師失敗')
}

const submitSwap = async (payload: { swap_date: string; target_id: number | null; reason: string }) => {
  // 後端 SwapRequestCreate.target_id 為必填，缺對象不可送出。
  if (payload.target_id == null) {
    ElMessage.error('請選擇換班對象')
    return
  }
  swapSubmitLoading.value = true
  try {
    const res = await createSwapRequest({
      target_id: payload.target_id,
      swap_date: payload.swap_date,
      reason: payload.reason,
    })
    // 是否改走補登由後端判斷（含「今天已打卡」），以 response.mode 為準
    ElMessage.success(res.data.mode === 'backdated' ? BACKDATED_SENT_MESSAGE : SWAP_SENT_MESSAGE)
    showSwapDialog.value = false
    fetchSwapRequests()
  } catch (error) {
    ElMessage.error(apiError(error, '送出失敗'))
  } finally {
    swapSubmitLoading.value = false
  }
}

// ============ Respond / Cancel ============
// 確認框被取消／關閉不是錯誤；API 失敗才提示。失敗後一律重抓列表：
// 例如接受時換班日已過（409），後端已把申請轉「已取消」，列表要跟著更新。
const confirmed = (message: string) =>
  ElMessageBox.confirm(message, '確認', { type: 'warning' }).then(
    () => true,
    () => false,
  )

const respondSwap = async (id: number, action: string) => {
  const label = action === 'accept' ? '接受' : '拒絕'
  if (!(await confirmed(`確定要${label}此換班申請？`))) return
  try {
    await respondToSwap(id, action)
    ElMessage.success(`已${label}換班申請`)
    fetchSwapRequests()
    fetchSchedule()
  } catch (error) {
    ElMessage.error(apiError(error, `${label}失敗`))
    fetchSwapRequests()
  }
}

const cancelSwap = async (id: number) => {
  if (!(await confirmed('確定要撤銷此換班申請？'))) return
  try {
    await cancelSwapRequest(id)
    ElMessage.success('已撤銷')
    fetchSwapRequests()
  } catch (error) {
    ElMessage.error(apiError(error, '撤銷失敗'))
    fetchSwapRequests()
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
  // 換月先清空：新月還沒到之前不顯示舊月的格子（點了會拿舊月日期去換班）
  scheduleData.value = null
  fetchSchedule()
}

onMounted(() => {
  fetchSchedule()
  fetchSwapRequests()
})
</script>

<template>
  <div class="schedule-page">
    <PortalPageHeader title="我的排班" />

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
          <p v-if="swapSheetHint" class="day-sheet__hint">{{ swapSheetHint }}</p>
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
@media (--to-sm) {
  .controls {
    justify-content: center;
  }

  .spacer {
    display: none;
  }
}
</style>
