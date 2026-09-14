<template>
  <div class="portal-activity-attendance">
    <PortalPageHeader title="課程點名" />

    <ActivitySessionList
      :sessions="sessions"
      :filter-course-id="filterCourseId"
      :filter-start-date="filterStartDate"
      :filter-end-date="filterEndDate"
      :active-month="activeMonth"
      :loading="loading"
      @update:filter-course-id="filterCourseId = $event; applyFilter()"
      @update:filter-start-date="filterStartDate = $event"
      @update:filter-end-date="filterEndDate = $event"
      @set-month="setMonth"
      @manual-date-change="onManualDateChange"
      @open-rollcall="openRollcall"
    />

    <ActivityRollcallDrawer
      v-model="drawerVisible"
      :drawer-title="drawerTitle"
      :drawer-loading="drawerLoading"
      :drawer-session="drawerSession || undefined"
      :sorted-students="sortedStudents"
      :save-loading="saveLoading"
      :drawer-present-count="drawerPresentCount"
      :drawer-absent-count="drawerAbsentCount"
      :drawer-unmarked-count="drawerUnmarkedCount"
      :before-close="handleRollcallBeforeClose"
      @set-all-present="setAllPresent"
      @save="handleSave(loadAttendanceSessions)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getPortalAttendanceSessions,
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { dateToLocalISO } from '@/utils/format'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
import type { Schema } from '@/api/_generated/typed'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import ActivitySessionList from './components/activity/ActivitySessionList.vue'
import ActivityRollcallDrawer from './components/activity/ActivityRollcallDrawer.vue'

// 後端 portal sessions list 已補 response_model（ActivitySessionListItemOut）→ codegen 型別
type PortalSessionRow = Schema<'ActivitySessionListItemOut'>

const loading = ref(false)
const sessions = ref<PortalSessionRow[]>([])
const filterCourseId = ref<number | null>(null)
const filterStartDate = ref<string | null>(null)
const filterEndDate = ref<string | null>(null)
const activeMonth = ref<string | null>('current')

const {
  drawerVisible,
  drawerLoading,
  drawerSession,
  saveLoading,
  sortedStudents,
  drawerTitle,
  drawerPresentCount,
  drawerAbsentCount,
  drawerUnmarkedCount,
  openDrawer,
  setAllPresent,
  handleSave,
  isDirty,
} = useActivityAttendanceDrawer({
  // 對齊 admin call site（ActivityAttendanceView）：composable 以 unknown-arg 泛型契約
  // 定義 getSessionFn/updateFn，其 SessionData 內部型別與 codegen 後 API 型別不完全
  // 一致（如 is_present 的 undefined）；以薄 lambda 包裝已型別化的 api（id 由 unknown
  // 收斂為 number），取代原 as-unknown-as 偽造完整簽名的雙重斷言。
  // @ts-expect-error TODO(ts-strict): composable unknown-arg 契約 vs 型別化 API 的邊界
  getSessionFn: (id, params) => getPortalAttendanceSession(id as number, params),
  // @ts-expect-error TODO(ts-strict): 同上（records 型別於邊界相接）
  updateFn: (id, records) => batchUpdatePortalAttendance(id as number, records),
})

function _monthBounds(offset: number) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + offset
  return {
    start: dateToLocalISO(new Date(y, m, 1)),
    end: dateToLocalISO(new Date(y, m + 1, 0)),
  }
}

function setMonth(which: string) {
  activeMonth.value = which
  const offset = which === 'prev' ? -1 : which === 'next' ? 1 : 0
  const { start, end } = _monthBounds(offset)
  filterStartDate.value = start
  filterEndDate.value = end
  loadAttendanceSessions()
}

function onManualDateChange() {
  activeMonth.value = null
  applyFilter()
}

function applyFilter() {
  loadAttendanceSessions()
}

let attendanceRequestSeq = 0

async function loadAttendanceSessions() {
  const seq = ++attendanceRequestSeq
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterStartDate.value) params.start_date = filterStartDate.value
    if (filterEndDate.value) params.end_date = filterEndDate.value
    const res = await getPortalAttendanceSessions(params)
    if (seq !== attendanceRequestSeq) return
    sessions.value = res.data
  } catch {
    if (seq !== attendanceRequestSeq) return
    ElMessage.error('載入場次失敗')
  } finally {
    if (seq === attendanceRequestSeq) loading.value = false
  }
}

function openRollcall(session: PortalSessionRow) {
  openDrawer(session)
}

// 未存點名守衛：ESC/X 關閉時若有未儲存的出席/備註異動，先確認再關。
async function handleRollcallBeforeClose(done: () => void) {
  if (!isDirty()) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm('尚有未儲存點名，確定離開？', '未儲存變更', {
      type: 'warning',
      confirmButtonText: '離開',
      cancelButtonText: '留在此頁',
    })
    done()
  } catch {
    // 取消：留在 drawer
  }
}

onMounted(() => {
  setMonth('current')
})
</script>

<style scoped>
.portal-activity-attendance { padding: 16px; }
</style>

<style>
/* 未點名列的黃底。ActivityRollcallDrawer 的 el-table 以 row-class-name 掛上
   .unmarked-row，該列由 Element Plus 渲染、選不到 scoped 屬性，故維持非 scoped。
   本頁自 PortalActivityView 拆出時一併搬來（樣式服務的是點名 drawer，不是報名頁）。 */
.el-table .unmarked-row td {
  background-color: var(--color-warning-soft) !important;
}
</style>
