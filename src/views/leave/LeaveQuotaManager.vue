<script setup lang="ts">
import { ref, computed } from 'vue'
import { getLeaveQuotas, initLeaveQuotas, updateLeaveQuota } from '@/api/leaves'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Warning, QuestionFilled } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import { LEAVE_TYPES as leaveTypes } from '@/utils/leaves'
import { getEarliestExpiringGrantForEmployee, type EarliestExpiringGrant } from '@/api/leaveQuotaExpiry'

interface QuotaRow {
  id: number
  leave_type: string
  leave_type_label: string
  total_hours: number
  used_hours: number
  pending_hours: number
  remaining_hours: number
  note?: string
  _editing: boolean
  _newTotal: number
}

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const employeeStore = useEmployeeStore()
const currentYear: number = new Date().getFullYear()

const dialogModel = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

const quotaMgrYear = ref(new Date().getFullYear())
const quotaMgrEmpId = ref<number | null>(null)
const quotaRows = ref<QuotaRow[]>([])
const quotaMgrLoading = ref(false)
const quotaSaving = ref(false)
const earliestExpiringGrant = ref<EarliestExpiringGrant | null>(null)

const loadQuotaMgr = async () => {
  if (!quotaMgrEmpId.value) return
  quotaMgrLoading.value = true
  try {
    const res = await getLeaveQuotas({ employee_id: quotaMgrEmpId.value, year: quotaMgrYear.value })
    quotaRows.value = (res as { data: Omit<QuotaRow, '_editing' | '_newTotal'>[] }).data.map(r => ({ ...r, _editing: false, _newTotal: r.total_hours }))
    const hasCompensatory = quotaRows.value.some((r) => r.leave_type === 'compensatory')
    if (hasCompensatory) {
      earliestExpiringGrant.value = await getEarliestExpiringGrantForEmployee(quotaMgrEmpId.value)
    } else {
      earliestExpiringGrant.value = null
    }
  } catch (e) {
    ElMessage.error(friendlyError('載入配額失敗', e))
  } finally {
    quotaMgrLoading.value = false
  }
}

const initQuotas = async () => {
  if (!quotaMgrEmpId.value) { ElMessage.warning('請先選擇員工'); return }
  quotaMgrLoading.value = true
  try {
    const res = await initLeaveQuotas({ employee_id: quotaMgrEmpId.value, year: quotaMgrYear.value })
    quotaRows.value = (res as { data: Omit<QuotaRow, '_editing' | '_newTotal'>[] }).data.map(r => ({ ...r, _editing: false, _newTotal: r.total_hours }))
    ElMessage.success('已依勞基法初始化配額')
  } catch (err) {
    ElMessage.error(friendlyError('初始化配額失敗', err))
  } finally {
    quotaMgrLoading.value = false
  }
}

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const leaveTagType = (leaveType: string): ElTagType => {
  const found = leaveTypes.find((t: { value: string; color?: string }) => t.value === leaveType)
  return (found?.color as ElTagType | undefined) ?? 'info'
}

const saveQuotaRow = async (row: QuotaRow) => {
  quotaSaving.value = true
  try {
    const res = await updateLeaveQuota(row.id, { total_hours: row._newTotal, note: row.note })
    Object.assign(row, (res as { data: QuotaRow }).data, { _editing: false, _newTotal: (res as { data: QuotaRow }).data.total_hours })
    ElMessage.success('已儲存')
  } catch (err) {
    ElMessage.error(friendlyError('儲存配額失敗', err))
  } finally {
    quotaSaving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="dialogModel" title="假別配額管理" width="720px" destroy-on-close>
    <div class="quota-toolbar">
      <el-select
        v-model="quotaMgrEmpId"
        filterable
        placeholder="選擇員工"
        style="width: 200px;"
        @change="loadQuotaMgr"
      >
        <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
      </el-select>
      <el-select v-model="quotaMgrYear" style="width: 110px;" @change="loadQuotaMgr">
        <el-option v-for="y in 5" :key="y" :label="`${currentYear - 2 + y} 年`" :value="currentYear - 2 + y" />
      </el-select>
      <el-button
        type="primary"
        :loading="quotaMgrLoading"
        :disabled="!quotaMgrEmpId"
        @click="initQuotas"
      >
        依勞基法初始化
      </el-button>
      <el-tooltip content="根據員工到職日自動計算特休時數，並填入各假別法定上限" placement="top">
        <el-icon style="cursor: help; color: var(--el-color-info);"><QuestionFilled /></el-icon>
      </el-tooltip>
    </div>

    <el-table
      v-loading="quotaMgrLoading"
      :data="quotaRows"
      border
      stripe
      empty-text="請選擇員工並查詢，或點擊「依勞基法初始化」自動產生"
      style="margin-top: 16px;"
    >
      <el-table-column label="假別" width="130">
        <template #default="{ row }">
          <el-tag :type="leaveTagType(row.leave_type)" size="small">
            {{ row.leave_type_label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="年度配額（h）" width="160" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="row._editing"
            v-model="row._newTotal"
            :min="0"
            :step="8"
            size="small"
            style="width: 110px;"
          />
          <span v-else>{{ row.total_hours }}h</span>
        </template>
      </el-table-column>
      <el-table-column label="已核准（h）" prop="used_hours" width="110" align="center" />
      <el-table-column label="待審（h）" prop="pending_hours" width="90" align="center">
        <template #default="{ row }">
          <span :style="row.pending_hours > 0 ? 'color: var(--el-color-warning);' : ''">
            {{ row.pending_hours }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="剩餘（h）" width="120" align="center">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="row.remaining_hours <= 0 ? 'danger' : row.remaining_hours < 16 ? 'warning' : 'success'"
          >
            {{ row.remaining_hours }}h
          </el-tag>
          <el-tooltip
            v-if="row.leave_type === 'compensatory' && earliestExpiringGrant"
            :content="`最早到期：${earliestExpiringGrant.expires_at}（${earliestExpiringGrant.unexpired_hours}h）`"
            placement="top"
          >
            <el-icon class="warn-icon" style="margin-left: 4px; color: var(--el-color-warning); vertical-align: middle;">
              <Warning />
            </el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="note" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="120" align="center">
        <template #default="{ row }">
          <template v-if="row._editing">
            <el-button size="small" type="primary" link :loading="quotaSaving" @click="saveQuotaRow(row)">儲存</el-button>
            <el-button size="small" link @click="row._editing = false; row._newTotal = row.total_hours">取消</el-button>
          </template>
          <el-button v-else size="small" link @click="row._editing = true">調整</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<style scoped>
.quota-toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
</style>
