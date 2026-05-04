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
        <!-- 摘要統計卡片 -->
        <el-row :gutter="12" class="summary-row">
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_registrations }}</div>
              <div class="card-label">已報名人數</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_enrolled }}</div>
              <div class="card-label">正式報名數</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_waitlist }}</div>
              <div class="card-label">候補人次</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-card shadow="never" class="summary-card">
              <div class="card-val">{{ data.summary.total_paid }}</div>
              <div class="card-label">已繳費人數</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 班級切換 Tabs（多班時顯示） -->
        <el-tabs v-if="data.classrooms.length > 1" v-model="activeClass" style="margin-top: 16px">
          <el-tab-pane
            v-for="cls in data.classrooms"
            :key="cls"
            :label="cls"
            :name="cls"
          />
        </el-tabs>

        <!-- 報名列表 -->
        <el-table
          :data="filteredRegistrations"
          border
          stripe
          style="margin-top: 12px"
          v-loading="loading"
        >
          <el-table-column label="學生" prop="student_name" min-width="90" />
          <el-table-column label="班級" prop="class_name" width="90" align="center" />
          <el-table-column label="課程" min-width="200">
            <template #default="{ row }">
              <span v-if="row.courses.length === 0" class="no-course">—</span>
              <el-tag
                v-for="(c, idx) in row.courses"
                :key="idx"
                :type="COURSE_STATUS_TAG_TYPE[c.status] || 'info'"
                size="small"
                style="margin: 2px"
              >
                {{ c.course_name }}
                <span v-if="c.status === 'waitlist'">（候補 #{{ c.waitlist_position }}）</span>
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="繳費" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.is_paid ? 'success' : 'warning'" size="small">
                {{ row.is_paid ? '已繳費' : '未繳費' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="報名時間" min-width="130">
            <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>

        <div v-if="filteredRegistrations.length === 0 && !loading" class="empty-hint">
          目前沒有學生報名才藝課程。
        </div>
      </template>

      <el-empty v-else-if="!loading" description="無班級資料" />
    </template>

    <!-- ===== 課程點名 Tab ===== -->
    <template v-if="mainTab === 'attendance'">
      <!-- 篩選列 -->
      <el-row :gutter="12" class="filter-row" align="middle">
        <el-col :xs="24" :sm="9">
          <el-select
            v-model="filterCourseId"
            placeholder="選擇課程（全部）"
            clearable
            style="width: 100%"
            @change="applyFilter"
          >
            <el-option
              v-for="c in attendanceCourseOptions"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="15">
          <el-space wrap>
            <el-button-group>
              <el-button
                :type="activeMonth === 'prev' ? 'primary' : ''"
                size="small"
                @click="setMonth('prev')"
              >上月</el-button>
              <el-button
                :type="activeMonth === 'current' ? 'primary' : ''"
                size="small"
                @click="setMonth('current')"
              >本月</el-button>
              <el-button
                :type="activeMonth === 'next' ? 'primary' : ''"
                size="small"
                @click="setMonth('next')"
              >下月</el-button>
            </el-button-group>
            <el-date-picker
              v-model="filterStartDate"
              type="date"
              placeholder="開始日期"
              value-format="YYYY-MM-DD"
              style="width: 140px"
              @change="onManualDateChange"
            />
            <el-date-picker
              v-model="filterEndDate"
              type="date"
              placeholder="結束日期"
              value-format="YYYY-MM-DD"
              style="width: 140px"
              @change="onManualDateChange"
            />
          </el-space>
        </el-col>
      </el-row>

      <!-- 場次列表 -->
      <div v-if="attendanceLoading" v-loading="true" style="min-height: 200px" />
      <template v-else>
        <el-table
          v-if="filteredSessions.length > 0"
          :data="filteredSessions"
          border
          stripe
          style="margin-top: 12px"
        >
          <el-table-column label="日期" prop="session_date" width="120" align="center" />
          <el-table-column label="課程" prop="course_name" min-width="120" />
          <el-table-column label="自班出席" width="140" align="center">
            <template #default="{ row }">
              <span v-if="row.recorded_count === 0" class="no-record">尚未點名</span>
              <span v-else>
                <span class="present-count">{{ row.present_count }}</span>
                <span class="count-sep"> / {{ row.recorded_count }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                @click="openDrawer(row)"
              >點名</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-hint">目前沒有相關場次。</div>
      </template>

      <!-- 點名 Drawer -->
      <el-drawer
        v-model="drawerVisible"
        :title="drawerTitle"
        direction="rtl"
        size="460px"
        :close-on-click-modal="false"
      >
        <div v-if="drawerLoading" v-loading="true" style="min-height: 200px" />
        <template v-else-if="drawerSession">
          <!-- 進度條 -->
          <el-progress
            :percentage="drawerSession.total > 0 ? Math.round(((drawerPresentCount + drawerAbsentCount) / drawerSession.total) * 100) : 0"
            :format="() => `已點名 ${drawerPresentCount + drawerAbsentCount} / ${drawerSession.total} 人`"
            style="margin-bottom: 10px"
          />

          <!-- 快速操作 + 統計 Tags -->
          <div class="drawer-top-actions">
            <el-space>
              <el-button size="small" @click="setAllPresent(true)">全部出席</el-button>
              <el-button size="small" @click="setAllPresent(false)">全部缺席</el-button>
            </el-space>
            <el-space>
              <el-tag type="info">共 {{ drawerSession.total }} 位</el-tag>
              <el-tag type="success">出席 {{ drawerPresentCount }}</el-tag>
              <el-tag type="danger">缺席 {{ drawerAbsentCount }}</el-tag>
              <el-tag type="warning">未點名 {{ drawerUnmarkedCount }}</el-tag>
            </el-space>
          </div>

          <el-table
            :data="sortedStudents"
            :row-class-name="({ row }) => row.is_present === null ? 'unmarked-row' : ''"
            border
            style="margin-top: 12px"
            size="small"
          >
            <el-table-column label="班級" prop="class_name" width="80" align="center" />
            <el-table-column label="姓名" prop="student_name" min-width="90" />
            <el-table-column label="出席" width="100" align="center">
              <template #default="{ row }">
                <el-switch
                  v-model="row.is_present"
                  :active-value="true"
                  :inactive-value="false"
                  active-text="出席"
                  inactive-text="缺席"
                  inline-prompt
                />
              </template>
            </el-table-column>
            <el-table-column label="備註" min-width="100">
              <template #default="{ row }">
                <el-input
                  v-model="row.attendance_notes"
                  size="small"
                  placeholder="備註"
                />
              </template>
            </el-table-column>
          </el-table>

          <div class="drawer-actions">
            <el-button
              type="primary"
              :loading="saveLoading"
              @click="handleSave(loadAttendanceSessions)"
            >儲存點名</el-button>
          </div>
        </template>
      </el-drawer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getPortalActivityRegistrations,
  getPortalAttendanceSessions,
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { COURSE_STATUS_TAG_TYPE } from '@/constants/activity'
import { formatActivityDate, dateToLocalISO } from '@/utils/format'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['registrations', 'attendance']
const initialTab = VALID_TABS.includes(route.query.tab) ? route.query.tab : 'registrations'
const mainTab = ref(initialTab)

// ── 課程報名 Tab ──
const loading = ref(false)
const data = ref(null)
const activeClass = ref('')

const filteredRegistrations = computed(() => {
  if (!data.value) return []
  if (!activeClass.value) return data.value.registrations
  return data.value.registrations.filter(r => r.class_name === activeClass.value)
})

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

const attendanceCourseOptions = computed(() => {
  const map = new Map()
  sessions.value.forEach(s => {
    if (!map.has(s.course_id)) {
      map.set(s.course_id, { id: s.course_id, name: s.course_name })
    }
  })
  return Array.from(map.values())
})

const filteredSessions = computed(() => {
  if (!filterCourseId.value) return sessions.value
  return sessions.value.filter(s => s.course_id === filterCourseId.value)
})

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

.summary-row { margin-bottom: 16px; }
.summary-card { text-align: center; padding: 4px 0; }
.card-val { font-size: 28px; font-weight: 700; color: #1d4ed8; }
.card-label { font-size: 13px; color: #64748b; margin-top: 4px; }

.no-course { color: #94a3b8; }
.empty-hint { text-align: center; color: #94a3b8; padding: 24px 0; font-size: 14px; }

/* ── 點名 ── */
.filter-row { margin-top: 12px; margin-bottom: 12px; }
.no-record { color: #94a3b8; font-size: 13px; }
.present-count { color: #22c55e; font-weight: 600; }
.count-sep { color: #94a3b8; }
.drawer-top-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>

<style>
.el-table .unmarked-row td {
  background-color: #fffbeb !important;
}
</style>
