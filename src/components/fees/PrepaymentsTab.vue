<template>
  <div class="prepayments-tab">
    <!-- ── 預繳額度 ─────────────────────────────────────────────── -->
    <div class="toolbar">
      <el-select v-model="filters.status" clearable placeholder="狀態" style="width: 150px" @change="fetchCredits">
        <el-option v-for="(label, key) in CREDIT_STATUS_LABELS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-input-number
        v-model="filters.target_school_year"
        :controls="false"
        placeholder="目標學年"
        style="width: 110px"
        @change="fetchCredits"
      />
      <el-select v-model="filters.target_semester" clearable placeholder="學期" style="width: 100px" @change="fetchCredits">
        <el-option label="上" :value="1" />
        <el-option label="下" :value="2" />
      </el-select>
      <el-button @click="fetchCredits">重新整理</el-button>
      <span class="hint">每名幼生每學期固定預繳 NT$5,000；銀行/現金收款於對帳與現金收款流程建立</span>
    </div>

    <el-table :data="credits" size="small" border v-loading="loading" data-test="credit-table">
      <el-table-column label="對象" min-width="130">
        <template #default="{ row }">
          <template v-if="row.student_id">{{ row.student_name }}（學生）</template>
          <template v-else>{{ row.visit_child_name }}（招生訪視）</template>
        </template>
      </el-table-column>
      <el-table-column label="目標學期" width="100">
        <template #default="{ row }">
          {{ row.target_school_year }}-{{ row.target_semester === 1 ? '上' : '下' }}
        </template>
      </el-table-column>
      <el-table-column label="原始金額" width="100" align="right">
        <template #default="{ row }">{{ formatCurrency(row.original_amount) }}</template>
      </el-table-column>
      <el-table-column label="可用餘額" width="100" align="right">
        <template #default="{ row }">{{ formatCurrency(row.balance) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag :type="creditStatusTag(row.status)" size="small">
            {{ CREDIT_STATUS_LABELS[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="260">
        <template #default="{ row }">
          <el-button size="small" text data-test="movements-btn" @click="openMovements(row)">流水</el-button>
          <el-button
            v-if="canWrite && row.status === 'available' && !row.student_id"
            size="small"
            type="primary"
            text
            data-test="transfer-btn"
            @click="doTransfer(row)"
          >
            轉正式學生
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'available' && row.student_id"
            size="small"
            type="primary"
            text
            data-test="apply-btn"
            @click="openApply(row)"
          >
            套用註冊費
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'applied'"
            size="small"
            type="warning"
            text
            @click="doReverseApply(row)"
          >
            沖銷套用
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'available'"
            size="small"
            type="danger"
            text
            data-test="refund-btn"
            @click="doRequestRefund(row)"
          >
            申請退款
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- ── 退款管理 ─────────────────────────────────────────────── -->
    <h4 class="section-title">預繳退款（老闆另行現金支出，不影響會計交接額）</h4>
    <el-table :data="refunds" size="small" border data-test="refund-table">
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column prop="prepayment_credit_id" label="預繳單" width="80" />
      <el-table-column label="金額" width="100" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="130">
        <template #default="{ row }">
          <el-tag :type="refundStatusTag(row.status)" size="small">
            {{ REFUND_STATUS_LABELS[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="140" />
      <el-table-column label="領款人/交付時間" min-width="150">
        <template #default="{ row }">
          <template v-if="row.status === 'completed'">
            {{ row.recipient_name }}｜{{ row.disbursed_at?.slice(0, 16) ?? '' }}
          </template>
          <template v-else>—</template>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="220">
        <template #default="{ row }">
          <el-button
            v-if="canApprove && row.status === 'requested'"
            size="small"
            type="primary"
            text
            data-test="approve-refund"
            @click="doApprove(row)"
          >
            老闆核准
          </el-button>
          <el-button
            v-if="canApprove && row.status === 'approved'"
            size="small"
            type="success"
            text
            data-test="complete-refund"
            @click="doComplete(row)"
          >
            完成交付
          </el-button>
          <el-button
            v-if="canWrite && ['requested', 'approved'].includes(row.status)"
            size="small"
            type="danger"
            text
            @click="doCancel(row)"
          >
            取消
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 流水 dialog -->
    <el-dialog v-model="movementsVisible" title="預繳資金流水" width="640px">
      <el-timeline data-test="movement-timeline">
        <el-timeline-item
          v-for="m in movements"
          :key="m.id"
          :timestamp="m.occurred_at?.slice(0, 16)"
          :type="m.amount > 0 ? 'success' : m.amount < 0 ? 'danger' : 'info'"
        >
          {{ MOVEMENT_LABELS[m.movement_type] ?? m.movement_type }}
          {{ m.amount === 0 ? '' : formatCurrency(m.amount) }}
          <span v-if="m.reason" class="hint">（{{ m.reason }}）</span>
        </el-timeline-item>
      </el-timeline>
    </el-dialog>

    <!-- 套用 dialog -->
    <el-dialog v-model="applyVisible" title="套用預繳到註冊費" width="560px">
      <p v-if="applyCredit">
        {{ applyCredit.student_name }}｜目標學期
        {{ applyCredit.target_school_year }}-{{ applyCredit.target_semester === 1 ? '上' : '下' }}
        ｜折抵 NT$5,000（先同胞九折、再扣預繳）
      </p>
      <el-table :data="applyRecords" size="small" border highlight-current-row @current-change="(r: FeeRecordRow | null) => (applyTarget = r)">
        <el-table-column prop="id" label="單號" width="70" />
        <el-table-column prop="fee_item_name" label="項目" min-width="120" />
        <el-table-column prop="period" label="學期" width="80" />
        <el-table-column label="應繳/已繳" width="150" align="right">
          <template #default="{ row }">
            {{ formatCurrency(row.amount_due) }} / {{ formatCurrency(row.amount_paid) }}
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="applyVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!applyTarget"
          data-test="apply-confirm"
          @click="doApply"
        >
          確認套用
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  applyPrepayment,
  approvePrepaymentRefund,
  cancelPrepaymentRefund,
  completePrepaymentRefund,
  createPrepaymentRefund,
  getFeeRecords,
  getPrepaymentMovements,
  getPrepaymentRefunds,
  getPrepayments,
  reversePrepaymentApply,
  transferPrepayment,
} from '@/api/fees'

interface CreditRow {
  id: number
  student_id: number | null
  student_name: string | null
  recruitment_visit_id: number | null
  visit_child_name: string | null
  target_school_year: number
  target_semester: number
  original_amount: number
  status: string
  balance: number
}
interface RefundRow {
  id: number
  prepayment_credit_id: number
  amount: number
  status: string
  reason: string
  recipient_name: string | null
  disbursed_at: string | null
}
interface MovementRow {
  id: number
  movement_type: string
  amount: number
  occurred_at: string
  reason: string | null
}
interface FeeRecordRow {
  id: number
  fee_item_name: string
  period: string
  amount_due: number
  amount_paid: number
  fee_type: string | null
}

const CREDIT_STATUS_LABELS: Record<string, string> = {
  available: '可用',
  applied: '已套用',
  refund_pending: '退款處理中',
  refunded: '已退款',
  reversed: '已沖銷',
}
const REFUND_STATUS_LABELS: Record<string, string> = {
  requested: '待老闆核准',
  approved: '已核准（待領款）',
  completed: '已完成',
  cancelled: '已取消',
  reversed: '已沖銷',
}
const MOVEMENT_LABELS: Record<string, string> = {
  received: '收到預繳',
  applied: '套用註冊費',
  refunded: '現金退款',
  reversed: '沖銷',
  transferred: '訪視轉正式學生',
}

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))
const canApprove = computed(() => hasPermission(PERMISSION_NAMES.FEE_CLOSE_APPROVE))

const filters = reactive<{
  status: string | null
  target_school_year: number | undefined
  target_semester: number | null
}>({ status: null, target_school_year: undefined, target_semester: null })

const credits = ref<CreditRow[]>([])
const refunds = ref<RefundRow[]>([])
const loading = ref(false)

const movementsVisible = ref(false)
const movements = ref<MovementRow[]>([])

const applyVisible = ref(false)
const applyCredit = ref<CreditRow | null>(null)
const applyRecords = ref<FeeRecordRow[]>([])
const applyTarget = ref<FeeRecordRow | null>(null)

function creditStatusTag(status: string): 'success' | 'info' | 'warning' | 'danger' {
  return (
    (
      {
        available: 'success',
        applied: 'info',
        refund_pending: 'warning',
        refunded: 'info',
        reversed: 'danger',
      } as const
    )[status] ?? 'info'
  )
}
function refundStatusTag(status: string): 'success' | 'info' | 'warning' | 'danger' {
  return (
    (
      {
        requested: 'warning',
        approved: 'warning',
        completed: 'success',
        cancelled: 'info',
        reversed: 'danger',
      } as const
    )[status] ?? 'info'
  )
}

async function fetchCredits() {
  loading.value = true
  try {
    const data = await getPrepayments({
      status: filters.status || undefined,
      target_school_year: filters.target_school_year || undefined,
      target_semester: filters.target_semester || undefined,
    })
    credits.value = data.items as CreditRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入預繳款失敗', e))
  } finally {
    loading.value = false
  }
}

async function fetchRefunds() {
  try {
    const data = await getPrepaymentRefunds()
    refunds.value = data.items as RefundRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入退款清單失敗', e))
  }
}

async function openMovements(row: CreditRow) {
  try {
    movements.value = (await getPrepaymentMovements(row.id)) as MovementRow[]
    movementsVisible.value = true
  } catch (e) {
    ElMessage.error(friendlyError('載入流水失敗', e))
  }
}

async function doTransfer(row: CreditRow) {
  try {
    await ElMessageBox.confirm(
      '將此訪視預繳移轉給已轉正式的學生（同一筆資金，不會產生新收款）？',
      '轉正式學生',
    )
  } catch {
    return
  }
  try {
    await transferPrepayment(row.id)
    ElMessage.success('已移轉')
    fetchCredits()
  } catch (e) {
    ElMessage.error(friendlyError('移轉失敗', e))
  }
}

async function openApply(row: CreditRow) {
  applyCredit.value = row
  applyTarget.value = null
  try {
    const data = await getFeeRecords({
      student_id: row.student_id,
      status: 'unpaid',
      page: 1,
      page_size: 50,
    })
    // 只列註冊費且學期符合的費用單（後端仍會再驗證）
    const expected = `${row.target_school_year}-${row.target_semester}`
    applyRecords.value = (data.items as FeeRecordRow[]).filter(
      (r) => r.fee_type === 'registration' && r.period === expected,
    )
    applyVisible.value = true
  } catch (e) {
    ElMessage.error(friendlyError('載入註冊費費用單失敗', e))
  }
}

async function doApply() {
  if (!applyCredit.value || !applyTarget.value) return
  try {
    await applyPrepayment(applyCredit.value.id, {
      fee_record_id: applyTarget.value.id,
    })
    ElMessage.success('已套用（建立預繳折抵，非新收款）')
    applyVisible.value = false
    fetchCredits()
  } catch (e) {
    ElMessage.error(friendlyError('套用失敗', e))
  }
}

async function doReverseApply(row: CreditRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入沖銷套用的原因', '沖銷套用', {
      inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await reversePrepaymentApply(row.id, { reason })
    ElMessage.success('已沖銷套用，預繳恢復可用')
    fetchCredits()
  } catch (e) {
    ElMessage.error(friendlyError('沖銷失敗', e))
  }
}

async function doRequestRefund(row: CreditRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt(
      '退款由老闆另行以現金交付家長（不從會計交接現金扣除），請輸入退款原因',
      '申請預繳退款',
      { inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 字') },
    )
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await createPrepaymentRefund({ prepayment_credit_id: row.id, reason })
    ElMessage.success('已送出退款申請，待老闆核准')
    fetchCredits()
    fetchRefunds()
  } catch (e) {
    ElMessage.error(friendlyError('申請失敗', e))
  }
}

async function doApprove(row: RefundRow) {
  try {
    await approvePrepaymentRefund(row.id)
    ElMessage.success('已核准；請於實際交付現金後按「完成交付」')
    fetchRefunds()
  } catch (e) {
    ElMessage.error(friendlyError('核准失敗', e))
  }
}

async function doComplete(row: RefundRow) {
  let recipient = ''
  try {
    const result = await ElMessageBox.prompt(
      '確認現金已交付家長。請輸入領款人姓名（此刻才扣預繳餘額、列老闆現金支出）',
      '完成交付',
      { inputValidator: (v) => (v && v.trim() ? true : '請輸入領款人') },
    )
    recipient = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await completePrepaymentRefund(row.id, { recipient_name: recipient })
    ElMessage.success('退款完成')
    fetchRefunds()
    fetchCredits()
  } catch (e) {
    ElMessage.error(friendlyError('完成失敗', e))
  }
}

async function doCancel(row: RefundRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入取消原因', '取消退款', {
      inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await cancelPrepaymentRefund(row.id, { cancel_reason: reason })
    ElMessage.success('已取消，預繳恢復可用')
    fetchRefunds()
    fetchCredits()
  } catch (e) {
    ElMessage.error(friendlyError('取消失敗', e))
  }
}

onMounted(() => {
  fetchCredits()
  fetchRefunds()
})
defineExpose({ fetchCredits, fetchRefunds })
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.section-title {
  margin: 18px 0 8px;
}
</style>
