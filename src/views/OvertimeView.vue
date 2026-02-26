<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '@/api'
import { ElMessage } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useCrudDialog, useConfirmDelete, useDateQuery } from '@/composables'
import { downloadFile } from '@/utils/download'

const { currentYear, query } = useDateQuery()
const employeeStore = useEmployeeStore()

const loading = ref(false)
const overtimeRecords = ref([])
const pendingRecords = ref([])

const overtimeTypes = [
  { value: 'weekday', label: '平日', desc: '前2h 1.34x, 後2h 1.67x' },
  { value: 'weekend', label: '假日', desc: '全部 2x' },
  { value: 'holiday', label: '國定假日', desc: '全部 2x' },
]

const form = reactive({
  id: null,
  employee_id: null,
  overtime_date: '',
  overtime_type: 'weekday',
  start_time: '',
  end_time: '',
  hours: 1,
  reason: '',
})

const resetForm = () => {
  form.id = null
  form.employee_id = null
  form.overtime_date = ''
  form.overtime_type = 'weekday'
  form.start_time = ''
  form.end_time = ''
  form.hours = 1
  form.reason = ''
}

const populateForm = (row) => {
  form.id = row.id
  form.employee_id = row.employee_id
  form.overtime_date = row.overtime_date
  form.overtime_type = row.overtime_type
  form.start_time = row.start_time || ''
  form.end_time = row.end_time || ''
  form.hours = row.hours
  form.reason = row.reason || ''
}

const { dialogVisible, isEdit, openCreate, openEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

const fetchOvertimes = async () => {
  loading.value = true
  try {
    const params = { year: query.year, month: query.month }
    if (query.employee_id) params.employee_id = query.employee_id
    const response = await api.get('/overtimes', { params })
    overtimeRecords.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    ElMessage.error('載入加班記錄失敗')
  } finally {
    loading.value = false
  }
}

const fetchPendingOvertimes = async () => {
  try {
    const response = await api.get('/overtimes', { params: { status: 'pending' } })
    pendingRecords.value = Array.isArray(response.data) ? response.data : []
  } catch {
    // silent
  }
}

const saveOvertime = async () => {
  if (!form.employee_id || !form.overtime_date) {
    ElMessage.warning('請填寫必要欄位')
    return
  }
  try {
    const payload = {
      employee_id: form.employee_id,
      overtime_date: form.overtime_date,
      overtime_type: form.overtime_type,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      hours: form.hours,
      reason: form.reason || null,
    }
    if (isEdit.value) {
      const { employee_id, ...updatePayload } = payload
      const resp = await api.put(`/overtimes/${form.id}`, updatePayload)
      ElMessage.success(`加班記錄已更新，加班費: $${resp.data.overtime_pay?.toLocaleString() || 0}`)
    } else {
      const resp = await api.post('/overtimes', payload)
      ElMessage.success(`加班記錄已新增，加班費: $${resp.data.overtime_pay?.toLocaleString() || 0}`)
    }
    closeDialog()
    fetchOvertimes()
    fetchPendingOvertimes()
  } catch (error) {
    ElMessage.error('儲存失敗: ' + (error.response?.data?.detail || error.message))
  }
}

const onDeleteSuccess = () => {
  fetchOvertimes()
  fetchPendingOvertimes()
}

const { confirmDelete: deleteOvertime } = useConfirmDelete({
  endpoint: '/overtimes',
  onSuccess: onDeleteSuccess,
  successMsg: '已刪除',
})

const approveOvertime = async (row, approved) => {
  try {
    await api.put(`/overtimes/${row.id}/approve?approved=${approved}`)
    ElMessage.success(approved ? '已核准' : '已駁回')
    fetchOvertimes()
    fetchPendingOvertimes()
  } catch (error) {
    ElMessage.error('操作失敗')
  }
}

const money = (val) => {
  if (!val && val !== 0) return '-'
  return '$' + Number(val).toLocaleString()
}

const totalHours = computed(() => {
  return overtimeRecords.value.reduce((sum, r) => sum + (r.hours || 0), 0)
})

const totalPay = computed(() => {
  return overtimeRecords.value.reduce((sum, r) => sum + (r.overtime_pay || 0), 0)
})

onMounted(() => {
  employeeStore.fetchEmployees()
  fetchOvertimes()
  fetchPendingOvertimes()
})
</script>

<template>
  <div class="overtime-page">
    <h2>加班管理</h2>

    <el-card class="control-panel">
      <div class="controls">
        <el-select v-model="query.employee_id" placeholder="全部員工" clearable filterable style="width: 180px;">
          <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
        </el-select>
        <el-select v-model="query.year" style="width: 110px;">
          <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
        </el-select>
        <el-select v-model="query.month" style="width: 90px;">
          <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
        </el-select>
        <el-button type="primary" @click="fetchOvertimes" :loading="loading">查詢</el-button>
        <el-button type="warning" @click="downloadFile(`/exports/overtimes?year=${query.year}&month=${query.month}`, `${query.year}年${query.month}月加班記錄.xlsx`)">匯出 Excel</el-button>
        <el-button type="success" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增加班
        </el-button>
      </div>
    </el-card>

    <!-- Pending Approvals -->
    <el-card v-if="pendingRecords.length > 0" class="pending-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>待審核項目 ({{ pendingRecords.length }})</span>
          <el-tag type="warning" effect="dark" size="small">需處理</el-tag>
        </div>
      </template>
      <el-table :data="pendingRecords" style="width: 100%" size="small">
        <el-table-column prop="employee_name" label="員工" width="100" />
        <el-table-column prop="overtime_date" label="日期" width="110" />
        <el-table-column label="類型" width="90">
          <template #default="{ row }">{{ row.overtime_type_label }}</template>
        </el-table-column>
        <el-table-column prop="hours" label="時數" width="70">
          <template #default="{ row }">{{ row.hours }}h</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" show-overflow-tooltip />
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <el-button type="success" size="small" circle @click="approveOvertime(row, true)">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button type="danger" size="small" circle @click="approveOvertime(row, false)">
              <el-icon><Close /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <TableSkeleton v-if="loading && !overtimeRecords.length" :columns="8" />
    <el-table v-else :data="overtimeRecords" border stripe style="width: 100%; margin-top: 20px;" v-loading="loading" max-height="600">
      <el-table-column prop="employee_name" label="員工" width="100" />
      <el-table-column prop="overtime_date" label="日期" width="120" />
      <el-table-column label="類型" width="100">
        <template #default="scope">
          <el-tag :type="scope.row.overtime_type === 'weekday' ? '' : 'warning'" size="small">
            {{ scope.row.overtime_type_label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="時間" width="130">
        <template #default="scope">
          {{ scope.row.start_time || '-' }} ~ {{ scope.row.end_time || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="時數" width="80">
        <template #default="scope">{{ scope.row.hours }}h</template>
      </el-table-column>
      <el-table-column label="加班費" width="110">
        <template #default="scope">
          <strong>{{ money(scope.row.overtime_pay) }}</strong>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
      <el-table-column label="審核" width="100">
        <template #default="scope">
          <el-tag v-if="scope.row.is_approved === true" type="success" size="small">已核准</el-tag>
          <el-tag v-else-if="scope.row.is_approved === false" type="danger" size="small">已駁回</el-tag>
          <el-tag v-else type="warning" size="small">待審核</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="scope">
          <el-button v-if="scope.row.is_approved !== true" type="success" size="small" link @click="approveOvertime(scope.row, true)">核准</el-button>
          <el-button v-if="scope.row.is_approved !== false" type="warning" size="small" link @click="approveOvertime(scope.row, false)">駁回</el-button>
          <el-button type="primary" size="small" link @click="openEdit(scope.row)">編輯</el-button>
          <el-button type="danger" size="small" link @click="deleteOvertime(scope.row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Summary -->
    <el-card v-if="overtimeRecords.length > 0" class="summary-card">
      <div class="summary">
        <span>本月加班合計: <strong>{{ totalHours }} 小時</strong></span>
        <span>加班費合計: <strong>{{ money(totalPay) }}</strong></span>
      </div>
    </el-card>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '編輯加班' : '新增加班'" width="550px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="員工" required>
          <el-select v-model="form.employee_id" filterable placeholder="選擇員工" :disabled="isEdit" style="width: 100%;">
            <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="加班日期" required>
          <el-date-picker v-model="form.overtime_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="加班類型" required>
          <el-select v-model="form.overtime_type" style="width: 100%;">
            <el-option v-for="ot in overtimeTypes" :key="ot.value" :label="`${ot.label}（${ot.desc}）`" :value="ot.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="開始時間">
          <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="選擇時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="結束時間">
          <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="選擇時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="加班時數" required>
          <el-input-number v-model="form.hours" :min="0.5" :step="0.5" :max="12" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" @click="saveOvertime">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-5);
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.summary-card {
  margin-top: var(--space-4);
}
.summary {
  display: flex;
  gap: 40px;
  font-size: var(--text-lg);
}
.pending-card {
  margin-bottom: var(--space-5);
  border-left: 5px solid var(--color-warning) !important;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
