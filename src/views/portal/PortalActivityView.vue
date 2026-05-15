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
        @open-rollcall="openDrawer"
      />

      <ActivityRollcallDrawer
        v-model="drawerVisible"
        :drawer-title="drawerTitle"
        :drawer-loading="drawerLoading"
        :drawer-session="drawerSession"
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

<script setup>
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
const initialTab = VALID_TABS.includes(route.query.tab) ? route.query.tab : 'registrations'
const mainTab = ref(initialTab)

// ── 課程報名 Tab ──
const loading = ref(false)
const data = ref(null)
const activeClass = ref('')

async function loadRegistrations() {
  loading.value = true
  try {
    const res = await getPortalActivityRegistrations()
    data.value = res.data
    if (res.data.classrooms.length > 0) {
      activeClass.value = res.data.classrooms[0]
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
const sessions = ref([])
const filterCourseId = ref(null)
const filterStartDate = ref(null)
const filterEndDate = ref(null)
const activeMonth = ref('current')

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
  getSessionFn: getPortalAttendanceSession,
  updateFn: batchUpdatePortalAttendance,
})

function _monthBounds(offset) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + offset
  return {
    start: dateToLocalISO(new Date(y, m, 1)),
    end: dateToLocalISO(new Date(y, m + 1, 0)),
  }
}

function setMonth(which) {
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
    const params = {}
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

function handleTabChange(tab) {
  router.replace({ query: { ...route.query, tab } })
  if (tab === 'attendance') {
    ensureAttendanceLoaded()
  }
}

watch(
  () => route.query.tab,
  (newTab) => {
    if (VALID_TABS.includes(newTab) && newTab !== mainTab.value) {
      mainTab.value = newTab
      if (newTab === 'attendance') ensureAttendanceLoaded()
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
