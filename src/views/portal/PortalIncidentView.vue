<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyClassIncidents, createPortalIncident } from '@/api/studentIncidents'
import api from '@/api/index'
import { INCIDENT_TYPES, SEVERITIES, INCIDENT_TYPE_TAG as TYPE_TAG, SEVERITY_TAG } from '@/constants/studentRecords'

// ── 班級/學生 ─────────────────────────────────────────
const classrooms = ref([])      // [{ classroom_id, classroom_name, students: [...] }]
const activeClassroom = ref(null)
const classLoading = ref(false)

// ── 事件列表 ──────────────────────────────────────────
const incidents = ref([])
const total = ref(0)
const loading = ref(false)
const filterType = ref(null)
const filterDateRange = ref([])

// ── Dialog ────────────────────────────────────────────
const dialogVisible = ref(false)
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

const currentStudents = ref([])

const fetchMyStudents = async () => {
  classLoading.value = true
  try {
    const res = await api.get('/portal/my-students')
    classrooms.value = res.data.classrooms || []
    if (classrooms.value.length > 0) {
      activeClassroom.value = String(classrooms.value[0].classroom_id)
      currentStudents.value = classrooms.value[0].students || []
    }
  } catch {
    ElMessage.error('載入班級資料失敗')
  } finally {
    classLoading.value = false
  }
}

const onTabChange = (cid) => {
  const cr = classrooms.value.find(c => String(c.classroom_id) === cid)
  currentStudents.value = cr ? cr.students : []
  filterType.value = null
  filterDateRange.value = []
  fetchIncidents()
}

const fetchIncidents = async () => {
  if (!activeClassroom.value) return
  loading.value = true
  try {
    const params = { classroom_id: Number(activeClassroom.value), limit: 100 }
    if (filterType.value) params.incident_type = filterType.value
    if (filterDateRange.value?.length === 2) {
      params.start_date = filterDateRange.value[0]
      params.end_date = filterDateRange.value[1]
    }
    const res = await getMyClassIncidents(params)
    incidents.value = res.data.items
    total.value = res.data.total
  } catch {
    ElMessage.error('載入事件紀錄失敗')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.student_id || !form.incident_type || !form.occurred_at || !form.description) {
    ElMessage.warning('請填寫必填欄位（學生、類型、發生時間、描述）')
    return
  }

  formLoading.value = true
  try {
    await createPortalIncident({
      student_id: form.student_id,
      incident_type: form.incident_type,
      severity: form.severity || null,
      occurred_at: form.occurred_at,
      description: form.description,
      action_taken: form.action_taken || null,
      parent_notified: form.parent_notified,
    })
    ElMessage.success('新增成功')
    dialogVisible.value = false
    fetchIncidents()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '新增失敗')
  } finally {
    formLoading.value = false
  }
}

const truncate = (text, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

onMounted(async () => {
  await fetchMyStudents()
  fetchIncidents()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h3>事件紀錄</h3>
      <el-button type="primary" size="small" @click="openCreate">＋ 新增事件</el-button>
    </div>

    <el-tabs
      v-if="classrooms.length > 0"
      v-model="activeClassroom"
      @tab-change="onTabChange"
      v-loading="classLoading"
    >
      <el-tab-pane
        v-for="cr in classrooms"
        :key="cr.classroom_id"
        :label="cr.classroom_name"
        :name="String(cr.classroom_id)"
      />
    </el-tabs>

    <!-- 篩選列 -->
    <el-row :gutter="12" style="margin-bottom: 16px">
      <el-col :xs="12" :sm="6">
        <el-select v-model="filterType" placeholder="事件類型" clearable size="small" style="width: 100%">
          <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-col>
      <el-col :xs="24" :sm="10">
        <el-date-picker
          v-model="filterDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="開始"
          end-placeholder="結束"
          value-format="YYYY-MM-DD"
          size="small"
          style="width: 100%"
        />
      </el-col>
      <el-col :xs="12" :sm="4">
        <el-button size="small" @click="fetchIncidents">查詢</el-button>
        <el-button size="small" @click="filterType = null; filterDateRange = []; fetchIncidents()">重置</el-button>
      </el-col>
    </el-row>

    <!-- 事件表格 -->
    <el-table :data="incidents" v-loading="loading" stripe size="small">
      <el-table-column label="發生時間" width="145">
        <template #default="{ row }">
          {{ row.occurred_at ? row.occurred_at.slice(0, 16).replace('T', ' ') : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="學生姓名" width="90" prop="student_name" />
      <el-table-column label="類型" width="90">
        <template #default="{ row }">
          <el-tag :type="TYPE_TAG[row.incident_type]" size="small">{{ row.incident_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="嚴重程度" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.severity" :type="SEVERITY_TAG[row.severity]" size="small">{{ row.severity }}</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="描述" min-width="160">
        <template #default="{ row }">
          <el-tooltip :content="row.description" placement="top" :show-after="500">
            <span>{{ truncate(row.description) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="通知家長" width="85" align="center">
        <template #default="{ row }">
          <el-tag :type="row.parent_notified ? 'success' : 'info'" size="small">
            {{ row.parent_notified ? '已通知' : '未通知' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top: 8px; font-size: 13px; color: #909399">
      共 {{ total }} 筆紀錄
    </div>

    <!-- 新增 Dialog -->
    <el-dialog v-model="dialogVisible" title="新增事件紀錄" width="500px">
      <el-form label-width="90px">
        <el-form-item label="學生 *">
          <el-select v-model="form.student_id" placeholder="選擇學生" style="width: 100%">
            <el-option v-for="s in currentStudents" :key="s.id" :label="s.name" :value="s.id" />
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
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}
</style>
