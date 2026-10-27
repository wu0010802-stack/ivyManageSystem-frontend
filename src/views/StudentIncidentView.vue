<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getIncidents, createIncident, updateIncident, deleteIncident } from '@/api/studentIncidents'
import { useAllClassroomStore } from '@/stores/classroomAll'
import { labelClassroomsByTerm, type ClassroomLike } from '@/utils/classroomTerm'
import { getStudents } from '@/api/students'
import { INCIDENT_TYPES, SEVERITIES, INCIDENT_TYPE_TAG as TYPE_TAG, SEVERITY_TAG } from '@/constants/studentRecords'
import { apiError } from '@/utils/error'
import { buildStudentProfileLink } from '@/utils/studentLinks'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import AdminListToolbar, { type FilterGroup } from '@/components/common/AdminListToolbar.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import { required } from '@/validators/rules'
import { useFormDirty } from '@/composables/useFormDirty'
import { useIsMobile } from '@/composables/useIsMobile'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

// 手機版（≤767.98px）：清單改卡片視圖（比照 EmployeeListView 範式）
const { isMobile } = useIsMobile()

// 手機卡片欄位（__ 前綴為 slot-only 欄）。事件描述在卡片改為全文顯示——
// 表格版靠 hover tooltip 看全文，觸控裝置無 hover
const incidentCardColumns = [
  { label: '發生時間', prop: '__occurred', formatter: (r: Record<string, unknown>) => (r.occurred_at ? String(r.occurred_at).slice(0, 16).replace('T', ' ') : '-') },
  { label: '事件類型', prop: '__type' },
  { label: '嚴重程度', prop: '__severity' },
  { label: '事件描述', prop: 'description', block: true },
  { label: '已告知家長', prop: '__notified' },
]

// 寫入控制守衛（防禦縱深；班級越權由後端 assert_student_access 把關）
const canWrite = computed(() => hasPermission('STUDENTS_WRITE'))

// ── 篩選 ────────────────────────────────────────────────
const classroomStore = useAllClassroomStore()
// 跨學期班級：dialog 會把既有紀錄的 classroom_id 塞回下拉，且「選班級→抓學生」
// 依賴這份清單。只給當期班級時，學生已編入下學年班級就整段斷掉（2026-07-30 根因）。
const classrooms = computed(() =>
  labelClassroomsByTerm(classroomStore.classrooms as ClassroomLike[]),
)
const filterClassroom = ref<number | null>(null)
const filterType = ref<string | null>(null)
const filterDateRange = ref<string[]>([])
// 空狀態文案判斷：是否有任一篩選條件生效（區分「無資料」與「篩選無結果」）
const hasActiveFilter = computed(() =>
  Boolean(filterClassroom.value) || Boolean(filterType.value) || filterDateRange.value.length === 2
)

const typeFilterGroups: FilterGroup[] = [
  { key: 'type', label: '事件類型', options: INCIDENT_TYPES.map((t) => ({ label: t, value: t })) },
]
const toolbarFilterValues = computed(() => ({ type: filterType.value }))
const onToolbarFilters = (v: Record<string, unknown>) => {
  filterType.value = (v.type as string | null) || null
  handleSearch()
}

// ── 表格 ────────────────────────────────────────────────
const incidents = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

// ── Dialog ──────────────────────────────────────────────
const dialogVisible = ref(false)
const dialogMode = ref('create') // 'create' | 'edit'
const formLoading = ref(false)
const formRef = ref<FormInstance>()
const formDialogRef = ref<InstanceType<typeof FormDialog>>()

const emptyForm = (): {
  student_id: number | null
  incident_type: string
  severity: string
  occurred_at: string
  description: string
  action_taken: string
  parent_notified: boolean
} => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
})

const form = reactive(emptyForm())
const editId = ref<number | null>(null)
const { isDirty, snapshot } = useFormDirty(form)

const formRules: FormRules = {
  student_id: [required('學生', { kind: 'select' })],
  incident_type: [required('事件類型', { kind: 'select' })],
  occurred_at: [required('發生時間', { kind: 'select' })],
  description: [required('事件描述')],
}

// 新增/編輯 Dialog 的班級/學生選擇
const dialogClassroom = ref<number | null>(null)
const dialogStudents = ref<{ id: number; name: string }[]>([])
const dialogStudentsLoading = ref(false)

const fetchIncidents = async () => {
  loading.value = true
  loadError.value = false
  try {
    const params: Record<string, unknown> = {
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (filterClassroom.value) params.classroom_id = filterClassroom.value
    if (filterType.value) params.incident_type = filterType.value
    if (filterDateRange.value?.length === 2) {
      params.start_date = filterDateRange.value[0]
      params.end_date = filterDateRange.value[1]
    }
    const res = await getIncidents(params)
    incidents.value = res.data.items
    total.value = res.data.total
  } catch (e) {
    // 清空並標記失敗，畫面顯示錯誤態而不是「尚無事件紀錄」
    loadError.value = true
    incidents.value = []
    total.value = 0
    ElMessage.error(friendlyError('載入事件紀錄失敗', e))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchIncidents()
}

const resetFilters = () => {
  filterClassroom.value = null
  filterType.value = null
  filterDateRange.value = []
  handleSearch()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchIncidents()
}

// 當 Dialog 班級改變時，載入學生
const onDialogClassroomChange = async (cid: number | null) => {
  form.student_id = null
  dialogStudents.value = []
  if (!cid) return
  dialogStudentsLoading.value = true
  try {
    const res = await getStudents({ classroom_id: cid, is_active: true, limit: 500 })
    dialogStudents.value = res.data.items || []
  } catch (e) {
    ElMessage.error(friendlyError('載入學生資料失敗', e))
  } finally {
    dialogStudentsLoading.value = false
  }
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  dialogClassroom.value = null
  dialogStudents.value = []
  editId.value = null
  dialogMode.value = 'create'
  snapshot()
  dialogVisible.value = true
}

const openEdit = (row: Record<string, unknown>) => {
  Object.assign(form, {
    student_id: (row.student_id as number | null) ?? null,
    incident_type: String(row.incident_type ?? ''),
    severity: String(row.severity ?? ''),
    occurred_at: row.occurred_at ? String(row.occurred_at).slice(0, 16) : '',
    description: String(row.description ?? ''),
    action_taken: String(row.action_taken ?? ''),
    parent_notified: Boolean(row.parent_notified),
  })
  // 預先設定班級以顯示學生
  dialogClassroom.value = (row.classroom_id as number | null) ?? null
  dialogStudents.value = [{ id: row.student_id as number, name: String(row.student_name ?? '') }]
  editId.value = row.id as number | null
  dialogMode.value = 'edit'
  snapshot()
  dialogVisible.value = true
}

const submitForm = async () => {
  // 必填走 EP rules（欄位標紅＋捲到第一個錯誤欄），ref 未綁定視同驗證失敗（fail-closed）
  const valid = formRef.value ? await formRef.value.validate().catch(() => false) : false
  if (!valid) {
    formDialogRef.value?.scrollToFirstError()
    return
  }

  formLoading.value = true
  try {
    const payload = {
      student_id: form.student_id,
      incident_type: form.incident_type,
      severity: form.severity || null,
      occurred_at: form.occurred_at,
      description: form.description,
      action_taken: form.action_taken || null,
      parent_notified: form.parent_notified,
    }

    if (dialogMode.value === 'create') {
      await createIncident(payload)
      ElMessage.success('已建立事件紀錄')
    } else {
      await updateIncident(editId.value!, payload)
      ElMessage.success('已更新事件紀錄')
    }
    dialogVisible.value = false
    fetchIncidents()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    formLoading.value = false
  }
}

// 「已告知家長」只是紀錄老師是否已用電話／當面告知，系統不會發送任何通知；
// 開關可隨時切回，所以不另外確認，但沒有寫入權限時不可切（後端會 403）。
const toggleParentNotified = async (row: Record<string, unknown>) => {
  if (!canWrite.value) return
  const newVal = !row.parent_notified
  try {
    await updateIncident(row.id as number, {
      parent_notified: newVal,
      parent_notified_at: newVal ? new Date().toISOString() : null,
    })
    row.parent_notified = newVal
    row.parent_notified_at = newVal ? new Date().toISOString() : null
    ElMessage.success(newVal ? '已記錄：已告知家長' : '已改為：尚未告知家長')
  } catch (e) {
    ElMessage.error(friendlyError('更新告知家長紀錄失敗', e))
  }
}

const handleDelete = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.student_name}」的事件紀錄嗎？刪除後無法復原。`,
      '確認刪除',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' }
    )
    await deleteIncident(row.id as number)
    ElMessage.success('已刪除')
    fetchIncidents()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const incidentTypeTagType = (t: unknown): ElTagType =>
  (TYPE_TAG as Record<string, string>)[String(t)] as ElTagType
const severityTagType = (s: unknown): ElTagType =>
  (SEVERITY_TAG as Record<string, string>)[String(s)] as ElTagType

const truncate = (text: string | null | undefined, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

onMounted(() => {
  classroomStore.fetchClassrooms()
  fetchIncidents()
})
</script>

<template>
  <div class="page-container">
    <PageHeader title="學生事件紀錄">
      <template #actions>
        <AdminCreateButton v-if="canWrite" @click="openCreate">新增事件</AdminCreateButton>
      </template>
    </PageHeader>

    <AdminListToolbar
      :searchable="false"
      :filters="typeFilterGroups"
      :filter-values="toolbarFilterValues"
      :total="total"
      @update:filter-values="onToolbarFilters"
    >
      <template #actions>
        <el-select
          v-model="filterClassroom"
          placeholder="全部班級"
          clearable
          aria-label="篩選班級"
          class="filter-select"
          @change="handleSearch"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.label" :value="c.id" />
        </el-select>
        <el-date-picker
          v-model="filterDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="開始日期"
          end-placeholder="結束日期"
          value-format="YYYY-MM-DD"
          aria-label="篩選發生日期"
          class="filter-range"
          @change="handleSearch"
        />
        <el-button v-if="hasActiveFilter" @click="resetFilters">清除篩選</el-button>
      </template>
    </AdminListToolbar>

    <!-- 表格 -->
    <TableSkeleton v-if="loading && !incidents.length" :columns="7" />
    <EmptyState
      v-else-if="loadError"
      variant="error"
      title="事件紀錄載入失敗"
      description="請重新載入；在載入成功前請勿視為沒有紀錄。"
    >
      <template #action>
        <el-button type="primary" @click="fetchIncidents">重新載入</el-button>
      </template>
    </EmptyState>
    <template v-else>
      <el-table v-if="!isMobile" :data="incidents" v-loading="loading" stripe>
        <template #empty>
          <EmptyState
            :title="hasActiveFilter ? '目前篩選條件下沒有紀錄' : '尚無事件紀錄'"
            :description="hasActiveFilter ? '試著調整班級或事件類型' : ''"
            variant="inline"
          />
        </template>
        <el-table-column label="發生時間" width="155" prop="occurred_at">
          <template #default="{ row }">
            {{ row.occurred_at ? row.occurred_at.slice(0, 16).replace('T', ' ') : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="學生姓名" width="100">
          <template #default="{ row }">
            <router-link
              v-if="buildStudentProfileLink(row.student_id, 'records')"
              :to="buildStudentProfileLink(row.student_id, 'records')!"
              class="student-link"
            >{{ row.student_name }}</router-link>
            <span v-else>{{ row.student_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="事件類型" width="100">
          <template #default="{ row }">
            <el-tag :type="incidentTypeTagType(row.incident_type)" size="small">{{ row.incident_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="嚴重程度" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.severity" :type="severityTagType(row.severity)" size="small">{{ row.severity }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="事件描述" min-width="180">
          <template #default="{ row }">
            <el-tooltip :content="row.description" placement="top" :show-after="500">
              <span>{{ truncate(row.description) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column width="110" align="center">
          <template #header>
            <el-tooltip content="記錄是否已用電話或當面告知家長；系統不會發送通知" placement="top">
              <span class="header-hint">已告知家長</span>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <el-switch
              :model-value="row.parent_notified"
              :disabled="!canWrite"
              :aria-label="`${row.student_name}已告知家長`"
              size="small"
              @change="toggleParentNotified(row)"
            />
          </template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click="openEdit(row)">編輯</el-button>
            <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <AdminListCards
        v-else
        :items="incidents"
        :columns="incidentCardColumns"
        row-key="id"
        :loading="loading"
        :empty-text="hasActiveFilter ? '目前篩選條件下沒有紀錄' : '尚無事件紀錄'"
      >
        <template #title="{ item }">
          <router-link
            v-if="buildStudentProfileLink(item.student_id as number, 'records')"
            :to="buildStudentProfileLink(item.student_id as number, 'records')!"
            class="student-link"
          >{{ item.student_name }}</router-link>
          <span v-else>{{ item.student_name }}</span>
        </template>
        <template #cell-__type="{ item }">
          <el-tag :type="incidentTypeTagType(item.incident_type)" size="small">{{ item.incident_type }}</el-tag>
        </template>
        <template #cell-__severity="{ item }">
          <el-tag v-if="item.severity" :type="severityTagType(item.severity)" size="small">{{ item.severity }}</el-tag>
          <span v-else>-</span>
        </template>
        <template #cell-__notified="{ item }">
          <el-switch
            :model-value="Boolean(item.parent_notified)"
            :disabled="!canWrite"
            :aria-label="`${item.student_name}已告知家長`"
            size="small"
            @change="toggleParentNotified(item)"
          />
        </template>
        <template v-if="canWrite" #actions="{ item }">
          <el-button size="small" text @click="openEdit(item)">編輯</el-button>
          <el-button size="small" text type="danger" @click="handleDelete(item)">刪除</el-button>
        </template>
      </AdminListCards>

      <div v-if="total > pageSize" class="pagination-row">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </template>

    <!-- 新增/編輯 Dialog -->
    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增事件紀錄' : '編輯事件紀錄'"
      size="standardNarrow"
      :dirty="isDirty"
      :loading="formLoading"
      :submit-text="dialogMode === 'create' ? '建立事件紀錄' : '儲存'"
      @submit="submitForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" class="form-grid">
        <el-form-item label="班級" class="fg-6">
          <el-select
            v-model="dialogClassroom"
            placeholder="先選班級再選學生"
            @change="onDialogClassroomChange"
          >
            <el-option v-for="c in classrooms" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生" prop="student_id" class="fg-6">
          <el-select
            v-model="form.student_id"
            :placeholder="dialogClassroom ? '選擇學生' : '請先選班級'"
            :disabled="!dialogClassroom"
            :loading="dialogStudentsLoading"
            filterable
          >
            <el-option v-for="s in dialogStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="事件類型" prop="incident_type" class="fg-6">
          <el-select v-model="form.incident_type" placeholder="選擇類型">
            <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="嚴重程度" class="fg-6">
          <el-select v-model="form.severity" placeholder="選擇嚴重程度（選填）" clearable>
            <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="發生時間" prop="occurred_at" class="fg-6">
          <el-date-picker
            v-model="form.occurred_at"
            type="datetime"
            placeholder="選擇日期時間"
            value-format="YYYY-MM-DDTHH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="已告知家長" class="fg-6">
          <el-checkbox v-model="form.parent_notified">已用電話或當面告知</el-checkbox>
          <span class="form-hint">只做紀錄，系統不會發送通知</span>
        </el-form-item>
        <el-form-item label="事件描述" prop="description" class="fg-12">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="請描述事件經過"
          />
        </el-form-item>
        <el-form-item label="處置方式" class="fg-12">
          <el-input
            v-model="form.action_taken"
            type="textarea"
            :rows="2"
            placeholder="已採取的處置措施（選填）"
          />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 0;
}
.filter-select {
  width: 200px;
}
.filter-range {
  width: 260px;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
.header-hint {
  border-bottom: 1px dashed currentColor;
  cursor: help;
}
.student-link { color: var(--el-color-primary); text-decoration: none; }
.student-link:hover { text-decoration: underline; }
</style>
