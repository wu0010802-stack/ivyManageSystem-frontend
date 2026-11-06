<script setup lang="ts">
import { computed, ref } from 'vue'
import { getLeaveQuotas, initLeaveQuotas, updateLeaveQuota } from '@/api/leaves'
import { ElMessage } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
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

// 後端 QuotaUpdate.reason（api/leaves_quota.py）：去頭尾空白後 5～500 字，超出一律 400。
const QUOTA_REASON_MIN_LENGTH = 5
const QUOTA_REASON_MAX_LENGTH = 500

const employeeStore = useEmployeeStore()
const currentYear: number = new Date().getFullYear()

const quotaMgrYear = ref(new Date().getFullYear())
const quotaMgrEmpId = ref<number | null>(null)
const quotaRows = ref<QuotaRow[]>([])
const quotaMgrLoading = ref(false)
const quotaSaving = ref(false)
const earliestExpiringGrant = ref<EarliestExpiringGrant | null>(null)

// 儲存配額必填「調整原因」（QA payroll 2026-11-05 F90）：點儲存先開對話框，確認後才送出。
// 開啟當下就擷取前後時數，對話框顯示與送出都用這份快照。
const reasonVisible = ref(false)
const reason = ref('')
const pendingChange = ref<{ row: QuotaRow; before: number; after: number } | null>(null)
// 以字元計（對齊後端 Python len，emoji 不會被算成兩字）
const reasonLength = computed(() => Array.from(reason.value.trim()).length)
const reasonValid = computed(
  () => reasonLength.value >= QUOTA_REASON_MIN_LENGTH && reasonLength.value <= QUOTA_REASON_MAX_LENGTH,
)

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

const requestQuotaSave = (row: QuotaRow) => {
  pendingChange.value = { row, before: row.total_hours, after: row._newTotal }
  reason.value = ''
  reasonVisible.value = true
}

// 失敗（含特休調高被 403 要求金流簽核、原因過長 400）時對話框與原因保留，訊息沿用後端文字。
const confirmQuotaSave = async () => {
  const change = pendingChange.value
  if (!change || !reasonValid.value || quotaSaving.value) return
  quotaSaving.value = true
  try {
    const res = await updateLeaveQuota(change.row.id, {
      total_hours: change.after,
      note: change.row.note,
      reason: reason.value.trim(),
    })
    const saved = (res as { data: QuotaRow }).data
    Object.assign(change.row, saved, { _editing: false, _newTotal: saved.total_hours })
    reasonVisible.value = false
    ElMessage.success('已儲存')
  } catch (err) {
    ElMessage.error(friendlyError('儲存配額失敗', err))
  } finally {
    quotaSaving.value = false
  }
}

const onReasonDialogClosed = () => {
  pendingChange.value = null
  reason.value = ''
}

// 供父層（配額總覽表的「調整」連結）呼叫：選定員工並立即查詢，
// 把本元件從「等使用者手動選人」變成「可被外部帶入焦點」。
defineExpose({
  focusEmployee: (employeeId: number) => {
    quotaMgrEmpId.value = employeeId
    loadQuotaMgr()
  },
})
</script>

<template>
  <div class="quota-manager">
    <h3 class="quota-manager__title">調整員工配額</h3>
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
            <el-button size="small" type="primary" link :loading="quotaSaving" @click="requestQuotaSave(row)">儲存</el-button>
            <el-button size="small" link @click="row._editing = false; row._newTotal = row.total_hours">取消</el-button>
          </template>
          <el-button v-else size="small" link @click="row._editing = true">調整</el-button>
        </template>
      </el-table-column>
    </el-table>

    <FormDialog
      v-model="reasonVisible"
      title="確認調整配額"
      size="compact"
      submit-text="確認儲存"
      :loading="quotaSaving"
      :disabled="!reasonValid"
      @submit="confirmQuotaSave"
      @closed="onReasonDialogClosed"
    >
      <p v-if="pendingChange" class="quota-change" data-test="quota-change">
        {{ pendingChange.row.leave_type_label }}：{{ pendingChange.before }}h → {{ pendingChange.after }}h
      </p>
      <p
        v-if="pendingChange?.row.leave_type === 'annual'"
        class="quota-hint"
        data-test="quota-annual-hint"
      >
        特休配額會折現進離職結算與年度結算；調高 8 小時以上需由具備金流簽核權限者處理。
      </p>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="調整原因" required>
          <el-input
            v-model="reason"
            type="textarea"
            :rows="3"
            :maxlength="QUOTA_REASON_MAX_LENGTH"
            show-word-limit
            placeholder="說明為何調整配額，例如：主管核准補發額外特休、到職日更正後重算"
          />
          <div class="quota-reason-hint" :class="{ 'is-short': !!reason.trim() && !reasonValid }">
            至少 {{ QUOTA_REASON_MIN_LENGTH }} 字（目前 {{ reasonLength }} 字），會寫入稽核紀錄供事後查核
          </div>
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.quota-manager__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 var(--space-3);
}
.quota-toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.quota-change {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  font-weight: 600;
}
.quota-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.quota-reason-hint {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.quota-reason-hint.is-short {
  color: var(--el-color-warning);
}
</style>
