<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import api from '@/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { money } from '@/utils/format'

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const activeTab = ref('records')
const loading = ref(false)

const query = reactive({
  year: currentYear,
  month: currentMonth
})

// Data
const meetingRecords = ref([])
const employees = ref([])
const summaryData = ref([])

// Batch dialog
const batchDialogVisible = ref(false)
const batchForm = reactive({
  meeting_date: '',
  meeting_type: 'staff_meeting',
  overtime_hours: 0,
  remark: '',
  selectAll: true
})
const employeeAttendance = ref([]) // { id, name, attended }

// Edit dialog
const editDialogVisible = ref(false)
const editForm = reactive({
  id: null,
  attended: true,
  overtime_hours: 0,
  overtime_pay: 0,
  remark: ''
})

// Fetch meeting records
const fetchRecords = async () => {
  loading.value = true
  try {
    const res = await api.get('/meetings', {
      params: { year: query.year, month: query.month }
    })
    meetingRecords.value = res.data
  } catch (error) {
    ElMessage.error('載入園務會議記錄失敗')
  } finally {
    loading.value = false
  }
}

// Fetch summary
const fetchSummary = async () => {
  loading.value = true
  try {
    const res = await api.get('/meetings/summary', {
      params: { year: query.year, month: query.month }
    })
    summaryData.value = res.data
  } catch (error) {
    ElMessage.error('載入統計資料失敗')
  } finally {
    loading.value = false
  }
}

// Fetch employees
const fetchEmployees = async () => {
  try {
    const res = await api.get('/employees')
    employees.value = res.data.filter(e => e.is_active !== false)
  } catch (error) {
    ElMessage.error('載入員工列表失敗')
  }
}

// Group records by date
const groupedByDate = computed(() => {
  const groups = {}
  for (const r of meetingRecords.value) {
    if (!groups[r.meeting_date]) {
      groups[r.meeting_date] = []
    }
    groups[r.meeting_date].push(r)
  }
  // Sort by date descending
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, records]) => ({
      date,
      records,
      attended: records.filter(r => r.attended).length,
      absent: records.filter(r => !r.attended).length,
      total_pay: records.reduce((sum, r) => sum + (r.overtime_pay || 0), 0)
    }))
})

// Open batch dialog
const handleBatchCreate = () => {
  batchForm.meeting_date = ''
  batchForm.meeting_type = 'staff_meeting'
  batchForm.overtime_hours = 0
  batchForm.remark = ''
  batchForm.selectAll = true
  employeeAttendance.value = employees.value.map(e => ({
    id: e.id,
    name: e.name,
    attended: true
  }))
  batchDialogVisible.value = true
}

// Toggle select all
const toggleSelectAll = (val) => {
  employeeAttendance.value.forEach(e => {
    e.attended = val
  })
}

// Watch individual changes to sync selectAll
const attendedCount = computed(() => employeeAttendance.value.filter(e => e.attended).length)
const absentCount = computed(() => employeeAttendance.value.filter(e => !e.attended).length)

// Submit batch
const submitBatch = async () => {
  if (!batchForm.meeting_date) {
    ElMessage.warning('請選擇會議日期')
    return
  }
  const attendees = employeeAttendance.value.filter(e => e.attended).map(e => e.id)
  const absentees = employeeAttendance.value.filter(e => !e.attended).map(e => e.id)

  if (attendees.length === 0 && absentees.length === 0) {
    ElMessage.warning('請至少選擇一位員工')
    return
  }

  loading.value = true
  try {
    await api.post('/meetings/batch', {
      meeting_date: batchForm.meeting_date,
      meeting_type: batchForm.meeting_type,
      attendees,
      absentees,
      overtime_hours: batchForm.overtime_hours,
      remark: batchForm.remark
    })
    ElMessage.success('批次建立完成')
    batchDialogVisible.value = false
    fetchRecords()
    if (activeTab.value === 'summary') fetchSummary()
  } catch (error) {
    ElMessage.error('建立失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

// Edit record
const handleEdit = (row) => {
  editForm.id = row.id
  editForm.attended = row.attended
  editForm.overtime_hours = row.overtime_hours
  editForm.overtime_pay = row.overtime_pay
  editForm.remark = row.remark || ''
  editDialogVisible.value = true
}

const submitEdit = async () => {
  try {
    await api.put(`/meetings/${editForm.id}`, {
      attended: editForm.attended,
      overtime_hours: editForm.overtime_hours,
      overtime_pay: editForm.overtime_pay,
      remark: editForm.remark || null
    })
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchRecords()
    if (activeTab.value === 'summary') fetchSummary()
  } catch (error) {
    ElMessage.error('更新失敗')
  }
}

// Delete record
const handleDelete = (row) => {
  ElMessageBox.confirm(`確定刪除 ${row.employee_name} 在 ${row.meeting_date} 的紀錄？`, '警告', {
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/meetings/${row.id}`)
      ElMessage.success('刪除成功')
      fetchRecords()
      if (activeTab.value === 'summary') fetchSummary()
    } catch (error) {
      ElMessage.error('刪除失敗')
    }
  })
}

// Delete all records for a date
const handleDeleteDate = (dateStr) => {
  const records = meetingRecords.value.filter(r => r.meeting_date === dateStr)
  ElMessageBox.confirm(`確定刪除 ${dateStr} 的全部 ${records.length} 筆會議紀錄？`, '警告', {
    type: 'warning'
  }).then(async () => {
    try {
      await Promise.all(records.map(r => api.delete(`/meetings/${r.id}`)))
      ElMessage.success('刪除成功')
      fetchRecords()
    } catch (error) {
      ElMessage.error('刪除失敗')
    }
  })
}

watch([() => query.year, () => query.month], () => {
  fetchRecords()
  if (activeTab.value === 'summary') fetchSummary()
})

watch(activeTab, (val) => {
  if (val === 'summary') fetchSummary()
})

onMounted(() => {
  fetchEmployees()
  fetchRecords()
})
</script>

<template>
  <div class="meeting-page">
    <h2>園務會議管理</h2>

    <el-card class="control-panel">
      <div class="controls">
        <el-select v-model="query.year" style="width: 110px;">
          <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
        </el-select>
        <el-select v-model="query.month" style="width: 90px;">
          <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
        </el-select>
        <el-button type="primary" @click="handleBatchCreate">新增會議紀錄</el-button>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" type="card" style="margin-top: 16px;">
      <!-- Records -->
      <el-tab-pane label="會議記錄" name="records">
        <div v-if="groupedByDate.length > 0" v-loading="loading">
          <el-card v-for="group in groupedByDate" :key="group.date" class="date-group-card">
            <template #header>
              <div class="date-header">
                <div class="date-info">
                  <span class="date-label">{{ group.date }}</span>
                  <el-tag type="success" size="small">出席 {{ group.attended }}</el-tag>
                  <el-tag type="danger" size="small" v-if="group.absent > 0">缺席 {{ group.absent }}</el-tag>
                  <el-tag type="info" size="small">加班費合計 {{ money(group.total_pay) }}</el-tag>
                </div>
                <el-button type="danger" size="small" link @click="handleDeleteDate(group.date)">刪除整天</el-button>
              </div>
            </template>
            <el-table :data="group.records" stripe size="small" style="width: 100%">
              <el-table-column prop="employee_name" label="姓名" width="100" />
              <el-table-column label="狀態" width="90">
                <template #default="scope">
                  <el-tag :type="scope.row.attended ? 'success' : 'danger'" size="small">
                    {{ scope.row.attended ? '出席' : '缺席' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="加班費" width="100">
                <template #default="scope">
                  {{ money(scope.row.overtime_pay) }}
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="備註" min-width="130" />
              <el-table-column label="操作" width="130">
                <template #default="scope">
                  <el-button type="primary" size="small" link @click="handleEdit(scope.row)">編輯</el-button>
                  <el-button type="danger" size="small" link @click="handleDelete(scope.row)">刪除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
        <el-empty v-else-if="!loading" description="本月尚無會議紀錄" />
      </el-tab-pane>

      <!-- Summary -->
      <el-tab-pane label="月度統計" name="summary">
        <el-table :data="summaryData" v-loading="loading" border stripe style="width: 100%;">
          <el-table-column prop="employee_name" label="姓名" width="120" />
          <el-table-column label="出席次數" width="100">
            <template #default="scope">
              <span style="color: #67c23a; font-weight: bold;">{{ scope.row.attended }}</span>
            </template>
          </el-table-column>
          <el-table-column label="缺席次數" width="100">
            <template #default="scope">
              <span :style="{ color: scope.row.absent > 0 ? '#f56c6c' : '#909399', fontWeight: scope.row.absent > 0 ? 'bold' : 'normal' }">
                {{ scope.row.absent }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="加班費合計" width="120">
            <template #default="scope">
              {{ money(scope.row.total_pay) }}
            </template>
          </el-table-column>
          <el-table-column label="缺席扣款">
            <template #default="scope">
              <span v-if="scope.row.absent > 0" style="color: #f56c6c;">
                {{ money(scope.row.absent * 100) }} (扣節慶獎金)
              </span>
              <span v-else style="color: #909399;">無</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- Batch Create Dialog -->
    <el-dialog v-model="batchDialogVisible" title="新增園務會議紀錄" width="700px" top="5vh">
      <el-form :model="batchForm" label-width="100px">
        <el-form-item label="會議日期">
          <el-date-picker
            v-model="batchForm.meeting_date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 200px;"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="batchForm.remark" placeholder="選填" />
        </el-form-item>
      </el-form>

      <el-divider content-position="left">出席狀態</el-divider>

      <div class="batch-controls">
        <el-checkbox v-model="batchForm.selectAll" @change="toggleSelectAll">全選出席</el-checkbox>
        <span class="batch-stats">
          出席 <strong style="color: #67c23a;">{{ attendedCount }}</strong>
          / 缺席 <strong style="color: #f56c6c;">{{ absentCount }}</strong>
        </span>
      </div>

      <div class="employee-grid">
        <div
          v-for="emp in employeeAttendance"
          :key="emp.id"
          class="employee-card"
          :class="{ absent: !emp.attended }"
        >
          <el-checkbox v-model="emp.attended" :label="emp.name" />
        </div>
      </div>

      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitBatch">確認建立</el-button>
      </template>
    </el-dialog>

    <!-- Edit Dialog -->
    <el-dialog v-model="editDialogVisible" title="編輯會議紀錄" width="450px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="出席狀態">
          <el-switch
            v-model="editForm.attended"
            active-text="出席"
            inactive-text="缺席"
            active-color="#67c23a"
            inactive-color="#f56c6c"
          />
        </el-form-item>
        <el-form-item label="加班費">
          <el-input-number v-model="editForm.overtime_pay" :min="0" :step="50" />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="editForm.remark" placeholder="選填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.meeting-page {
  max-width: 1200px;
}

.control-panel {
  margin-bottom: 0;
}

.controls {
  display: flex;
  gap: 15px;
  align-items: center;
}

.date-group-card {
  margin-bottom: var(--space-4);
}

.date-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.date-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.date-label {
  font-size: var(--text-lg);
  font-weight: bold;
}

.batch-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.batch-stats {
  font-size: var(--text-base);
  color: #606266;
}

.employee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-2, 8px);
  max-height: 400px;
  overflow-y: auto;
}

.employee-card {
  padding: 8px var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-soft);
  transition: all var(--transition-base);
}

.employee-card.absent {
  background: var(--color-danger-lighter);
  border-color: var(--color-danger);
}
</style>
