<script setup>
import { ref, computed, watch } from 'vue'
import { getLeaves } from '@/api/leaves'
import { ElMessage } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import { LEAVE_TYPES as leaveTypes } from '@/utils/leaves'

const props = defineProps({
  activeTab: String,
})

const employeeStore = useEmployeeStore()

const calYear  = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth() + 1)
const calLoading     = ref(false)
const calendarLeaves = ref([])
const calFilterEmp   = ref(null)

// 詳情 Dialog
const calDetailDate    = ref('')
const calDetailLeaves  = ref([])
const calDetailVisible = ref(false)

// 假別顏色對應（左邊框色）
const LEAVE_COLOR_MAP = {
  personal:        '#e6a23c',
  sick:            '#409eff',
  menstrual:       '#a78bfa',
  annual:          '#67c23a',
  maternity:       '#f472b6',
  paternity:       '#34d399',
  official:        '#38bdf8',
  marriage:        '#f59e0b',
  bereavement:     '#94a3b8',
  prenatal:        '#c084fc',
  paternity_new:   '#2dd4bf',
  miscarriage:     '#fb923c',
  family_care:     '#fbbf24',
  parental_unpaid: '#64748b',
}

const getLeaveTypeTag = (type) => {
  return leaveTypes.find(t => t.value === type) || { label: type, color: '' }
}

const fetchCalendar = async () => {
  calLoading.value = true
  try {
    const params = { year: calYear.value, month: calMonth.value }
    if (calFilterEmp.value) params.employee_id = calFilterEmp.value
    const res = await getLeaves(params)
    calendarLeaves.value = res.data
  } catch {
    ElMessage.error('載入行事曆失敗')
  } finally {
    calLoading.value = false
  }
}

const calPrevMonth = () => {
  if (calMonth.value === 1) { calMonth.value = 12; calYear.value-- }
  else calMonth.value--
  fetchCalendar()
}

const calNextMonth = () => {
  if (calMonth.value === 12) { calMonth.value = 1; calYear.value++ }
  else calMonth.value++
  fetchCalendar()
}

const calGoToday = () => {
  const now = new Date()
  calYear.value  = now.getFullYear()
  calMonth.value = now.getMonth() + 1
  fetchCalendar()
}

const calTodayStr = computed(() => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
})

// 計算月曆格子（6 週 × 7 天）
const calendarGrid = computed(() => {
  const year  = calYear.value
  const month = calMonth.value

  // 依日期建立 "誰在這天請假" 的 map
  const byDate = {}
  for (const lv of calendarLeaves.value) {
    if (lv.is_approved === false) continue   // 已駁回不顯示
    const start      = new Date(lv.start_date + 'T00:00:00')
    const end        = new Date(lv.end_date   + 'T00:00:00')
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd   = new Date(year, month, 0)

    const cur   = new Date(Math.max(start.getTime(), monthStart.getTime()))
    const limit = new Date(Math.min(end.getTime(),   monthEnd.getTime()))

    while (cur <= limit) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      if (!byDate[key]) byDate[key] = []
      byDate[key].push(lv)
      cur.setDate(cur.getDate() + 1)
    }
  }

  // 建立格子（前置空白 + 當月天 + 後置補齊）
  const firstDow    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push({ day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = new Date(year, month - 1, d).getDay()
    cells.push({
      day:       d,
      date:      dateStr,
      isWeekend: dow === 0 || dow === 6,
      isToday:   dateStr === calTodayStr.value,
      leaves:    byDate[dateStr] || [],
    })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null })

  // 切成週
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
})

// 點擊日期格子 → 開啟詳情 Dialog
const openCalDetail = (cell) => {
  if (!cell.day || !cell.leaves.length) return
  calDetailDate.value   = cell.date
  calDetailLeaves.value = cell.leaves
  calDetailVisible.value = true
}

// 切換到行事曆 Tab 時自動載入
watch(() => props.activeTab, (val) => {
  if (val === 'calendar') fetchCalendar()
})
watch(calFilterEmp, () => {
  if (props.activeTab === 'calendar') fetchCalendar()
})
</script>

<template>
  <!-- 工具列 -->
  <div class="cal-toolbar">
    <div class="cal-nav">
      <el-button-group>
        <el-button @click="calPrevMonth"><el-icon><ArrowLeft /></el-icon></el-button>
        <el-button @click="calGoToday">今天</el-button>
        <el-button @click="calNextMonth"><el-icon><ArrowRight /></el-icon></el-button>
      </el-button-group>
      <span class="cal-title">{{ calYear }} 年 {{ calMonth }} 月</span>
    </div>

    <el-select
      v-model="calFilterEmp"
      placeholder="全部員工"
      clearable
      filterable
      style="width: 160px;"
    >
      <el-option
        v-for="emp in employeeStore.employees"
        :key="emp.id"
        :label="emp.name"
        :value="emp.id"
      />
    </el-select>

    <!-- 圖例 -->
    <div class="cal-legend">
      <span class="cal-legend-item"><span class="legend-dot" style="background:#e6a23c"></span>事假</span>
      <span class="cal-legend-item"><span class="legend-dot" style="background:#409eff"></span>病/生理假</span>
      <span class="cal-legend-item"><span class="legend-dot" style="background:#67c23a"></span>特休/公假</span>
      <span class="cal-legend-item"><span class="legend-dot" style="background:#f472b6"></span>產假/陪產</span>
      <span class="cal-legend-item"><span class="legend-dot pending-dot"></span>待審核</span>
    </div>
  </div>

  <!-- 載入中 -->
  <div v-if="calLoading" class="cal-loading">
    <el-icon class="is-loading" :size="22"><Loading /></el-icon>
    載入中…
  </div>

  <!-- 月曆格子 -->
  <div v-else class="cal-grid-wrapper">
    <!-- 週標題列 -->
    <div class="cal-header-row">
      <div
        v-for="(label, i) in ['日', '一', '二', '三', '四', '五', '六']"
        :key="label"
        class="cal-header-cell"
        :class="{ 'is-weekend-header': i === 0 || i === 6 }"
      >{{ label }}</div>
    </div>

    <!-- 每一週 -->
    <div v-for="(week, wi) in calendarGrid" :key="wi" class="cal-week">
      <div
        v-for="(cell, ci) in week"
        :key="ci"
        class="cal-cell"
        :class="{
          'is-empty':    !cell.day,
          'is-weekend':   cell.isWeekend,
          'is-today':     cell.isToday,
          'has-leaves':   cell.leaves && cell.leaves.length > 0,
        }"
        @click="openCalDetail(cell)"
      >
        <!-- 日期數字 -->
        <div v-if="cell.day" class="cal-day-num">
          <span :class="{ 'today-badge': cell.isToday }">{{ cell.day }}</span>
          <span v-if="cell.leaves.length" class="cal-leave-count">{{ cell.leaves.length }} 人</span>
        </div>

        <!-- 請假事件 -->
        <div class="cal-events">
          <div
            v-for="lv in cell.leaves.slice(0, 4)"
            :key="lv.id"
            class="cal-event"
            :class="{ 'is-pending': lv.is_approved === null }"
            :style="{ borderLeftColor: LEAVE_COLOR_MAP[lv.leave_type] || '#ccc' }"
          >
            <span class="cal-event-name">{{ lv.employee_name }}</span>
            <span class="cal-event-type">{{ lv.leave_type_label }}</span>
          </div>
          <div v-if="cell.leaves.length > 4" class="cal-more">+{{ cell.leaves.length - 4 }} 筆</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 請假詳情 Dialog -->
  <el-dialog
    v-model="calDetailVisible"
    :title="`${calDetailDate} 請假一覽`"
    width="560px"
    destroy-on-close
  >
    <el-table :data="calDetailLeaves" size="small" stripe border>
      <el-table-column label="員工" prop="employee_name" width="90" />
      <el-table-column label="假別" width="95">
        <template #default="{ row }">
          <el-tag :type="getLeaveTypeTag(row.leave_type).color" size="small">
            {{ row.leave_type_label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="時段" min-width="130">
        <template #default="{ row }">
          {{ row.start_date }}{{ row.start_time ? ' ' + row.start_time : '' }}
          ～
          {{ row.end_date }}{{ row.end_time ? ' ' + row.end_time : '' }}
        </template>
      </el-table-column>
      <el-table-column label="時數" width="65" align="center">
        <template #default="{ row }">{{ row.leave_hours }}h</template>
      </el-table-column>
      <el-table-column label="狀態" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_approved === true"  type="success" size="small">已核准</el-tag>
          <el-tag v-else-if="row.is_approved === false" type="danger" size="small">已駁回</el-tag>
          <el-tag v-else type="info" size="small">待審核</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="reason" min-width="100" show-overflow-tooltip />
    </el-table>
    <template #footer>
      <el-button @click="calDetailVisible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 讓 tab-pane 沒有多餘 top padding（由父層 .leave-tabs :deep 覆蓋，此處備用） */

/* 工具列 */
.cal-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: 12px 0 14px;
}

.cal-nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.cal-title {
  font-size: 18px;
  font-weight: 600;
  min-width: 120px;
  text-align: center;
}

/* 圖例 */
.cal-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-left: auto;
}

.cal-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.pending-dot {
  background: transparent !important;
  border: 2px dashed var(--el-color-info);
}

/* 載入中 */
.cal-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

/* 月曆外框 */
.cal-grid-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
  margin-bottom: var(--space-5);
}

/* 週標題 */
.cal-header-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
}

.cal-header-cell {
  padding: 8px 4px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.cal-header-cell.is-weekend-header {
  color: var(--el-color-danger);
}

/* 每一週 row */
.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.cal-week:last-child {
  border-bottom: none;
}

/* 日期格子 */
.cal-cell {
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 4px 5px;
  min-height: 110px;
  cursor: pointer;
  transition: background-color 0.15s;
  box-sizing: border-box;
}

.cal-cell:last-child {
  border-right: none;
}

.cal-cell.is-empty {
  background: var(--el-fill-color-extra-light);
  cursor: default;
}

.cal-cell.is-weekend:not(.is-empty) {
  background: #fafbfc;
}

.cal-cell.is-today:not(.is-empty) {
  background: var(--el-color-primary-light-9);
}

.cal-cell.has-leaves:not(.is-empty):hover {
  background: var(--el-fill-color);
}

/* 日期數字列 */
.cal-day-num {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  padding: 0 2px;
  font-size: 13px;
}

.cal-cell.is-weekend .cal-day-num {
  color: var(--el-color-danger);
}

/* 今天圓圈 badge */
.today-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}

/* 請假人數小標 */
.cal-leave-count {
  font-size: 10px;
  color: var(--el-color-warning);
  font-weight: 500;
}

/* 事件容器 */
.cal-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 單筆請假 chip */
.cal-event {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  border-left: 3px solid #ccc;
  font-size: 11px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

/* 待審核用虛線左邊框 + 降低透明度 */
.cal-event.is-pending {
  border-left-style: dashed;
  opacity: 0.75;
}

.cal-event-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.cal-event-type {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 超過 4 筆的 "more" 提示 */
.cal-more {
  font-size: 11px;
  color: var(--el-color-primary);
  padding: 1px 5px;
  text-align: right;
  cursor: pointer;
}
</style>
