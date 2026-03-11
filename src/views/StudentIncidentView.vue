<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getIncidents, createIncident, updateIncident, deleteIncident } from '@/api/studentIncidents'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'

const INCIDENT_TYPES = ['身體健康', '意外受傷', '行為觀察', '其他']
const SEVERITIES = ['輕微', '中度', '嚴重']

const TYPE_TAG = {
  '身體健康': 'warning',
  '意外受傷': 'danger',
  '行為觀察': 'info',
  '其他': '',
}

const SEVERITY_TAG = {
  '輕微': 'success',
  '中度': 'warning',
  '嚴重': 'danger',
}

// ── 篩選 ────────────────────────────────────────────────
const classrooms = ref([])
const filterClassroom = ref(null)
const filterType = ref(null)
const filterDateRange = ref([])

// ── 表格 ────────────────────────────────────────────────
const incidents = ref([])
const total = ref(0)
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

// ── Dialog ──────────────────────────────────────────────
const dialogVisible = ref(false)
const dialogMode = ref('create') // 'create' | 'edit'
const formLoading = ref(false)

const emptyForm = () => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
})

const form = reactive(emptyForm())
const editId = ref(null)

// 新增/編輯 Dialog 的班級/學生選擇
const dialogClassroom = ref(null)
const dialogStudents = ref([])
const dialogStudentsLoading = ref(false)

const fetchClassrooms = async () => {
  try {
    const res = await getClassrooms()
    classrooms.value = (res.data || []).filter(c => c.is_active !== false)
  } catch {
    ElMessage.error('載入班級資料失敗')
  }
}

const fetchIncidents = async () => {
  loading.value = true
  try {
    const params = {
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
  } catch {
    ElMessage.error('載入事件紀錄失敗')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchIncidents()
}

const handlePageChange = (page) => {
  currentPage.value = page
  fetchIncidents()
}

// 當 Dialog 班級改變時，載入學生
const onDialogClassroomChange = async (cid) => {
  form.student_id = null
  dialogStudents.value = []
  if (!cid) return
  dialogStudentsLoading.value = true
  try {
    const res = await getStudents({ classroom_id: cid, is_active: true })
    dialogStudents.value = res.data.items || []
  } catch {
    ElMessage.error('載入學生資料失敗')
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
  dialogVisible.value = true
}

const openEdit = (row) => {
  Object.assign(form, {
    student_id: row.student_id,
    incident_type: row.incident_type,
    severity: row.severity || '',
    occurred_at: row.occurred_at ? row.occurred_at.slice(0, 16) : '',
    description: row.description,
    action_taken: row.action_taken || '',
    parent_notified: row.parent_notified,
  })
  // 預先設定班級以顯示學生
  dialogClassroom.value = row.classroom_id
  dialogStudents.value = [{ id: row.student_id, name: row.student_name }]
  editId.value = row.id
  dialogMode.value = 'edit'
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.student_id || !form.incident_type || !form.occurred_at || !form.description) {
    ElMessage.warning('請填寫必填欄位（學生、類型、發生時間、描述）')
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
      ElMessage.success('新增成功')
    } else {
      await updateIncident(editId.value, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    fetchIncidents()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '操作失敗')
  } finally {
    formLoading.value = false
  }
}

// 通知家長開關（表格內直接更新）
const toggleParentNotified = async (row) => {
  const newVal = !row.parent_notified
  try {
    await updateIncident(row.id, {
      parent_notified: newVal,
      parent_notified_at: newVal ? new Date().toISOString() : null,
    })
    row.parent_notified = newVal
    row.parent_notified_at = newVal ? new Date().toISOString() : null
    ElMessage.success(newVal ? '已標記通知家長' : '已取消通知標記')
  } catch {
    ElMessage.error('更新失敗')
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.student_name}」的事件紀錄嗎？`,
      '確認刪除',
      { type: 'warning' }
    )
    await deleteIncident(row.id)
    ElMessage.success('刪除成功')
    fetchIncidents()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.detail || '刪除失敗')
  }
}

const truncate = (text, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

onMounted(() => {
  fetchClassrooms()
  fetchIncidents()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>學生事件紀錄</h2>
      <el-button type="primary" @click="openCreate">＋ 新增事件</el-button>
    </div>

    <!-- 篩選列 -->
    <el-card class="filter-card" shadow="never">
      <el-row :gutter="12" align="middle">
        <el-col :xs="24" :sm="6">
          <el-select v-model="filterClassroom" placeholder="篩選班級" clearable style="width: 100%">
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="5">
          <el-select v-model="filterType" placeholder="事件類型" clearable style="width: 100%">
            <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-date-picker
            v-model="filterDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="開始日期"
            end-placeholder="結束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-col>
        <el-col :xs="24" :sm="5">
          <el-button type="primary" @click="handleSearch">查詢</el-button>
          <el-button @click="filterClassroom = null; filterType = null; filterDateRange = []; handleSearch()">重置</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never" style="margin-top: 16px">
      <el-table :data="incidents" v-loading="loading" stripe>
        <el-table-column label="發生時間" width="155" prop="occurred_at">
          <template #default="{ row }">
            {{ row.occurred_at ? row.occurred_at.slice(0, 16).replace('T', ' ') : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="學生姓名" width="100" prop="student_name" />
        <el-table-column label="事件類型" width="100">
          <template #default="{ row }">
            <el-tag :type="TYPE_TAG[row.incident_type]" size="small">{{ row.incident_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="嚴重程度" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.severity" :type="SEVERITY_TAG[row.severity]" size="small">{{ row.severity }}</el-tag>
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
        <el-table-column label="通知家長" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.parent_notified"
              @change="toggleParentNotified(row)"
              size="small"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click="openEdit(row)">編輯</el-button>
            <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display: flex; justify-content: flex-end; margin-top: 16px">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 新增/編輯 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增事件紀錄' : '編輯事件紀錄'"
      width="560px"
    >
      <el-form label-width="90px">
        <el-form-item label="班級">
          <el-select
            v-model="dialogClassroom"
            placeholder="選擇班級"
            @change="onDialogClassroomChange"
            style="width: 100%"
          >
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生 *">
          <el-select
            v-model="form.student_id"
            placeholder="選擇學生"
            :loading="dialogStudentsLoading"
            style="width: 100%"
          >
            <el-option v-for="s in dialogStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="事件類型 *">
          <el-select v-model="form.incident_type" placeholder="選擇類型" style="width: 100%">
            <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="嚴重程度">
          <el-select v-model="form.severity" placeholder="選擇嚴重程度" clearable style="width: 100%">
            <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="發生時間 *">
          <el-date-picker
            v-model="form.occurred_at"
            type="datetime"
            placeholder="選擇日期時間"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="事件描述 *">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="請描述事件經過"
          />
        </el-form-item>
        <el-form-item label="處置方式">
          <el-input
            v-model="form.action_taken"
            type="textarea"
            :rows="2"
            placeholder="已採取的處置措施"
          />
        </el-form-item>
        <el-form-item label="通知家長">
          <el-checkbox v-model="form.parent_notified">已通知家長</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="submitForm">確認</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 0;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}
.filter-card {
  margin-bottom: 0;
}
</style>
