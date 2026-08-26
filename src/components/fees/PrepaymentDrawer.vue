<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    size="640px"
    data-test="prepay-drawer"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="hint">每名幼生每學期固定預繳 NT$5,000；銀行/現金收款於對帳與現金收款流程建立</p>

    <el-table :data="credits" size="small" border data-test="credit-table">
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
      <el-table-column label="操作" min-width="240">
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
            data-test="reverse-apply-btn"
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

    <!-- 流水 dialog -->
    <el-dialog v-model="movementsVisible" title="預繳資金流水" width="560px" append-to-body>
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
    <el-dialog v-model="applyVisible" title="套用預繳到註冊費" width="560px" append-to-body>
      <p v-if="applyCredit">
        {{ applyCredit.student_name }}｜目標學期
        {{ applyCredit.target_school_year }}-{{ applyCredit.target_semester === 1 ? '上' : '下' }}
        ｜折抵 NT$5,000（先同胞九折、再扣預繳）
      </p>
      <el-table
        :data="applyRecords"
        size="small"
        border
        highlight-current-row
        @current-change="(r: FeeRecordRow | null) => (applyTarget = r)"
      >
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
        <el-button type="primary" :disabled="!applyTarget" data-test="apply-confirm" @click="doApply">
          確認套用
        </el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * 預繳額度管理抽屜（2026-08-26 預繳併入帳款）。
 *
 * 由彙總繳費表「預繳」欄（單一學生）或工具列「訪視預繳」入口（待轉正式的
 * 訪視額度）開啟；credits 由父層傳入，所有 mutation 成功後 emit refresh
 * 由父層重抓，抽屜保持開啟即時反映。退款核准/交付在 PrepaymentRefundsDialog。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  applyPrepayment,
  createPrepaymentRefund,
  getFeeRecords,
  getPrepaymentMovements,
  reversePrepaymentApply,
  transferPrepayment,
} from '@/api/fees'
import {
  CREDIT_STATUS_LABELS,
  MOVEMENT_LABELS,
  creditStatusTag,
  type PrepayCreditRow,
  type PrepayMovementRow,
} from './prepayTypes'

interface FeeRecordRow {
  id: number
  fee_item_name: string
  period: string
  amount_due: number
  amount_paid: number
  fee_type: string | null
}

defineProps<{
  modelValue: boolean
  credits: PrepayCreditRow[]
  title: string
}>()

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
  refresh: []
}>()

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

const movementsVisible = ref(false)
const movements = ref<PrepayMovementRow[]>([])

const applyVisible = ref(false)
const applyCredit = ref<PrepayCreditRow | null>(null)
const applyRecords = ref<FeeRecordRow[]>([])
const applyTarget = ref<FeeRecordRow | null>(null)

async function openMovements(row: PrepayCreditRow) {
  try {
    movements.value = (await getPrepaymentMovements(row.id)) as PrepayMovementRow[]
    movementsVisible.value = true
  } catch (e) {
    ElMessage.error(friendlyError('載入流水失敗', e))
  }
}

async function doTransfer(row: PrepayCreditRow) {
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
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('移轉失敗', e))
  }
}

async function openApply(row: PrepayCreditRow) {
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
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('套用失敗', e))
  }
}

async function doReverseApply(row: PrepayCreditRow) {
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
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('沖銷失敗', e))
  }
}

async function doRequestRefund(row: PrepayCreditRow) {
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
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('申請失敗', e))
  }
}
</script>

<style scoped>
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin: 0 0 10px;
}
</style>
