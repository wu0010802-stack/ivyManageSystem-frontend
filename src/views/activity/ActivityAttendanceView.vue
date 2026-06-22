<template>
  <div class="attendance-view">
    <div class="page-header">
      <h2>點名管理</h2>
      <el-space>
        <el-button
          v-if="canWrite"
          :icon="Calendar"
          @click="openBatchDialog"
        >批次產生場次</el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          :icon="Plus"
          @click="openCreateDialog"
        >新增場次</el-button>
      </el-space>
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
            @change="onFilterChange"
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
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            :icon="Check"
            @click="openDrawer(row)"
          >點名</el-button>
          <el-button
            size="small"
            :icon="Printer"
            @click="openPrint(row)"
          >列印</el-button>
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

    <el-pagination
      v-if="total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next, jumper, sizes"
      :page-sizes="[20, 50, 100]"
      style="margin-top: 12px; justify-content: flex-end"
      @change="loadSessions"
    />

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

    <!-- 批次產生場次 Dialog：依上課星期在日期範圍展開整段場次 -->
    <el-dialog
      v-model="batchDialogVisible"
      title="批次產生場次"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form :model="batchForm" label-width="90px">
        <el-form-item label="課程" required>
          <el-select v-model="batchForm.course_id" placeholder="選擇課程" style="width: 100%">
            <el-option v-for="c in courses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="上課星期">
          <el-select v-model="batchForm.weekday" placeholder="用課程預設上課星期" clearable style="width: 100%">
            <el-option v-for="w in weekdayOptions" :key="w.value" :label="w.label" :value="w.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始日期" required>
          <el-date-picker v-model="batchForm.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="結束日期" required>
          <el-date-picker v-model="batchForm.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="batchForm.notes" type="textarea" :rows="2" />
        </el-form-item>
        <p class="batch-hint">將依上課星期在範圍內建立每週一場；已存在的日期會自動略過。</p>
      </el-form>
      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchLoading" @click="handleBatchCreate">產生場次</el-button>
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
          :percentage="(drawerSession?.total ?? 0) > 0 ? Math.round(((drawerPresentCount + drawerAbsentCount) / (drawerSession?.total ?? 1)) * 100) : 0"
          :format="() => `已點名 ${drawerPresentCount + drawerAbsentCount} / ${drawerSession?.total ?? 0} 人`"
          style="margin-bottom: 10px"
        />

        <!-- 快速操作 + 統計 Tags + 分組切換 -->
        <div class="drawer-top-actions">
          <el-space>
            <el-button v-if="canWrite" size="small" @click="setAllPresent(true)">全部出席</el-button>
            <el-button v-if="canWrite" size="small" @click="setAllPresent(false)">全部缺席</el-button>
            <el-switch
              v-model="groupByClassroom"
              active-text="按班級分組"
              inline-prompt
              @change="onGroupToggle"
            />
          </el-space>
          <el-space>
            <el-tag type="info">共 {{ drawerSession?.total ?? 0 }} 位</el-tag>
            <el-tag type="success">出席 {{ drawerPresentCount }}</el-tag>
            <el-tag type="danger">缺席 {{ drawerAbsentCount }}</el-tag>
            <el-tag type="warning">未點名 {{ drawerUnmarkedCount }}</el-tag>
          </el-space>
        </div>

        <!-- 分組模式：每班獨立 section + 全選（groups 為扁平 students 的 computed 視圖，單一資料源） -->
        <template v-if="groupByClassroom && groupedStudents.length">
          <el-collapse v-model="activeGroups" style="margin-top: 12px">
            <el-collapse-item
              v-for="g in groupedStudents"
              :key="String(g.classroom_id ?? 'unassigned')"
              :name="String(g.classroom_id ?? 'unassigned')"
            >
              <template #title>
                <span class="group-title">
                  {{ g.classroom_name }}
                  <el-tag size="small" type="info" effect="plain">{{ g.students.length }} 位</el-tag>
                  <el-tag v-if="g.classroom_id === null" size="small" type="warning" effect="plain">未分班</el-tag>
                </span>
                <el-button
                  v-if="canWrite"
                  size="small"
                  type="primary"
                  link
                  style="margin-left: auto"
                  @click.stop="setGroupPresent(g, true)"
                >全班出席</el-button>
                <el-button
                  v-if="canWrite"
                  size="small"
                  type="info"
                  link
                  @click.stop="setGroupPresent(g, false)"
                >全班缺席</el-button>
              </template>
              <el-table
                :data="g.students"
                :row-class-name="({ row }) => row.is_present === null ? 'unmarked-row' : ''"
                border
                size="small"
              >
                <el-table-column label="姓名" prop="student_name" min-width="90" />
                <el-table-column label="出席" width="100" align="center">
                  <template #default="{ row }">
                    <el-switch
                      v-model="row.is_present"
                      :active-value="true"
                      :inactive-value="false"
                      :disabled="!canWrite"
                      active-text="出席"
                      inactive-text="缺席"
                      inline-prompt
                    />
                  </template>
                </el-table-column>
                <el-table-column label="備註" min-width="100">
                  <template #default="{ row }">
                    <el-input v-model="row.attendance_notes" :disabled="!canWrite" size="small" placeholder="備註" />
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </template>

        <!-- Flat 模式：原有單一表格 -->
        <el-table
          v-else
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
                :disabled="!canWrite"
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
                :disabled="!canWrite"
                size="small"
                placeholder="備註"
              />
            </template>
          </el-table-column>
        </el-table>

        <div class="drawer-actions">
          <el-button :icon="Printer" @click="openPrintForCurrent">列印點名單</el-button>
          <el-button @click="handleExport">匯出 Excel</el-button>
          <el-button
            v-if="canWrite"
            type="primary"
            :loading="saveLoading"
            @click="handleSave(loadSessions)"
          >儲存點名</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Check, Delete, Printer, Calendar } from '@element-plus/icons-vue'
import {
  getAttendanceSessions,
  createAttendanceSession,
  createAttendanceSessionsBatch,
  deleteAttendanceSession,
  getAttendanceSession,
  batchUpdateAttendance,
  exportAttendanceSession,
  getAttendanceSessionRollPdf,
  getCourses,
} from '@/api/activity'
import { hasPermission } from '@/utils/auth'
import { todayISO, dateToLocalISO } from '@/utils/format'
import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'
import { openPdfInNewTab } from '@/utils/printPdfWindow'

import type { AttendanceStudent, AttendanceStudentGroup } from '@/composables/useActivityAttendanceDrawer'
import type { ApiBody } from '@/api/_generated/typed'

interface CourseOption { id: number; name: string }
interface SessionRow { id: number; course_name?: string; session_date?: string; recorded_count?: number; present_count?: number; notes?: string; created_by?: string }
// Extended session shape returned by the API (superset of composable's SessionData)
interface SessionDetail { id: unknown; course_name: string; session_date: string; students: AttendanceStudent[]; total?: number }

const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))

async function openPrint(row: { id: number }) {
  await openPdfInNewTab({
    fetchBlob: async () => {
      const res = await getAttendanceSessionRollPdf(row.id)
      return res.data
    },
    loadingText: '點名單載入中…',
    onError: (err: unknown) => {
      ElMessage.error((err as Error)?.message || '載入點名單失敗')
    },
  })
}

function openPrintForCurrent() {
  if (drawerSession.value?.id) openPrint({ id: drawerSession.value.id as unknown as number })
}

const loading = ref(false)
const sessions = ref<SessionRow[]>([])
const deletingId = ref<number | null>(null)
const courses = ref<CourseOption[]>([])

const filterCourseId = ref<number | null>(null)
const filterStartDate = ref<string | null>(null)
const filterEndDate = ref<string | null>(null)
const quickRange = ref<string | null>(null)

// 新增場次
const createDialogVisible = ref(false)
const createLoading = ref(false)
const createForm = ref<{ course_id: number | null; session_date: string | null; notes: string }>({ course_id: null, session_date: null, notes: '' })

// 批次產生場次
const batchDialogVisible = ref(false)
const batchLoading = ref(false)
const batchForm = ref<{ course_id: number | null; weekday: number | null; start_date: string | null; end_date: string | null; notes: string }>({ course_id: null, weekday: null, start_date: null, end_date: null, notes: '' })
const weekdayOptions = [
  { value: 0, label: '每週一' },
  { value: 1, label: '每週二' },
  { value: 2, label: '每週三' },
  { value: 3, label: '每週四' },
  { value: 4, label: '每週五' },
  { value: 5, label: '每週六' },
  { value: 6, label: '每週日' },
]

// 分頁（後端預設 limit=100，逾百場次需分頁才不會靜默消失）
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 按班級分組：預設開啟；純前端展示切換（groups 為扁平 students 的 computed 視圖，不再重打 API）
const GROUP_PREF_KEY = 'activity_attendance_group_by_classroom'
const groupByClassroom = ref(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem(GROUP_PREF_KEY) !== '0'
    : true
)
const activeGroups = ref<string[]>([])

// 點名 Drawer（共用 composable）
const {
  drawerVisible,
  drawerLoading,
  drawerSession: _drawerSession,
  saveLoading,
  sortedStudents,
  groupedStudents,
  drawerTitle,
  drawerPresentCount,
  drawerAbsentCount,
  drawerUnmarkedCount,
  openDrawer: openDrawerRaw,
  setAllPresent,
  handleSave,
} = useActivityAttendanceDrawer({
  // composable 以 unknown-arg 泛型契約定義 getSessionFn/updateFn（其 SessionData 內部
  // 型別與 codegen 後 API 型別不完全一致，如 is_present 的 undefined）；此處為已知邊界。
  // @ts-expect-error TODO(ts-strict): composable unknown-arg 契約 vs 型別化 API 的邊界
  getSessionFn: (id, params) => getAttendanceSession(id as number, params),
  // @ts-expect-error TODO(ts-strict): 同上（records 型別於邊界相接）
  updateFn: (id, records) => batchUpdateAttendance(id as number, records),
})
// Cast to extended type that includes total returned by API
const drawerSession = _drawerSession as import('vue').Ref<SessionDetail | null>

async function openDrawer(row: SessionRow) {
  await openDrawerRaw(row)
  syncActiveGroups()
}

function syncActiveGroups() {
  activeGroups.value = groupedStudents.value.map(g => String(g.classroom_id ?? 'unassigned'))
}

function onGroupToggle(val: string | number | boolean) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(GROUP_PREF_KEY, val ? '1' : '0')
  }
  // 分組為純前端 computed 視圖，切換不需重打 API
  syncActiveGroups()
}

function setGroupPresent(group: AttendanceStudentGroup, value: boolean) {
  group.students.forEach(s => { s.is_present = value })
}

// 快速日期範圍
function setQuickRange(range: string) {
  quickRange.value = range
  const today = new Date()
  if (range === 'today') {
    filterStartDate.value = dateToLocalISO(today)
    filterEndDate.value = dateToLocalISO(today)
  } else if (range === 'week') {
    const day = today.getDay() || 7
    const mon = new Date(today)
    mon.setDate(today.getDate() - day + 1)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    filterStartDate.value = dateToLocalISO(mon)
    filterEndDate.value = dateToLocalISO(sun)
  } else if (range === 'month') {
    const y = today.getFullYear()
    const m = today.getMonth()
    filterStartDate.value = dateToLocalISO(new Date(y, m, 1))
    filterEndDate.value = dateToLocalISO(new Date(y, m + 1, 0))
  }
  onFilterChange()
}

function onManualDateChange() {
  quickRange.value = null
  onFilterChange()
}

async function loadSessions() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      skip: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (filterCourseId.value) params.course_id = filterCourseId.value
    if (filterStartDate.value) params.start_date = filterStartDate.value
    if (filterEndDate.value) params.end_date = filterEndDate.value
    const res = await getAttendanceSessions(params)
    const data = res.data as { items?: SessionRow[]; total?: number } | SessionRow[]
    sessions.value = (data as { items?: SessionRow[] })?.items ?? (Array.isArray(data) ? data : [])
    total.value = (data as { total?: number })?.total ?? sessions.value.length
  } catch {
    ElMessage.error('載入場次失敗')
  } finally {
    loading.value = false
  }
}

/** 篩選條件變更時回到第一頁再載入 */
function onFilterChange() {
  page.value = 1
  loadSessions()
}

async function loadCourses() {
  try {
    const res = await getCourses()
    courses.value = (res.data as { courses?: CourseOption[] })?.courses ?? []
  } catch {
    // silent
  }
}

function resetFilter() {
  filterCourseId.value = null
  filterStartDate.value = null
  filterEndDate.value = null
  quickRange.value = null
  onFilterChange()
}

function openCreateDialog() {
  createForm.value = {
    course_id: null,
    session_date: todayISO(),
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
    // 上方守衛已確保 course_id / session_date 非空，對齊 codegen body 型別。
    await createAttendanceSession(createForm.value as ApiBody<'/activity/attendance/sessions', 'post'>)
    ElMessage.success('場次建立成功')
    createDialogVisible.value = false
    loadSessions()
  } catch (e) {
    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '建立失敗'
    ElMessage.error(msg)
  } finally {
    createLoading.value = false
  }
}

function openBatchDialog() {
  batchForm.value = { course_id: filterCourseId.value, weekday: null, start_date: todayISO(), end_date: null, notes: '' }
  batchDialogVisible.value = true
}

async function handleBatchCreate() {
  if (!batchForm.value.course_id) {
    ElMessage.warning('請選擇課程')
    return
  }
  if (!batchForm.value.start_date || !batchForm.value.end_date) {
    ElMessage.warning('請選擇起始與結束日期')
    return
  }
  batchLoading.value = true
  try {
    // 上方守衛已確保 course_id / start_date / end_date 非空，對齊 codegen body 型別。
    const payload: ApiBody<'/activity/attendance/sessions/batch', 'post'> = {
      course_id: batchForm.value.course_id as number,
      start_date: batchForm.value.start_date as string,
      end_date: batchForm.value.end_date as string,
      notes: batchForm.value.notes,
    }
    if (batchForm.value.weekday != null) payload.weekday = batchForm.value.weekday
    const res = await createAttendanceSessionsBatch(payload)
    const data = res.data as { created_count?: number; skipped_existing?: number }
    const created = data?.created_count ?? 0
    const skipped = data?.skipped_existing ?? 0
    ElMessage.success(`已建立 ${created} 場${skipped ? `，略過 ${skipped} 場（已存在）` : ''}`)
    batchDialogVisible.value = false
    loadSessions()
  } catch (e) {
    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '批次產生失敗'
    ElMessage.error(msg)
  } finally {
    batchLoading.value = false
  }
}

async function handleDelete(row: SessionRow) {
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
  const session = { id: drawerSession.value.id as unknown as number, course_name: drawerSession.value.course_name, session_date: drawerSession.value.session_date }
  try {
    const res = await exportAttendanceSession(session.id)
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `點名_${session.course_name}_${session.session_date}.xlsx`
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
.batch-hint { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; }
.no-record { color: var(--text-tertiary); font-size: 13px; }
.present-count { color: var(--color-success); font-weight: 600; }
.count-sep { color: var(--text-tertiary); }
.total-count { color: var(--neutral-700); font-weight: 600; }
.count-label { color: var(--text-tertiary); font-size: 12px; }
.empty-hint { text-align: center; color: var(--text-tertiary); padding: 32px 0; font-size: 14px; }
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
.group-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
</style>

<style>
.el-table .unmarked-row td {
  background-color: var(--color-warning-soft) !important;
}
</style>
