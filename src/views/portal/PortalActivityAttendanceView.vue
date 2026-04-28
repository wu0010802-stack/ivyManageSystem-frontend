<template>
  <div class="portal-attendance">
    <h2 class="page-title">才藝點名</h2>

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
            v-for="c in courseOptions"
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
    <div v-if="loading" v-loading="true" style="min-height: 200px" />
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
            @click="handleSave(loadSessions)"
          >儲存點名</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getPortalAttendanceSessions,
  getPortalAttendanceSession,
  batchUpdatePortalAttendance,
} from '@/api/activity'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
import { dateToLocalISO } from '@/utils/format'

const loading = ref(false)
const sessions = ref([])
const filterCourseId = ref(null)
const filterStartDate = ref(null)
const filterEndDate = ref(null)
const activeMonth = ref('current')

// 課程選項（從場次中提取）
const courseOptions = computed(() => {
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

// 點名 Drawer（共用 composable）
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
  loadSessions()
}

function onManualDateChange() {
  activeMonth.value = null
  applyFilter()
}

function applyFilter() {
  loadSessions()
}

async function loadSessions() {
  loading.value = true
  try {
    const params = {}
    if (filterStartDate.value) params.start_date = filterStartDate.value
    if (filterEndDate.value) params.end_date = filterEndDate.value
    const res = await getPortalAttendanceSessions(params)
    sessions.value = res.data
  } catch {
    ElMessage.error('載入場次失敗')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 預設顯示本月
  setMonth('current')
})
</script>

<style scoped>
.portal-attendance { padding: 16px; }
.page-title { margin: 0 0 16px; font-size: 20px; font-weight: 600; }
.filter-row { margin-bottom: 12px; }
.no-record { color: #94a3b8; font-size: 13px; }
.present-count { color: #22c55e; font-weight: 600; }
.count-sep { color: #94a3b8; }
.empty-hint { text-align: center; color: #94a3b8; padding: 32px 0; font-size: 14px; }
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
