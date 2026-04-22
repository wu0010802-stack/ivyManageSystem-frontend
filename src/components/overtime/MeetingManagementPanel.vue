<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { getMeetings, getMeetingSummary, createBatch, updateMeeting, deleteMeeting } from '@/api/meetings'
import { ElMessage, ElMessageBox } from 'element-plus'
import { money } from '@/utils/format'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
})

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const activeTab = ref('records')
const loading = ref(false)

const query = reactive({
  year: currentYear,
  month: currentMonth,
})

const meetingRecords = ref([])
const employeeStore = useEmployeeStore()
const employees = computed(() => employeeStore.employees.filter(e => e.is_active !== false))
const summaryData = ref([])

const batchDialogVisible = ref(false)
const batchForm = reactive({
  meeting_date: '',
  meeting_type: 'staff_meeting',
  remark: '',
  selectAll: true,
})
const employeeAttendance = ref([])

const editDialogVisible = ref(false)
const editForm = reactive({
  id: null,
  attended: true,
  overtime_pay: 0,
  remark: '',
})

const fetchRecords = async () => {
  loading.value = true
  try {
    const res = await getMeetings({ year: query.year, month: query.month })
    meetingRecords.value = res.data
  } catch (error) {
    ElMessage.error('載入園務會議記錄失敗')
  } finally {
    loading.value = false
  }
}

const fetchSummary = async () => {
  loading.value = true
  try {
    const res = await getMeetingSummary({ year: query.year, month: query.month })
    summaryData.value = res.data
  } catch (error) {
    ElMessage.error('載入統計資料失敗')
  } finally {
    loading.value = false
  }
}

const groupedByDate = computed(() => {
  const groups = {}
  for (const record of meetingRecords.value) {
    if (!groups[record.meeting_date]) {
      groups[record.meeting_date] = []
    }
    groups[record.meeting_date].push(record)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, records]) => ({
      date,
      records,
      attended: records.filter(record => record.attended).length,
      absent: records.filter(record => !record.attended).length,
      total_pay: records.reduce((sum, record) => sum + (record.overtime_pay || 0), 0),
    }))
})

const handleBatchCreate = () => {
  batchForm.meeting_date = ''
  batchForm.meeting_type = 'staff_meeting'
  batchForm.remark = ''
  batchForm.selectAll = true
  employeeAttendance.value = employees.value.map(employee => ({
    id: employee.id,
    name: employee.name,
    attended: true,
  }))
  batchDialogVisible.value = true
}

const toggleSelectAll = (value) => {
  employeeAttendance.value.forEach(employee => {
    employee.attended = value
  })
}

const meetingCounts = computed(() =>
  employeeAttendance.value.reduce(
    (acc, e) => {
      if (e.attended) acc.attendedCount++
      else acc.absentCount++
      return acc
    },
    { attendedCount: 0, absentCount: 0 },
  ),
)

const submitBatch = async () => {
  if (!batchForm.meeting_date) {
    ElMessage.warning('請選擇會議日期')
    return
  }

  const attendees = employeeAttendance.value.filter(employee => employee.attended).map(employee => employee.id)
  const absentees = employeeAttendance.value.filter(employee => !employee.attended).map(employee => employee.id)

  if (attendees.length === 0 && absentees.length === 0) {
    ElMessage.warning('請至少選擇一位員工')
    return
  }

  loading.value = true
  try {
    await createBatch({
      meeting_date: batchForm.meeting_date,
      meeting_type: batchForm.meeting_type,
      attendees,
      absentees,
      remark: batchForm.remark,
    })
    ElMessage.success('批次建立完成')
    batchDialogVisible.value = false
    fetchRecords()
    if (activeTab.value === 'summary') fetchSummary()
  } catch (error) {
    ElMessage.error(`建立失敗: ${apiError(error, error.message)}`)
  } finally {
    loading.value = false
  }
}

const handleEdit = (row) => {
  editForm.id = row.id
  editForm.attended = row.attended
  editForm.overtime_pay = row.overtime_pay
  editForm.remark = row.remark || ''
  editDialogVisible.value = true
}

const submitEdit = async () => {
  try {
    await updateMeeting(editForm.id, {
      attended: editForm.attended,
      overtime_pay: editForm.overtime_pay,
      remark: editForm.remark || null,
    })
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchRecords()
    if (activeTab.value === 'summary') fetchSummary()
  } catch (error) {
    ElMessage.error('更新失敗')
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`確定刪除 ${row.employee_name} 在 ${row.meeting_date} 的紀錄？`, '警告', {
    type: 'warning',
  }).then(async () => {
    try {
      await deleteMeeting(row.id)
      ElMessage.success('刪除成功')
      fetchRecords()
      if (activeTab.value === 'summary') fetchSummary()
    } catch (error) {
      ElMessage.error('刪除失敗')
    }
  })
}

const handleDeleteDate = (dateStr) => {
  const records = meetingRecords.value.filter(record => record.meeting_date === dateStr)
  ElMessageBox.confirm(`確定刪除 ${dateStr} 的全部 ${records.length} 筆會議紀錄？`, '警告', {
    type: 'warning',
  }).then(async () => {
    try {
      await Promise.all(records.map(record => deleteMeeting(record.id)))
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

watch(activeTab, (value) => {
  if (value === 'summary') fetchSummary()
})

onMounted(() => {
  employeeStore.fetchEmployees()
  fetchRecords()
})
</script>

<template>
  <div class="meeting-page" :class="{ 'meeting-page--embedded': embedded }">
    <h2 v-if="!embedded">園務會議管理</h2>

    <el-card class="control-panel">
      <div class="controls">
        <el-select v-model="query.year" style="width: 110px;">
          <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
        </el-select>
        <el-select v-model="query.month" style="width: 90px;">
          <el-option v-for="m in 12" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
        <el-button type="primary" @click="handleBatchCreate">新增會議紀錄</el-button>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" type="card" :class="{ 'meeting-tabs--embedded': embedded }">
      <el-tab-pane label="會議記錄" name="records">
        <div v-if="groupedByDate.length > 0" v-loading="loading">
          <el-card v-for="group in groupedByDate" :key="group.date" class="date-group-card">
            <template #header>
              <div class="date-header">
                <div class="date-info">
                  <span class="date-label">{{ group.date }}</span>
                  <el-tag type="success" size="small">出席 {{ group.attended }}</el-tag>
                  <el-tag v-if="group.absent > 0" type="danger" size="small">缺席 {{ group.absent }}</el-tag>
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

      <el-tab-pane label="月度統計" name="summary">
        <el-table :data="summaryData" v-loading="loading" border stripe style="width: 100%;">
          <el-table-column prop="employee_name" label="姓名" width="120" />
          <el-table-column label="出席次數" width="100">
            <template #default="scope">
              <span class="summary-attended">{{ scope.row.attended }}</span>
            </template>
          </el-table-column>
          <el-table-column label="缺席次數" width="100">
            <template #default="scope">
              <span :class="{ 'summary-absent': scope.row.absent > 0, 'summary-muted': scope.row.absent === 0 }">
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
              <span v-if="scope.row.absent > 0" class="summary-absent">
                {{ money(scope.row.absent * 100) }} (扣節慶獎金)
              </span>
              <span v-else class="summary-muted">無</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="batchDialogVisible" title="新增園務會議紀錄" width="700px" top="5vh">
      <el-form label-width="100px">
        <el-form-item label="會議日期">
          <el-date-picker v-model="batchForm.meeting_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="加班費">
          <span class="dialog-hint">依勞基法平日加班費公式（時薪 × 1 小時 × 1.34）自動計算</span>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="batchForm.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-divider>員工出席狀況</el-divider>
        <div class="batch-actions">
          <el-checkbox v-model="batchForm.selectAll" @change="toggleSelectAll">全員出席</el-checkbox>
          <span class="text-muted">出席 {{ meetingCounts.attendedCount }} 人 / 缺席 {{ meetingCounts.absentCount }} 人</span>
        </div>
        <div class="employee-list">
          <div v-for="employee in employeeAttendance" :key="employee.id" class="employee-item">
            <span>{{ employee.name }}</span>
            <el-switch
              v-model="employee.attended"
              active-text="出席"
              inactive-text="缺席"
            />
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitBatch">確認建立</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="編輯會議紀錄" width="500px">
      <el-form label-width="100px">
        <el-form-item label="出席狀態">
          <el-switch v-model="editForm.attended" active-text="出席" inactive-text="缺席" />
        </el-form-item>
        <el-form-item label="加班費">
          <el-input-number v-model="editForm.overtime_pay" :min="0" :step="1" />
          <span class="dialog-hint">如需手動調整可直接修改</span>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" />
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
.meeting-page--embedded {
  padding-top: 4px;
}

.meeting-tabs--embedded {
  margin-top: 12px;
}

.control-panel {
  margin-bottom: var(--space-4);
}

.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.date-group-card {
  margin-bottom: var(--space-4);
}

.date-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.date-info {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}

.date-label {
  font-weight: 700;
  color: #303133;
}

.dialog-hint {
  margin-left: 12px;
  color: #909399;
}

.batch-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 12px;
}

.employee-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.employee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
}

.summary-attended {
  color: #67c23a;
  font-weight: 700;
}

.summary-absent {
  color: #f56c6c;
  font-weight: 700;
}

.summary-muted,
.text-muted {
  color: #909399;
}
</style>
