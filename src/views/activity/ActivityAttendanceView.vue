<template>
  <div class="attendance-view">
    <div class="page-header">
      <h2>點名管理</h2>
      <el-button
        v-if="canWrite"
        type="primary"
        :icon="Plus"
        @click="openCreateDialog"
      >新增場次</el-button>
    </div>

    <!-- 篩選列 -->
    <el-card class="filter-card" shadow="never">
      <el-row :gutter="12" align="middle">
        <el-col :xs="24" :sm="8">
          <el-select
            v-model="filterCourseId"
            placeholder="選擇課程"
            clearable
            style="width: 100%"
            @change="loadSessions"
          >
            <el-option
              v-for="c in courses"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="14">
          <el-space wrap>
            <el-button-group>
              <el-button
                :type="quickRange === 'today' ? 'primary' : ''"
                size="small"
                @click="setQuickRange('today')"
              >今日</el-button>
              <el-button
                :type="quickRange === 'week' ? 'primary' : ''"
                size="small"
                @click="setQuickRange('week')"
              >本週</el-button>
              <el-button
                :type="quickRange === 'month' ? 'primary' : ''"
                size="small"
                @click="setQuickRange('month')"
              >本月</el-button>
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
            <el-button @click="resetFilter">重置</el-button>
          </el-space>
        </el-col>
      </el-row>
    </el-card>

    <!-- 場次列表 -->
    <el-table
      :data="sessions"
      v-loading="loading"
      border
      stripe
      style="margin-top: 16px"
    >
      <el-table-column label="日期" prop="session_date" width="120" align="center" />
      <el-table-column label="課程" prop="course_name" min-width="120" />
      <el-table-column label="出席統計" width="160" align="center">
        <template #default="{ row }">
          <span v-if="row.recorded_count === 0" class="no-record">尚未點名</span>
          <span v-else>
            <span class="present-count">{{ row.present_count }}</span>
            <span class="count-sep"> / </span>
            <span class="total-count">{{ row.recorded_count }}</span>
            <span class="count-label"> 出席</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="notes" min-width="120" show-overflow-tooltip />
      <el-table-column label="建立者" prop="created_by" width="100" align="center" />
      <el-table-column label="操作" width="150" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            :icon="Check"
            @click="openDrawer(row)"
          >點名</el-button>
          <el-button
            v-if="canWrite"
            type="danger"
            size="small"
            :icon="Delete"
            :loading="deletingId === row.id"
            @click="handleDelete(row)"
          />
        </template>
      </el-table-column>
    </el-table>

    <div v-if="sessions.length === 0 && !loading" class="empty-hint">
      目前沒有場次資料，請點擊「新增場次」建立。
    </div>

    <!-- 新增場次 Dialog -->
    <el-dialog
      v-model="createDialogVisible"
      title="新增場次"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="課程" required>
          <el-select v-model="createForm.course_id" placeholder="選擇課程" style="width: 100%">
            <el-option
              v-for="c in courses"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker
            v-model="createForm.session_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="createForm.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreate">確認建立</el-button>
      </template>
    </el-dialog>

    <!-- 點名 Drawer -->
    <el-drawer
      v-model="drawerVisible"
      :title="drawerTitle"
      direction="rtl"
      size="480px"
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
          <el-button @click="handleExport">匯出 Excel</el-button>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Check, Delete } from '@element-plus/icons-vue'
import {
  getAttendanceSessions,
  createAttendanceSession,
  deleteAttendanceSession,
  getAttendanceSession,
  batchUpdateAttendance,
  exportAttendanceSession,
  getCourses,
} from '@/api/activity'
import { PERMISSION_VALUES, getUserInfo } from '@/utils/auth'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'

const canWrite = computed(() => {
  const userInfo = getUserInfo()
  if (!userInfo) return false
  if (userInfo.permissions === -1) return true
  return (userInfo.permissions & PERMISSION_VALUES.ACTIVITY_WRITE) !== 0
})

const loading = ref(false)
const sessions = ref([])
const deletingId = ref(null)
const courses = ref([])

const filterCourseId = ref(null)
const filterStartDate = ref(null)
const filterEndDate = ref(null)
const quickRange = ref(null)

// 新增場次
const createDialogVisible = ref(false)
const createLoading = ref(false)
const createForm = ref({ course_id: null, session_date: null, notes: '' })

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
  getSessionFn: getAttendanceSession,
  updateFn: batchUpdateAttendance,
})

// 快速日期範圍
function setQuickRange(range) {
  quickRange.value = range
  const today = new Date()
  const fmt = (d) => d.toISOString().slice(0, 10)
  if (range === 'today') {
    filterStartDate.value = fmt(today)
    filterEndDate.value = fmt(today)
  } else if (range === 'week') {
    const day = today.getDay() || 7
    const mon = new Date(today)
    mon.setDate(today.getDate() - day + 1)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    filterStartDate.value = fmt(mon)
    filterEndDate.value = fmt(sun)
  } else if (range === 'month') {
    const y = today.getFullYear()
    const m = today.getMonth()
    filterStartDate.value = fmt(new Date(y, m, 1))
    filterEndDate.value = fmt(new Date(y, m + 1, 0))
  }
  loadSessions()
}

function onManualDateChange() {
  quickRange.value = null
  loadSessions()
}

async function loadSessions() {
  loading.value = true
  try {
    const params = {}
    if (filterCourseId.value) params.course_id = filterCourseId.value
    if (filterStartDate.value) params.start_date = filterStartDate.value
    if (filterEndDate.value) params.end_date = filterEndDate.value
    const res = await getAttendanceSessions(params)
    sessions.value = res.data
  } catch {
    ElMessage.error('載入場次失敗')
  } finally {
    loading.value = false
  }
}

async function loadCourses() {
  try {
    const res = await getCourses()
    courses.value = res.data
  } catch {
    // silent
  }
}

function resetFilter() {
  filterCourseId.value = null
  filterStartDate.value = null
  filterEndDate.value = null
  quickRange.value = null
  loadSessions()
}

function openCreateDialog() {
  createForm.value = {
    course_id: null,
    session_date: new Date().toISOString().slice(0, 10),
    notes: '',
  }
  createDialogVisible.value = true
}

async function handleCreate() {
  if (!createForm.value.course_id) {
    ElMessage.warning('請選擇課程')
    return
  }
  if (!createForm.value.session_date) {
    ElMessage.warning('請選擇日期')
    return
  }
  createLoading.value = true
  try {
    await createAttendanceSession(createForm.value)
    ElMessage.success('場次建立成功')
    createDialogVisible.value = false
    loadSessions()
  } catch (e) {
    const msg = e?.response?.data?.detail || '建立失敗'
    ElMessage.error(msg)
  } finally {
    createLoading.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `確定刪除「${row.course_name}」${row.session_date} 的場次及所有點名記錄？`,
      '刪除確認',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  deletingId.value = row.id
  try {
    await deleteAttendanceSession(row.id)
    ElMessage.success('已刪除')
    loadSessions()
  } catch {
    ElMessage.error('刪除失敗')
  } finally {
    deletingId.value = null
  }
}

async function handleExport() {
  if (!drawerSession.value) return
  try {
    const res = await exportAttendanceSession(drawerSession.value.id)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `點名_${drawerSession.value.course_name}_${drawerSession.value.session_date}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('匯出失敗')
  }
}

onMounted(() => {
  loadCourses()
  loadSessions()
})
</script>

<style scoped>
.attendance-view { padding: 0; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
.filter-card { margin-bottom: 0; }
.no-record { color: #94a3b8; font-size: 13px; }
.present-count { color: #22c55e; font-weight: 600; }
.count-sep { color: #94a3b8; }
.total-count { color: #334155; font-weight: 600; }
.count-label { color: #94a3b8; font-size: 12px; }
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
