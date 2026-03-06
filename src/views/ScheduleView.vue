<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '@/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMonthWeeks } from '@/utils/scheduleUtils'

// --- State ---
const loading = ref(false)
const saving = ref(false)
const employees = ref([])
const shiftTypes = ref([])
const assignments = ref({}) // { employee_id: { shift_type_id, notes } }

// Week selector - default to current week's Monday
const getMonday = (d) => {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date
}

const formatDate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const monday = getMonday(new Date())
const weekStart = ref(formatDate(monday))

const weekLabel = computed(() => {
  const d = new Date(weekStart.value)
  const end = new Date(d)
  end.setDate(end.getDate() + 4) // Friday
  return `${d.getMonth() + 1}/${d.getDate()} ~ ${end.getMonth() + 1}/${end.getDate()}`
})

// Filter: only show active employees with classroom assignment (teachers)
const teacherEmployees = computed(() => {
  return employees.value.filter(e => e.is_active && e.classroom_id)
})

// --- Data Fetch ---
const fetchEmployees = async () => {
  try {
    const res = await api.get('/employees')
    employees.value = res.data
  } catch {
    ElMessage.error('載入員工失敗')
  }
}

const fetchShiftTypes = async () => {
  try {
    const res = await api.get('/shifts/types')
    shiftTypes.value = res.data.filter(t => t.is_active)
  } catch {
    ElMessage.error('載入班別失敗')
  }
}

const fetchAssignments = async () => {
  loading.value = true
  try {
    const res = await api.get('/shifts/assignments', { params: { week_start: weekStart.value } })
    // Build map: employee_id -> assignment
    const map = {}
    for (const a of res.data) {
      map[a.employee_id] = { shift_type_id: a.shift_type_id, notes: a.notes }
    }
    assignments.value = map
  } catch {
    ElMessage.error('載入排班失敗')
  } finally {
    loading.value = false
  }
}

// --- Week Navigation ---
const changeWeek = (offset) => {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + offset * 7)
  weekStart.value = formatDate(d)
  fetchAssignments()
}

const onWeekChange = (val) => {
  // Align to Monday
  const d = new Date(val)
  weekStart.value = formatDate(getMonday(d))
  fetchAssignments()
}

// --- Assignment ---
const getAssignment = (empId) => {
  return assignments.value[empId]?.shift_type_id || null
}

const setAssignment = (empId, shiftTypeId) => {
  if (!assignments.value[empId]) {
    assignments.value[empId] = { shift_type_id: null, notes: '' }
  }
  assignments.value[empId].shift_type_id = shiftTypeId
}

const getShiftInfo = (shiftTypeId) => {
  return shiftTypes.value.find(t => t.id === shiftTypeId)
}

// --- Save ---
const saveAll = async () => {
  saving.value = true
  try {
    const items = []
    for (const emp of teacherEmployees.value) {
      const a = assignments.value[emp.id]
      items.push({
        employee_id: emp.id,
        shift_type_id: a?.shift_type_id || null,
        notes: a?.notes || null,
      })
    }
    await api.post('/shifts/assignments', {
      week_start_date: weekStart.value,
      assignments: items,
    })
    ElMessage.success('排班已儲存')
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '儲存失敗')
  } finally {
    saving.value = false
  }
}

// --- 排班複製 ---

// 複製指定來源週排班到當前週的 local state（需手動儲存）
const copyFromWeek = async (sourceWeekStart) => {
  try {
    const res = await api.get('/shifts/assignments', { params: { week_start: sourceWeekStart } })
    if (res.data.length === 0) {
      ElMessage.warning('來源週無排班資料')
      return
    }
    const map = {}
    for (const a of res.data) {
      map[a.employee_id] = { shift_type_id: a.shift_type_id, notes: a.notes }
    }
    assignments.value = map
    ElMessage.success('已複製，請確認後儲存')
  } catch {
    ElMessage.error('複製失敗')
  }
}

// 快捷：複製上週
const copyPrevWeek = () => {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() - 7)
  copyFromWeek(formatDate(d))
}

// 週選擇器狀態
const copySourceWeek = ref('')
const copyWeekPickerVisible = ref(false)

const onCopyWeekConfirm = () => {
  if (!copySourceWeek.value) { ElMessage.warning('請選擇來源週'); return }
  const d = new Date(copySourceWeek.value)
  copyFromWeek(formatDate(getMonday(d)))
  copyWeekPickerVisible.value = false
}

// 複製上月整月（直接寫入後端各目標週）
const monthCopyLoading = ref(false)

const copyPrevMonth = async () => {
  const cur = new Date(weekStart.value)
  const ty = cur.getFullYear()
  const tm = cur.getMonth() + 1 // 1-based

  // 上一個月
  let sy = ty, sm = tm - 1
  if (sm === 0) { sy -= 1; sm = 12 }

  const sourceWeeks = getMonthWeeks(sy, sm)
  const targetWeeks = getMonthWeeks(ty, tm)
  const copyCount = Math.min(sourceWeeks.length, targetWeeks.length)

  const sourceLabel = `${sy}年${sm}月`
  const targetLabel = `${ty}年${tm}月`

  try {
    await ElMessageBox.confirm(
      `確定將 ${sourceLabel} 排班複製到 ${targetLabel}？\n這將覆蓋目標月現有週排班（每日調班不受影響）。`,
      '複製上月整月',
      { confirmButtonText: '確認複製', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return // 使用者取消
  }

  monthCopyLoading.value = true
  let copied = 0
  try {
    for (let i = 0; i < copyCount; i++) {
      const res = await api.get('/shifts/assignments', { params: { week_start: sourceWeeks[i] } })
      if (res.data.length === 0) continue // 來源週無資料，跳過不清空目標
      await api.post('/shifts/assignments', {
        week_start_date: targetWeeks[i],
        assignments: res.data.map(a => ({
          employee_id: a.employee_id,
          shift_type_id: a.shift_type_id,
          notes: a.notes,
        })),
      })
      copied++
    }
    ElMessage.success(`已複製 ${copied} 週排班`)
    fetchAssignments() // 重新載入當前週
  } catch {
    ElMessage.error('月複製失敗')
  } finally {
    monthCopyLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchEmployees(), fetchShiftTypes()])
  fetchAssignments()
})

// --- Daily Shift Dialog ---
const dailyDialogVisible = ref(false)
const currentEmployee = ref(null)
const dailyShifts = ref([]) // list of daily shifts from API
const dailyShiftMap = ref({}) // date -> shift_type_id

// Generate dates for current week (Mon-Fri)
const currentWeekDates = computed(() => {
  if (!weekStart.value) return []
  const start = new Date(weekStart.value)
  const dates = []
  for (let i = 0; i < 5; i++) { // Mon-Fri
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    dates.push(formatDate(d))
  }
  return dates
})

const getDayName = (dateStr) => {
  const d = new Date(dateStr)
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return days[d.getDay()]
}

const openDailyDialog = async (emp) => {
  currentEmployee.value = emp
  dailyDialogVisible.value = true
  dailyShiftMap.value = {} // reset
  await fetchDailyShiftsForDialog()
}

const fetchDailyShiftsForDialog = async () => {
  if (!currentEmployee.value) return
  
  // Calculate end date (Friday)
  const start = new Date(weekStart.value)
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  
  try {
    const res = await api.get('/shifts/daily', {
      params: {
        start_date: weekStart.value,
        end_date: formatDate(end),
        employee_id: currentEmployee.value.id
      }
    })
    
    dailyShifts.value = res.data
    // Map to date -> id
    const map = {}
    for (const ds of res.data) {
      map[ds.date] = ds
    }
    dailyShiftMap.value = map
  } catch {
    ElMessage.error('載入每日排班失敗')
  }
}

const getDailyShiftId = (dateStr) => {
  const ds = dailyShiftMap.value[dateStr]
  return ds ? ds.shift_type_id : null
}

const getDailyShiftRecordId = (dateStr) => {
  const ds = dailyShiftMap.value[dateStr]
  return ds ? ds.id : null
}

// --- Swap History ---
const activeTab = ref('schedule')
const swapHistory = ref([])
const swapLoading = ref(false)
const swapFilter = reactive({
  start_date: '',
  end_date: '',
  status: '',
})

const fetchSwapHistory = async () => {
  swapLoading.value = true
  try {
    const params = {}
    if (swapFilter.start_date) params.start_date = swapFilter.start_date
    if (swapFilter.end_date) params.end_date = swapFilter.end_date
    if (swapFilter.status) params.status = swapFilter.status
    const res = await api.get('/shifts/swap-history', { params })
    swapHistory.value = res.data
  } catch {
    ElMessage.error('載入換班紀錄失敗')
  } finally {
    swapLoading.value = false
  }
}

const onTabChange = (tab) => {
  if (tab === 'swap-history') {
    fetchSwapHistory()
  }
}

const swapStatusLabel = (status) => {
  return { pending: '待回覆', accepted: '已接受', rejected: '已拒絕', cancelled: '已撤銷' }[status] || status
}

const swapStatusType = (status) => {
  return { pending: 'warning', accepted: 'success', rejected: 'danger', cancelled: 'info' }[status] || 'info'
}

const handleDailyShiftChange = async (dateStr, shiftTypeId) => {
  if (!currentEmployee.value) return
  
  try {
    if (shiftTypeId) {
      // Upsert
      await api.post('/shifts/daily', {
        employee_id: currentEmployee.value.id,
        shift_type_id: shiftTypeId,
        date: dateStr
      })
      ElMessage.success('已更新每日排班')
    } else {
      // Delete if exists
      const recordId = getDailyShiftRecordId(dateStr)
      if (recordId) {
        await api.delete(`/shifts/daily/${recordId}`)
        ElMessage.success('已清除每日排班 (恢復預設)')
      }
    }
    // Refresh
    await fetchDailyShiftsForDialog()
  } catch (error) {
    ElMessage.error('更新失敗')
  }
}
</script>

<template>
  <div class="schedule-page">
    <h2>排班管理</h2>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="每週排班" name="schedule">
        <!-- Week Controls -->
        <el-card class="control-panel">
          <div class="controls">
            <el-button @click="changeWeek(-1)" :icon="'ArrowLeft'">上週</el-button>
            <el-date-picker
              v-model="weekStart"
              type="date"
              placeholder="選擇日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              style="width: 160px;"
              @change="onWeekChange"
            />
            <el-button @click="changeWeek(1)">下週 <el-icon><ArrowRight /></el-icon></el-button>
            <span class="week-label">{{ weekLabel }}</span>
            <div class="spacer" />
            <el-dropdown split-button @click="copyPrevWeek" :loading="monthCopyLoading">
              複製上週排班
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="copyPrevWeek">複製上週排班</el-dropdown-item>
                  <el-dropdown-item @click="copyWeekPickerVisible = true">複製指定週...</el-dropdown-item>
                  <el-dropdown-item @click="copyPrevMonth" :disabled="monthCopyLoading">複製上月整月...</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="primary" @click="saveAll" :loading="saving">儲存排班</el-button>
          </div>
        </el-card>

        <!-- Assignment Table -->
        <el-table :data="teacherEmployees" v-loading="loading" style="width: 100%; margin-top: 16px;" stripe>
          <el-table-column prop="name" label="姓名" width="100" fixed />
          <el-table-column label="班級" width="120">
            <template #default="{ row }">
              {{ row.classroom_name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="班別" min-width="200">
            <template #default="{ row }">
              <el-select
                :model-value="getAssignment(row.id)"
                @update:model-value="(val) => setAssignment(row.id, val)"
                placeholder="選擇班別"
                clearable
                style="width: 100%;"
              >
                <el-option
                  v-for="st in shiftTypes"
                  :key="st.id"
                  :label="`${st.name} (${st.work_start}~${st.work_end})`"
                  :value="st.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="上班時間" width="120">
            <template #default="{ row }">
              <template v-if="getAssignment(row.id)">
                {{ getShiftInfo(getAssignment(row.id))?.work_start || '' }}
              </template>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="下班時間" width="120">
            <template #default="{ row }">
              <template v-if="getAssignment(row.id)">
                {{ getShiftInfo(getAssignment(row.id))?.work_end || '' }}
              </template>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="每日調整" width="100" align="center">
            <template #default="{ row }">
              <el-button size="small" @click="openDailyDialog(row)">調整</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="teacherEmployees.length === 0 && !loading" description="尚無班導老師資料（需有班級指派的員工）" />
      </el-tab-pane>

      <el-tab-pane label="換班紀錄" name="swap-history">
        <el-card class="control-panel">
          <div class="controls">
            <el-date-picker
              v-model="swapFilter.start_date"
              type="date"
              placeholder="開始日期"
              value-format="YYYY-MM-DD"
              style="width: 150px"
            />
            <el-date-picker
              v-model="swapFilter.end_date"
              type="date"
              placeholder="結束日期"
              value-format="YYYY-MM-DD"
              style="width: 150px"
            />
            <el-select v-model="swapFilter.status" placeholder="狀態" clearable style="width: 120px">
              <el-option label="待回覆" value="pending" />
              <el-option label="已接受" value="accepted" />
              <el-option label="已拒絕" value="rejected" />
              <el-option label="已撤銷" value="cancelled" />
            </el-select>
            <el-button type="primary" @click="fetchSwapHistory">查詢</el-button>
          </div>
        </el-card>

        <el-table :data="swapHistory" v-loading="swapLoading" style="width: 100%; margin-top: 16px;" stripe>
          <el-table-column prop="swap_date" label="換班日期" width="120" />
          <el-table-column prop="requester_name" label="發起人" width="100" />
          <el-table-column prop="requester_shift" label="發起人班別" width="110" />
          <el-table-column prop="target_name" label="對象" width="100" />
          <el-table-column prop="target_shift" label="對象班別" width="110" />
          <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
          <el-table-column label="狀態" width="90">
            <template #default="{ row }">
              <el-tag :type="swapStatusType(row.status)" size="small">{{ swapStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="target_responded_at" label="回覆時間" width="160" />
          <el-table-column prop="created_at" label="申請時間" width="160" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 複製指定週 Dialog -->
    <el-dialog v-model="copyWeekPickerVisible" title="複製指定週排班" width="340px">
      <el-date-picker
        v-model="copySourceWeek"
        type="date"
        placeholder="選擇來源週任一日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        style="width: 100%;"
      />
      <template #footer>
        <el-button @click="copyWeekPickerVisible = false">取消</el-button>
        <el-button type="primary" @click="onCopyWeekConfirm">確認複製</el-button>
      </template>
    </el-dialog>

    <!-- Daily Shift Dialog -->
    <el-dialog
      v-model="dailyDialogVisible"
      title="每日排班調整 (調班/換班)"
      width="600px"
    >
      <div v-if="currentEmployee">
        <p class="mb-4">
          員工：<strong>{{ currentEmployee.name }}</strong> |
          本週預設：{{ getShiftInfo(getAssignment(currentEmployee.id))?.name || '無' }}
        </p>

        <el-table :data="currentWeekDates.map(d => ({ date: d }))" border stripe>
          <el-table-column label="日期" width="120">
            <template #default="{ row }">
              {{ row.date }} ({{ getDayName(row.date) }})
            </template>
          </el-table-column>
          <el-table-column label="當日班別">
            <template #default="{ row }">
              <el-select
                :model-value="getDailyShiftId(row.date)"
                @update:model-value="(val) => handleDailyShiftChange(row.date, val)"
                placeholder="預設 (同週排班)"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="st in shiftTypes"
                  :key="st.id"
                  :label="st.name"
                  :value="st.id"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
        <div class="mt-4 text-gray-500 text-sm">
          * 清除選擇即恢復為「週排班」設定
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ArrowRight } from '@element-plus/icons-vue'
export default {
  components: { ArrowRight }
}
</script>

<style scoped>
.control-panel {
  margin-bottom: 4px;
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.week-label {
  font-size: var(--text-lg);
  font-weight: bold;
  color: #303133;
}
.spacer {
  flex: 1;
}
.text-muted {
  color: #c0c4cc;
}
.mb-4 {
  margin-bottom: var(--space-4);
}
.mt-4 {
  margin-top: var(--space-4);
}
.text-gray-500 {
  color: var(--text-secondary);
}
.text-sm {
  font-size: var(--text-base);
}
</style>
