<template>
  <el-dialog
    :model-value="modelValue"
    title="預繳退款"
    width="720px"
    data-test="prepay-refunds-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="hint">退款由老闆另行以現金交付家長，不影響會計每日現金交接額</p>
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
            data-test="cancel-refund"
            @click="doCancel(row)"
          >
            取消
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 預繳退款清單對話框（2026-08-26 預繳併入帳款）。
 *
 * 由彙總繳費表工具列「預繳退款」入口開啟：老闆在此核准/完成交付、
 * 會計可取消；申請入口在 PrepaymentDrawer（逐額度）。refunds 由父層
 * 傳入，mutation 成功後 emit refresh 由父層重抓。
 */
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  approvePrepaymentRefund,
  cancelPrepaymentRefund,
  completePrepaymentRefund,
} from '@/api/fees'
import {
  REFUND_STATUS_LABELS,
  refundStatusTag,
  type PrepayRefundRow,
} from './prepayTypes'

defineProps<{
  modelValue: boolean
  refunds: PrepayRefundRow[]
}>()

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
  refresh: []
}>()

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))
const canApprove = computed(() => hasPermission(PERMISSION_NAMES.FEE_CLOSE_APPROVE))

async function doApprove(row: PrepayRefundRow) {
  try {
    await approvePrepaymentRefund(row.id)
    ElMessage.success('已核准；請於實際交付現金後按「完成交付」')
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('核准失敗', e))
  }
}

async function doComplete(row: PrepayRefundRow) {
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
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('完成失敗', e))
  }
}

async function doCancel(row: PrepayRefundRow) {
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
    emit('refresh')
  } catch (e) {
    ElMessage.error(friendlyError('取消失敗', e))
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
