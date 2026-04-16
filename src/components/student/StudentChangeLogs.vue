<template>
  <div class="change-logs">
    <!-- 學期選擇器 + 新增按鈕 -->
    <div class="toolbar">
      <el-select v-model="selectedTermKey" style="width: 220px">
        <el-option
          v-for="t in termOptions"
          :key="t.key"
          :label="t.label"
          :value="t.key"
        />
      </el-select>
      <el-select
        v-model="filterEventTypes"
        multiple
        collapse-tags
        placeholder="篩選異動類型"
        clearable
        style="width: 200px"
      >
        <el-option v-for="et in eventTypes" :key="et" :label="et" :value="et" />
      </el-select>
      <el-button type="primary" @click="openCreateDialog">＋ 新增補登</el-button>
    </div>

    <!-- 摘要卡片 -->
    <el-row :gutter="12" class="summary-row" v-if="summary">
      <el-col v-for="et in eventTypes" :key="et" :xs="12" :sm="8" :md="4">
        <el-card class="summary-card" shadow="hover">
          <div class="summary-value">{{ summary[et] ?? 0 }}</div>
          <div class="summary-label">{{ et }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 列表 -->
    <el-card class="table-card" v-loading="loading">
      <el-table :data="logs" border stripe style="width: 100%">
        <el-table-column label="異動日期" prop="event_date" width="110" align="center" />
        <el-table-column label="學生姓名" prop="student_name" width="100" />
        <el-table-column label="班級" prop="classroom_name" width="100" />
        <el-table-column label="異動類型" prop="event_type" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="eventTagType(row.event_type)" size="small">
              {{ row.event_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="原因" prop="reason" width="120" />
        <el-table-column label="備註" prop="notes" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEditDialog(row)">編輯</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        class="pagination"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="(p) => { currentPage = p; fetchLogs() }"
      />
    </el-card>

    <!-- 新增/編輯彈窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增補登異動紀錄' : '編輯異動紀錄'"
      width="520px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="學年學期" prop="termKey" v-if="dialogMode === 'create'">
          <el-select v-model="form.termKey" style="width: 100%">
            <el-option
              v-for="t in allTermOptions"
              :key="t.key"
              :label="t.label"
              :value="t.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="學生" prop="student_id" v-if="dialogMode === 'create'">
          <el-select
            v-model="form.student_id"
            filterable
            remote
            :remote-method="searchStudents"
            :loading="studentSearchLoading"
            placeholder="輸入姓名搜尋"
            style="width: 100%"
            clearable
          >
            <el-option
              v-for="s in studentOptions"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="異動類型" prop="event_type">
          <el-select v-model="form.event_type" style="width: 100%" @change="form.reason = ''">
            <el-option v-for="et in eventTypes" :key="et" :label="et" :value="et" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <el-select v-model="form.reason" style="width: 100%" clearable>
            <el-option
              v-for="r in currentReasonOptions"
              :key="r"
              :label="r"
              :value="r"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="異動日期" prop="event_date">
          <el-date-picker
            v-model="form.event_date"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input
            v-model="form.notes"
            type="textarea"
            :rows="3"
            placeholder="補充說明（選填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ dialogMode === 'create' ? '新增' : '儲存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { getChangeLogs, getChangeLogsSummary, getChangeLogOptions,
  createChangeLog, updateChangeLog, deleteChangeLog } from '@/api/studentChangeLogs'
import { getStudents } from '@/api/students'

// ── 學期選擇 ──────────────────────────────────────────
const termStore = useAcademicTermStore()
const currentAcademicTerm = getCurrentAcademicTerm()

const semLabel = (s) => (s === 1 ? '上學期' : '下學期')
const makeTerm = (sy, sem) => ({ key: `${sy}-${sem}`, school_year: sy, semester: sem, label: `${sy}學年度 ${semLabel(sem)}` })

const termOptions = computed(() => {
  const { school_year: cy, semester: cs } = currentAcademicTerm
  const prevTerm = cs === 1 ? { school_year: cy - 1, semester: 2 } : { school_year: cy, semester: 1 }
  const nextTerm = cs === 1 ? { school_year: cy, semester: 2 } : { school_year: cy + 1, semester: 1 }
  return [
    makeTerm(prevTerm.school_year, prevTerm.semester),
    { ...makeTerm(cy, cs), label: `${cy}學年度 ${semLabel(cs)}（本學期）` },
    makeTerm(nextTerm.school_year, nextTerm.semester),
  ]
})

// 補登時可選更多學期（含更早的 3 個學期）
const allTermOptions = computed(() => {
  const { school_year: cy, semester: cs } = currentAcademicTerm
  const terms = []
  let sy = cy, s = cs
  for (let i = 0; i < 6; i++) {
    terms.push(makeTerm(sy, s))
    if (s === 1) { s = 2; sy -= 1 } else { s = 1 }
  }
  return terms
})

const selectedTermKey = computed({
  get: () => `${termStore.school_year}-${termStore.semester}`,
  set: (val) => {
    const [y, s] = val.split('-').map(Number)
    termStore.setTerm(y, s)
  },
})

// ── 選項資料 ──────────────────────────────────────────
const eventTypes = ref([])
const reasonOptions = ref({})

const loadOptions = async () => {
  try {
    const res = await getChangeLogOptions()
    eventTypes.value = res.data.event_types
    reasonOptions.value = res.data.reason_options
  } catch {
    eventTypes.value = ['入學', '復學', '退學', '轉出', '轉入', '畢業']
  }
}

// ── 列表資料 ──────────────────────────────────────────
const logs = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterEventTypes = ref([])
const summary = ref(null)

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = {
      school_year: termStore.school_year,
      semester: termStore.semester,
      page: currentPage.value,
      page_size: pageSize.value,
    }
    if (filterEventTypes.value.length) params.event_type = filterEventTypes.value
    const [logsRes, summaryRes] = await Promise.all([
      getChangeLogs(params),
      getChangeLogsSummary({ school_year: termStore.school_year, semester: termStore.semester }),
    ])
    logs.value = logsRes.data.items
    total.value = logsRes.data.total
    summary.value = summaryRes.data.summary
  } catch {
    ElMessage.error('載入異動紀錄失敗')
  } finally {
    loading.value = false
  }
}

watch(selectedTermKey, () => { currentPage.value = 1; fetchLogs() })
watch(filterEventTypes, () => { currentPage.value = 1; fetchLogs() })

// ── 學生搜尋 ──────────────────────────────────────────
const studentOptions = ref([])
const studentSearchLoading = ref(false)

const searchStudents = async (query) => {
  if (!query) return
  studentSearchLoading.value = true
  try {
    const res = await getStudents({ search: query, page_size: 20 })
    studentOptions.value = res.data.items || []
  } catch {
    studentOptions.value = []
  } finally {
    studentSearchLoading.value = false
  }
}

// ── 彈窗 ──────────────────────────────────────────────
const dialogVisible = ref(false)
const dialogMode = ref('create')
const submitting = ref(false)
const editingId = ref(null)
const formRef = ref(null)

const defaultForm = () => ({
  termKey: `${termStore.school_year}-${termStore.semester}`,
  student_id: null,
  event_type: '',
  event_date: '',
  reason: '',
  notes: '',
})

const form = ref(defaultForm())

const formRules = {
  student_id: [{ required: true, message: '請選擇學生', trigger: 'change' }],
  event_type: [{ required: true, message: '請選擇異動類型', trigger: 'change' }],
  event_date: [{ required: true, message: '請選擇異動日期', trigger: 'change' }],
}

const currentReasonOptions = computed(() =>
  form.value.event_type ? (reasonOptions.value[form.value.event_type] || []) : []
)

const openCreateDialog = () => {
  dialogMode.value = 'create'
  form.value = defaultForm()
  studentOptions.value = []
  dialogVisible.value = true
}

const openEditDialog = (row) => {
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.value = {
    termKey: `${row.school_year}-${row.semester}`,
    student_id: row.student_id,
    event_type: row.event_type,
    event_date: row.event_date,
    reason: row.reason || '',
    notes: row.notes || '',
  }
  dialogVisible.value = true
}

const resetForm = () => {
  formRef.value?.resetFields()
  editingId.value = null
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      const [school_year, semester] = form.value.termKey.split('-').map(Number)
      await createChangeLog({
        student_id: form.value.student_id,
        school_year,
        semester,
        event_type: form.value.event_type,
        event_date: form.value.event_date,
        reason: form.value.reason || undefined,
        notes: form.value.notes || undefined,
      })
      ElMessage.success('異動紀錄已新增')
    } else {
      await updateChangeLog(editingId.value, {
        event_type: form.value.event_type,
        event_date: form.value.event_date,
        reason: form.value.reason || undefined,
        notes: form.value.notes || undefined,
      })
      ElMessage.success('異動紀錄已更新')
    }
    dialogVisible.value = false
    fetchLogs()
  } catch {
    ElMessage.error(dialogMode.value === 'create' ? '新增失敗' : '更新失敗')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (row) => {
  await ElMessageBox.confirm(`確定刪除「${row.student_name}」的${row.event_type}紀錄？`, '確認刪除', {
    type: 'warning',
    confirmButtonText: '刪除',
    confirmButtonClass: 'el-button--danger',
  })
  try {
    await deleteChangeLog(row.id)
    ElMessage.success('已刪除')
    fetchLogs()
  } catch {
    ElMessage.error('刪除失敗')
  }
}

// ── Tag 樣式 ──────────────────────────────────────────
const eventTagType = (type) => {
  const map = { 入學: 'success', 復學: 'success', 退學: 'danger', 轉出: 'warning', 轉入: 'primary', 畢業: 'info' }
  return map[type] || ''
}

onMounted(async () => {
  await loadOptions()
  fetchLogs()
})
</script>

<style scoped>
.change-logs { padding: 0; }
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.summary-row { margin-bottom: 14px; }
.summary-card { text-align: center; }
.summary-value { font-size: 26px; font-weight: 700; color: var(--color-primary, #4f46e5); }
.summary-label { font-size: 13px; color: #64748b; margin-top: 4px; }
.table-card { }
.pagination { margin-top: 12px; justify-content: flex-end; display: flex; }
</style>
