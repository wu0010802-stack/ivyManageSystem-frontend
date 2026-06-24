<template>
  <div class="portal-activity">
    <h2 class="page-title">才藝管理</h2>

    <el-tabs v-model="mainTab" @tab-change="handleTabChange">
      <el-tab-pane label="課程報名" name="registrations" />
      <el-tab-pane label="課程點名" name="attendance" />
    </el-tabs>

    <!-- ===== 課程報名 Tab ===== -->
    <template v-if="mainTab === 'registrations'">
      <div v-if="loading" v-loading="true" style="min-height: 200px"></div>
      <template v-else-if="data">
        <ActivityRegistrationPanel
          :data="data"
          :loading="loading"
          v-model:active-class="activeClass"
        />
      </template>
      <el-empty v-else-if="!loading" description="無班級資料" />
    </template>

    <!-- ===== 課程點名 Tab ===== -->
    <template v-if="mainTab === 'attendance'">
      <ActivitySessionList
        :sessions="sessions"
        :filter-course-id="filterCourseId"
        :filter-start-date="filterStartDate"
        :filter-end-date="filterEndDate"
        :active-month="activeMonth"
        :loading="attendanceLoading"
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
        @save="handleSave(optimisticUpdateSessionCounts)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getPortalActivityRegistrations,
  getPortalAttendanceSessions,
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { dateToLocalISO } from '@/utils/format'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
import type { Schema } from '@/api/_generated/typed'
import ActivityRegistrationPanel from './components/activity/ActivityRegistrationPanel.vue'
import ActivitySessionList from './components/activity/ActivitySessionList.vue'
import ActivityRollcallDrawer from './components/activity/ActivityRollcallDrawer.vue'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['registrations', 'attendance']
const initialTab = VALID_TABS.includes(route.query.tab as string) ? (route.query.tab as string) : 'registrations'
const mainTab = ref(initialTab)

// ── 課程報名 Tab ──
interface RegistrationData { classrooms: string[]; [key: string]: unknown }
const loading = ref(false)
const data = ref<RegistrationData | null>(null)
const activeClass = ref('')

async function loadRegistrations() {
  loading.value = true
  try {
    const res = await getPortalActivityRegistrations()
    // TODO(ts-strict): /portal/activity/registrations 後端尚無 response_model → codegen 回 unknown
    const d = res.data as RegistrationData
    data.value = d
    if (d.classrooms.length > 0) {
      activeClass.value = d.classrooms[0]
    }
  } catch {
    ElMessage.error('載入才藝報名資料失敗')
  } finally {
    loading.value = false
  }
}

// ── 課程點名 Tab ──
const attendanceLoading = ref(false)
const attendanceLoaded = ref(false)
// 後端 portal sessions list 已補 response_model（ActivitySessionListItemOut）→ codegen 型別
type PortalSessionRow = Schema<'ActivitySessionListItemOut'>
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

async function loadAttendanceSessions() {
  attendanceLoading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterStartDate.value) params.start_date = filterStartDate.value
    if (filterEndDate.value) params.end_date = filterEndDate.value
    const res = await getPortalAttendanceSessions(params)
    sessions.value = res.data
    attendanceLoaded.value = true
  } catch {
    ElMessage.error('載入場次失敗')
  } finally {
    attendanceLoading.value = false
  }
}

function ensureAttendanceLoaded() {
  if (!attendanceLoaded.value) {
    setMonth('current')
  }
}

function openRollcall(session: PortalSessionRow) {
  openDrawer(session)
}

// 點名儲存後樂觀就地更新該列 count，免整批重抓全月場次。
// 後端 PUT 僅回 {ok,updated,skipped} 不含 counts，故走前端 composable 已算好的
// drawerPresentCount/drawerAbsentCount（recorded = present + absent，未點名不計）。
function optimisticUpdateSessionCounts() {
  const sid = drawerSession.value?.id
  if (sid == null) return
  const row = sessions.value.find((s) => s.id === sid)
  if (!row) return
  row.present_count = drawerPresentCount.value
  row.recorded_count = drawerPresentCount.value + drawerAbsentCount.value
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

function handleTabChange(tab: string | number) {
  const tabStr = String(tab)
  router.replace({ query: { ...route.query, tab: tabStr } })
  if (tabStr === 'attendance') {
    ensureAttendanceLoaded()
  }
}

watch(
  () => route.query.tab,
  (newTab) => {
    const tab = newTab as string | null
    if (tab && VALID_TABS.includes(tab) && tab !== mainTab.value) {
      mainTab.value = tab
      if (tab === 'attendance') ensureAttendanceLoaded()
    }
  }
)

onMounted(() => {
  loadRegistrations()
  if (mainTab.value === 'attendance') {
    ensureAttendanceLoaded()
  }
})
</script>

<style scoped>
.portal-activity { padding: 16px; }
.page-title { margin: 0 0 16px; font-size: 20px; font-weight: 600; }
</style>

<style>
.el-table .unmarked-row td {
  background-color: var(--color-warning-soft) !important;
}
</style>
