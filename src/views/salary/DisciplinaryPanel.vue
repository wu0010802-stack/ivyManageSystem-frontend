<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import {
  listDisciplinaryActions,
  createDisciplinaryAction,
  updateDisciplinaryAction,
  deleteDisciplinaryAction,
} from '@/api/disciplinary'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'

const TYPE_OPTIONS = [
  { value: 'warning', label: '警告', defaultAmount: 1000 },
  { value: 'minor', label: '小過', defaultAmount: 3000 },
  { value: 'major', label: '大過', defaultAmount: 0 },
  { value: 'commendation', label: '嘉獎', defaultAmount: 0 },
  { value: 'minor_merit', label: '小功', defaultAmount: 0 },
  { value: 'major_merit', label: '大功', defaultAmount: 0 },
]

// merit 類型（嘉獎/小功/大功）僅考核加分、不扣薪；後端對正金額回 422
const MERIT_TYPES = new Set(['commendation', 'minor_merit', 'major_merit'])

interface EmployeeOption { id: number; name: string }

const items = ref<Record<string, unknown>[]>([])
const employees = ref<EmployeeOption[]>([])
const loading = ref(false)
const filters = reactive<{ employeeId: number | null; pendingOnly: boolean }>({ employeeId: null, pendingOnly: false })

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const form = reactive({
  id: null as number | null,
  employee_id: null as number | null,
  action_date: new Date().toISOString().slice(0, 10),
  action_type: 'warning',
  deduction_amount: 0,
  reason: '',
})
const editingApplied = computed(() => {
  if (dialogMode.value !== 'edit') return false
  const row = items.value.find((i) => i.id === form.id)
  return !!row?.applied_to_salary_id
})



const typeLabel = (t: string) => TYPE_OPTIONS.find((o) => o.value === t)?.label || t

const isMeritForm = computed(() => MERIT_TYPES.has(form.action_type))

const applyTypeDefault = () => {
  if (MERIT_TYPES.has(form.action_type)) {
    form.deduction_amount = 0 // merit 不扣薪，鎖 0（後端對正金額回 422）
    return
  }
  const opt = TYPE_OPTIONS.find((o) => o.value === form.action_type)
  if (opt && !form.deduction_amount) form.deduction_amount = opt.defaultAmount
}

const employeeStore = useEmployeeStore()

const fetchEmployees = async () => {
  try {
    await employeeStore.fetchEmployees()
    employees.value = (employeeStore.employees || []) as EmployeeOption[]
  } catch {
    /* 不阻擋主流程 */
  }
}

const fetchList = async () => {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filters.employeeId) params.employee_id = filters.employeeId
    if (filters.pendingOnly) params.pending_only = true
    const res = await listDisciplinaryActions(params)
    items.value = res.data.items || []
  } catch (e) {
    ElMessage.error('載入懲處列表失敗：' + apiError(e, (e as Error).message))
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  dialogMode.value = 'create'
  form.id = null
  form.employee_id = null
  form.action_date = new Date().toISOString().slice(0, 10)
  form.action_type = 'warning'
  form.deduction_amount = 1000
  form.reason = ''
  dialogVisible.value = true
}

const openEdit = (row: Record<string, unknown>) => {
  dialogMode.value = 'edit'
  form.id = row.id as number | null
  form.employee_id = row.employee_id as number | null
  form.action_date = row.action_date as string
  form.action_type = row.action_type as string
  form.deduction_amount = row.deduction_amount as number
  form.reason = (row.reason as string) || ''
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.employee_id) {
    ElMessage.warning('請選擇員工')
    return
  }
  try {
    if (dialogMode.value === 'create') {
      await createDisciplinaryAction({
        employee_id: form.employee_id,
        action_date: form.action_date,
        action_type: form.action_type,
        deduction_amount: form.deduction_amount || 0,
        reason: form.reason || null,
      })
      ElMessage.success('新增懲處成功')
    } else {
      const payload: Record<string, unknown> = { reason: form.reason || null }
      if (!editingApplied.value) {
        payload.action_date = form.action_date
        payload.action_type = form.action_type
        payload.deduction_amount = form.deduction_amount || 0
      }
      await updateDisciplinaryAction(form.id!, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch (e) {
    ElMessage.error('儲存失敗：' + apiError(e, (e as Error).message))
  }
}

const handleDelete = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm(
      `確定刪除 ${row.employee_name} ${row.action_date} 的${typeLabel(row.action_type as string)}？`,
      '確認刪除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteDisciplinaryAction(row.id as number)
    ElMessage.success('刪除成功')
    fetchList()
  } catch (e) {
    ElMessage.error('刪除失敗：' + apiError(e, (e as Error).message))
  }
}

const formatAppliedStatus = (row: Record<string, unknown>) => {
  if (!row.applied_to_salary_id) return '待抵扣'
  const amount = (row.applied_amount as number) || 0
  if (amount < (row.deduction_amount as number)) {
    return `已抵扣 ${amount} 元（獎金不足截斷）`
  }
  return `已抵扣 ${amount} 元`
}

onMounted(() => {
  fetchEmployees()
  fetchList()
})
</script>

<template>
  <div class="disciplinary-panel">
    <el-card>
      <template #header>
        <div class="header">
          <div>
            <h3 style="margin: 0 0 4px;">懲處記錄</h3>
            <span class="hint">
              警告 / 小過 / 大過 會於下一個獎金發放月（6/5、9/5、12/5、2/5、8/5）
              自動從節慶+超額獎金扣減；節慶優先扣完才動超額。
            </span>
          </div>
          <el-button type="primary" :icon="Plus" @click="openCreate">新增懲處</el-button>
        </div>
      </template>

      <div class="filters">
        <el-select
          v-model="filters.employeeId"
          placeholder="篩選員工"
          clearable
          filterable
          style="width: 220px;"
          @change="fetchList"
        >
          <el-option
            v-for="emp in employees"
            :key="emp.id"
            :label="emp.name"
            :value="emp.id"
          />
        </el-select>
        <el-switch
          v-model="filters.pendingOnly"
          active-text="僅顯示未抵扣"
          @change="fetchList"
        />
      </div>

      <el-table :data="items" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="employee_name" label="員工" width="120" />
        <el-table-column prop="action_date" label="發生日" width="120" />
        <el-table-column label="類型" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.action_type === 'major' ? 'danger' : row.action_type === 'minor' ? 'warning' : 'info'"
            >
              {{ row.action_type_label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deduction_amount" label="扣款" width="100">
          <template #default="{ row }">
            <span v-if="row.deduction_amount > 0">{{ row.deduction_amount }}</span>
            <span v-else class="muted">（用預設）</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
        <el-table-column label="抵扣狀態" min-width="180">
          <template #default="{ row }">
            <span :class="row.applied_to_salary_id ? 'applied' : 'pending'">
              {{ formatAppliedStatus(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" :icon="Edit" @click="openEdit(row)">編輯</el-button>
            <el-button
              v-if="!row.applied_to_salary_id"
              link
              size="small"
              type="danger"
              :icon="Delete"
              @click="handleDelete(row)"
            >刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增懲處' : '編輯懲處'"
      width="500px"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="員工">
          <el-select
            v-model="form.employee_id"
            filterable
            placeholder="選擇員工"
            :disabled="dialogMode === 'edit'"
            style="width: 100%;"
          >
            <el-option
              v-for="emp in employees"
              :key="emp.id"
              :label="emp.name"
              :value="emp.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="發生日">
          <el-date-picker
            v-model="form.action_date"
            type="date"
            value-format="YYYY-MM-DD"
            :disabled="editingApplied"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="類型">
          <el-radio-group
            v-model="form.action_type"
            :disabled="editingApplied"
            @change="applyTypeDefault"
          >
            <el-radio v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="扣款金額">
          <el-input-number
            v-model="form.deduction_amount"
            :min="0"
            :step="500"
            :disabled="editingApplied || isMeritForm"
            style="width: 100%;"
          />
          <span v-if="isMeritForm" class="hint">獎勵類型（嘉獎/小功/大功）僅考核加分，不扣薪</span>
          <span v-else class="hint">0 表示用預設值（警告 1000 / 小過 3000 / 大過 0）</span>
        </el-form-item>
        <el-form-item label="原因">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            placeholder="懲處原因（選填，會留存稽核）"
          />
        </el-form-item>
        <el-alert
          v-if="editingApplied"
          type="warning"
          show-icon
          :closable="false"
          title="此筆懲處已抵扣到某筆薪資，僅可修改原因；如需撤銷請聯絡管理員。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.filters {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}
.muted {
  color: var(--el-text-color-disabled);
}
.applied {
  color: var(--el-color-success);
}
.pending {
  color: var(--el-color-warning);
}
</style>
