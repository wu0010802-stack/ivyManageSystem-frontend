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
        @set-all-present="setAllPresent"
        @save="handleSave(loadAttendanceSessions)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getPortalActivityRegistrations,
  getPortalAttendanceSessions,
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { dateToLocalISO } from '@/utils/format'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
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
interface ActivitySession { course_id?: number; course_name?: string; [key: string]: unknown }
const sessions = ref<ActivitySession[]>([])
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
} = useActivityAttendanceDrawer({
  getSessionFn: getPortalAttendanceSession as unknown as (...args: unknown[]) => Promise<{ data: { id: unknown; course_name: string; session_date: string; students: { registration_id: unknown; is_present: boolean | null; attendance_notes?: string }[] } }>,
  updateFn: batchUpdatePortalAttendance as unknown as (...args: unknown[]) => Promise<unknown>,
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
    // TODO(ts-strict): /portal/activity/attendance/sessions 後端尚無 response_model → unknown
    sessions.value = res.data as typeof sessions.value
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

function openRollcall(session: { course_id?: number; course_name?: string; [key: string]: unknown }) {
  openDrawer(session as unknown as { id: unknown })
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
