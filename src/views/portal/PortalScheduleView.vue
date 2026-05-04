<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMySchedule, getSwapRequests, getSwapCandidates, createSwapRequest, respondToSwap, cancelSwapRequest } from '@/api/portal'
import { getUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'

const loading = ref(false)
const userInfo = getUserInfo()

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

// Schedule data
const scheduleData = ref(null)

// Swap requests
const swapRequests = ref([])
const swapTab = ref('received') // 'received' | 'sent'
const swapLoading = ref(false)

// Create swap dialog
const showSwapDialog = ref(false)
const swapForm = reactive({
  date: '',
  target_id: null,
  reason: '',
})
const candidates = ref([])
const candidatesLoading = ref(false)

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

// ============ 行動裝置偵測 ============
// mobile 上點 calendar cell 改開 BottomSheet（cell 太小無法塞 link button）；
// desktop 維持原本 cell 內 link button 直接開換班 dialog。
const isMobile = ref(false)
let mqList = null
const onMqChange = (e) => { isMobile.value = e.matches }

// ============ Day Detail BottomSheet（mobile only）============
const showDaySheet = ref(false)
const selectedDay = ref(null)

const onCellClick = (day) => {
  if (!day || !isMobile.value) return
  selectedDay.value = day
  showDaySheet.value = true
}

const selectedDayLabel = computed(() => {
  const d = selectedDay.value
  if (!d) return ''
  const [, m, dd] = d.date.split('-')
  const w = WEEKDAY_NAMES[new Date(d.date).getDay()]
  return `${m}/${dd}（星期${w}）`
})

const canSwapSelected = computed(() => {
  const d = selectedDay.value
  if (!d) return false
  return !!d.shift_name && isFutureDate(d.date) && !d.is_weekend
})

const swapDisabledReason = computed(() => {
  const d = selectedDay.value
  if (!d) return ''
  if (!d.shift_name) return '此日無排班，不需申請換班'
  if (d.is_weekend) return '週末無排班，不需申請換班'
  if (!isFutureDate(d.date)) return '換班僅限今日（含）之後的日期'
  return ''
})

const swapFromSheet = () => {
  if (!selectedDay.value) return
  showDaySheet.value = false
  openSwapDialog(selectedDay.value.date)
}

// ============ Fetch Schedule ============
const fetchSchedule = async () => {
  loading.value = true
  try {
    const res = await getMySchedule({ year: query.year, month: query.month })
    scheduleData.value = res.data
  } catch (error) {
    ElMessage.error('載入排班失敗')
  } finally {
    loading.value = false
  }
}

// ============ Calendar Helpers ============
const calendarWeeks = computed(() => {
  if (!scheduleData.value) return []
  const days = scheduleData.value.days
  const firstDate = new Date(query.year, query.month - 1, 1)
  const startWeekday = firstDate.getDay() // 0=Sun

  // Pad beginning
  const padded = []
  for (let i = 0; i < startWeekday; i++) {
    padded.push(null)
  }
  for (const d of days) {
    padded.push(d)
  }
  // Pad end to complete week
  while (padded.length % 7 !== 0) {
    padded.push(null)
  }

  const weeks = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }
  return weeks
})

// 預計算今日字串與午夜時間戳，避免 isToday/isFutureDate 每次 render 重建 Date 物件
const _todayStr = (() => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
})()
const _todayMidnight = new Date(new Date().setHours(0, 0, 0, 0))

const isToday = (day) => !!day && day.date === _todayStr
const isFutureDate = (dateStr) => dateStr >= _todayStr

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

const statusTagType = (status) => {
  return { pending: 'warning', accepted: 'success', rejected: 'danger', cancelled: 'info' }[status] || 'info'
}

const statusLabel = (status) => {
  return { pending: '待回覆', accepted: '已接受', rejected: '已拒絕', cancelled: '已撤銷' }[status] || status
}

// ============ Create Swap ============
const openSwapDialog = (dateStr) => {
  swapForm.date = dateStr || ''
  swapForm.target_id = null
  swapForm.reason = ''
  candidates.value = []
  showSwapDialog.value = true
  if (dateStr) {
    fetchCandidates(dateStr)
  }
}

const fetchCandidates = async (dateStr) => {
  candidatesLoading.value = true
  try {
    const res = await getSwapCandidates({ date: dateStr })
    candidates.value = res.data
  } catch {
    ElMessage.error('載入候選老師失敗')
  } finally {
    candidatesLoading.value = false
  }
}

const onSwapDateChange = (val) => {
  swapForm.target_id = null
  candidates.value = []
  if (val) fetchCandidates(val)
}

const submitSwap = async () => {
  if (!swapForm.date || !swapForm.target_id) {
    ElMessage.warning('請選擇日期和換班對象')
    return
  }
  try {
    await createSwapRequest({
      target_id: swapForm.target_id,
      swap_date: swapForm.date,
      reason: swapForm.reason,
    })
    ElMessage.success('換班申請已送出')
    showSwapDialog.value = false
    fetchSwapRequests()
  } catch (error) {
    ElMessage.error(apiError(error, '送出失敗'))
  }
}

// ============ Respond / Cancel ============
const respondSwap = async (id, action) => {
  const label = action === 'accept' ? '接受' : '拒絕'
  try {
    await ElMessageBox.confirm(`確定要${label}此換班申請？`, '確認', { type: 'warning' })
    await respondToSwap(id, action)
    ElMessage.success(`已${label}換班申請`)
    fetchSwapRequests()
    fetchSchedule()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.detail || `${label}失敗`)
    }
  }
}

const cancelSwap = async (id) => {
  try {
    await ElMessageBox.confirm('確定要撤銷此換班申請？', '確認', { type: 'warning' })
    await cancelSwapRequest(id)
    ElMessage.success('已撤銷')
    fetchSwapRequests()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.detail || '撤銷失敗')
    }
  }
}

// ============ Month Navigation ============
const changeMonth = (offset) => {
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

    <!-- Month Navigation -->
    <el-card class="control-panel">
      <div class="controls">
        <el-button class="ctrl-btn" @click="changeMonth(-1)">上月</el-button>
        <span class="month-label">{{ query.year }} 年 {{ query.month }} 月</span>
        <el-button class="ctrl-btn" @click="changeMonth(1)">下月</el-button>
        <div class="spacer" />
        <el-button type="primary" class="ctrl-btn ctrl-btn--cta" @click="openSwapDialog('')">發起換班</el-button>
      </div>
    </el-card>

    <!-- Calendar Grid -->
    <el-card v-loading="loading" class="calendar-card">
      <div class="calendar-grid">
        <div class="calendar-header">
          <div v-for="d in ['日','一','二','三','四','五','六']" :key="d" class="calendar-header-cell">{{ d }}</div>
        </div>
        <div v-for="(week, wi) in calendarWeeks" :key="wi" class="calendar-row">
          <div
            v-for="(day, di) in week"
            :key="di"
            class="calendar-cell"
            :class="{
              'is-today': isToday(day),
              'is-weekend': day && day.is_weekend,
              'has-shift': day && day.shift_name,
              'no-shift': day && !day.shift_name && !day.is_weekend,
              'is-empty': !day,
              'is-tappable': isMobile && day,
            }"
            :role="isMobile && day ? 'button' : undefined"
            :tabindex="isMobile && day ? 0 : undefined"
            @click="onCellClick(day)"
            @keydown.enter="onCellClick(day)"
          >
            <template v-if="day">
              <div class="cell-day">{{ day.day }}</div>
              <div class="cell-shift" v-if="day.shift_name">
                {{ day.shift_name }}
              </div>
              <div class="cell-time" v-if="day.work_start">
                {{ day.work_start }}~{{ day.work_end }}
              </div>
              <div class="cell-override" v-if="day.is_override">
                <el-tag size="small" type="warning" effect="plain">調班</el-tag>
              </div>
              <el-button
                v-if="day.shift_name && isFutureDate(day.date) && !day.is_weekend"
                size="small"
                type="primary"
                link
                class="cell-swap-btn"
                @click.stop="openSwapDialog(day.date)"
              >換班</el-button>
            </template>
          </div>
        </div>
      </div>
    </el-card>

    <!-- Swap Requests -->
    <el-card class="swap-section">
      <template #header>
        <div class="swap-header">
          <span>換班申請</span>
        </div>
      </template>

      <el-tabs v-model="swapTab">
        <el-tab-pane label="收到的申請" name="received">
          <div style="overflow-x: auto">
          <el-table :data="receivedRequests" v-loading="swapLoading" empty-text="目前沒有收到的換班申請">
            <el-table-column prop="swap_date" label="換班日期" width="120" />
            <el-table-column prop="requester_name" label="申請人" width="100" />
            <el-table-column label="對方班別" width="100">
              <template #default="{ row }">{{ row.requester_shift }}</template>
            </el-table-column>
            <el-table-column label="我的班別" width="100">
              <template #default="{ row }">{{ row.target_shift }}</template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
            <el-table-column label="狀態" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending'">
                  <el-button size="small" type="success" @click="respondSwap(row.id, 'accept')">接受</el-button>
                  <el-button size="small" type="danger" @click="respondSwap(row.id, 'reject')">拒絕</el-button>
                </template>
                <span v-else class="text-muted">--</span>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="我發起的" name="sent">
          <div style="overflow-x: auto">
          <el-table :data="sentRequests" v-loading="swapLoading" empty-text="目前沒有發起的換班申請">
            <el-table-column prop="swap_date" label="換班日期" width="120" />
            <el-table-column prop="target_name" label="對象" width="100" />
            <el-table-column label="我的班別" width="100">
              <template #default="{ row }">{{ row.requester_shift }}</template>
            </el-table-column>
            <el-table-column label="對方班別" width="100">
              <template #default="{ row }">{{ row.target_shift }}</template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
            <el-table-column label="狀態" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'pending'"
                  size="small"
                  type="warning"
                  @click="cancelSwap(row.id)"
                >撤銷</el-button>
                <span v-else class="text-muted">--</span>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
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

    <!-- Create Swap Dialog -->
    <el-dialog v-model="showSwapDialog" title="發起換班申請" width="500px">
      <el-form label-width="80px">
        <el-form-item label="換班日期">
          <el-date-picker
            v-model="swapForm.date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            :disabled-date="(d) => d < _todayMidnight"
            style="width: 100%"
            @change="onSwapDateChange"
          />
        </el-form-item>
        <el-form-item label="換班對象">
          <el-select
            v-model="swapForm.target_id"
            placeholder="選擇老師"
            style="width: 100%"
            :loading="candidatesLoading"
            :disabled="!swapForm.date"
          >
            <el-option
              v-for="c in candidates"
              :key="c.employee_id"
              :label="`${c.name} (${c.shift_name}${c.work_start ? ' ' + c.work_start + '~' + c.work_end : ''})`"
              :value="c.employee_id"
              :disabled="c.has_pending_swap"
            >
              <span>{{ c.name }}</span>
              <span style="float: right; color: var(--text-secondary); font-size: 12px">
                {{ c.shift_name }}
                <span v-if="c.has_pending_swap" style="color: var(--el-color-danger)">(已有換班)</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="swapForm.reason" type="textarea" :rows="2" placeholder="選填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSwapDialog = false">取消</el-button>
        <el-button type="primary" @click="submitSwap">送出申請</el-button>
      </template>
    </el-dialog>
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

.month-label {
  font-size: var(--text-lg);
  font-weight: 600;
  min-width: 140px;
  text-align: center;
}

.spacer {
  flex: 1;
}

/* Calendar Grid */
.calendar-card {
  margin-bottom: var(--space-4);
}

.calendar-grid {
  overflow-x: auto;
}

.calendar-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  margin-bottom: 1px;
}

.calendar-header-cell {
  text-align: center;
  font-weight: 600;
  padding: var(--space-2);
  background: var(--bg-color);
  color: var(--text-secondary);
  font-size: var(--text-sm, 13px);
}

.calendar-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

.calendar-cell {
  min-height: 90px;
  padding: var(--space-2);
  border: 1px solid var(--border-color-light, #ebeef5);
  position: relative;
  font-size: 13px;
}

.calendar-cell.is-empty {
  background: var(--bg-color, #f5f7fa);
}

.calendar-cell.is-weekend {
  background: #fafafa;
  color: var(--text-tertiary);
}

.calendar-cell.is-today {
  border-color: var(--color-primary, #409eff);
  border-width: 2px;
}

.calendar-cell.has-shift {
  background: #f0f9ff;
}

.calendar-cell.no-shift {
  background: #fff;
}

.cell-day {
  font-weight: 600;
  margin-bottom: 2px;
}

.cell-shift {
  font-size: 13px;
  color: var(--color-primary, #409eff);
  font-weight: 500;
}

.cell-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.cell-override {
  margin-top: 2px;
}

.cell-swap-btn {
  font-size: 11px !important;
  padding: 0 !important;
  margin-top: 2px;
}

.calendar-cell.is-tappable {
  cursor: pointer;
  -webkit-tap-highlight-color: rgba(64, 158, 255, 0.15);
}

.calendar-cell.is-tappable:focus-visible {
  outline: 2px solid var(--color-primary, #409eff);
  outline-offset: -2px;
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

.text-muted {
  color: var(--text-tertiary, #c0c4cc);
}

/* Mobile */
@media (max-width: 767px) {
  .calendar-cell {
    min-height: 65px;
    padding: 4px;
    font-size: 11px;
  }

  .cell-time {
    font-size: 10px;
  }

  .cell-swap-btn {
    display: none;
  }

  .controls {
    justify-content: center;
  }

  .spacer {
    display: none;
  }
}
</style>
