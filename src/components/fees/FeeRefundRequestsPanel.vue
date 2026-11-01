<template>
  <section
    v-if="visible && requests.length > 0"
    class="refund-requests"
    data-test="refund-requests-panel"
    aria-labelledby="refund-requests-title"
  >
    <header class="refund-requests__head">
      <h3 id="refund-requests-title" class="refund-requests__title">
        待核准退費申請
        <el-tag size="small" type="warning" class="ml-8">{{ requests.length }}</el-tag>
      </h3>
      <p class="refund-requests__hint">
        累計達簽核門檻的學費退費須由「申請人以外」具金流簽核權限者核准；核准時才實際退費並扣已繳。
      </p>
    </header>

    <el-table :data="requests" v-loading="loading" border size="small" row-key="id">
      <el-table-column label="學生" prop="student_name" min-width="90" />
      <el-table-column label="費用項目" prop="fee_item_name" min-width="110" />
      <el-table-column label="學期" prop="period" width="90" />
      <el-table-column label="退費金額" width="110" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="原因" prop="reason" min-width="150" />
      <el-table-column label="申請人" prop="requested_by_name" width="100" />
      <el-table-column label="申請時間" width="140">
        <template #default="{ row }">{{ formatTaipeiDateTimeMinute(row.requested_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right">
        <template #default="{ row }">
          <template v-if="canApprove">
            <el-tooltip
              :disabled="!isOwn(row)"
              :content="OWN_REQUEST_HINT"
              placement="top"
            >
              <!-- span 包住 disabled 按鈕，tooltip 才收得到 hover -->
              <span class="refund-requests__actions">
                <el-button
                  size="small"
                  type="primary"
                  :disabled="isOwn(row) || busyId === row.id"
                  :loading="busyId === row.id && busyAction === 'approve'"
                  data-test="approve-fee-refund-request"
                  @click="doApprove(row)"
                >
                  核准
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :disabled="isOwn(row) || busyId === row.id"
                  :loading="busyId === row.id && busyAction === 'reject'"
                  data-test="reject-fee-refund-request"
                  @click="doReject(row)"
                >
                  駁回
                </el-button>
              </span>
            </el-tooltip>
            <p v-if="isOwn(row)" class="refund-requests__own" data-test="own-request-note">
              本人申請，需由他人核准
            </p>
          </template>
          <span v-else class="refund-requests__waiting" data-test="awaiting-approver">待簽核者核准</span>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
/**
 * 學費退費申請待審清單（FIN-F2 Maker–Checker）。
 *
 * 放在退費工作區（FeeRefundsTab）頂端；沒有待審申請時整塊不顯示。
 * 清單端點僅不受班級限制的財務角色可列（其餘 403）→ 靜默隱藏。
 * 核准／駁回需 ACTIVITY_PAYMENT_APPROVE，且後端禁止核准自己的申請；
 * 前端以 username 比對預先停用本人申請的按鈕並說明原因。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  approveFeeRefundRequest,
  getFeeRefundRequests,
  rejectFeeRefundRequest,
} from '@/api/fees'
import type { ApiResponse } from '@/api/_generated/typed'
import { hasPermission, getUserInfo } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { formatTaipeiDateTimeMinute } from '@/utils/format'
import { isOwnRefundRequest } from './refundApproval'

type RefundRequestRow = ApiResponse<'/fees/refund-requests', 'get'>['items'][number]

const emit = defineEmits<{
  decided: []
}>()

const OWN_REQUEST_HINT = '不可核准或駁回自己送出的退費申請，需由其他具金流簽核權限者處理（職責分離）'
const MIN_REJECT_REASON = 5

const requests = ref<RefundRequestRow[]>([])
const loading = ref<boolean>(false)
// 無權列清單（403）時整塊隱藏，不打擾不負責審核的角色
const visible = ref<boolean>(true)
const busyId = ref<number | null>(null)
const busyAction = ref<'approve' | 'reject' | null>(null)

const canApprove = computed(() => hasPermission(PERMISSION_NAMES.ACTIVITY_PAYMENT_APPROVE))
const currentUsername = computed(() => (getUserInfo() as { username?: unknown } | null)?.username)

function isOwn(row: RefundRequestRow): boolean {
  return isOwnRefundRequest(row.requested_by_name, currentUsername.value)
}

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const res = await getFeeRefundRequests({ status: 'requested' })
    if (seq !== loadSeq) return
    requests.value = res.items
    visible.value = true
  } catch (e: unknown) {
    if (seq !== loadSeq) return
    if ((e as { response?: { status?: number } }).response?.status === 403) {
      visible.value = false
      return
    }
    ElMessage.error(friendlyError('載入退費申請失敗', e))
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function doApprove(row: RefundRequestRow) {
  if (isOwn(row) || busyId.value !== null) return
  try {
    await ElMessageBox.confirm(
      `核准後將立即退費 ${formatCurrency(row.amount)} 並扣減「${row.student_name ?? ''}／${row.fee_item_name ?? ''}」的已繳金額。`,
      '核准退費申請',
      { confirmButtonText: '核准並退費', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  busyId.value = row.id
  busyAction.value = 'approve'
  try {
    await approveFeeRefundRequest(row.id)
    ElMessage.success('已核准，退費已建立')
    emit('decided')
    await load()
  } catch (e: unknown) {
    ElMessage.error(friendlyError('核准退費申請失敗', e))
  } finally {
    busyId.value = null
    busyAction.value = null
  }
}

async function doReject(row: RefundRequestRow) {
  if (isOwn(row) || busyId.value !== null) return
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入駁回原因（申請人可據此修正後重送）', '駁回退費申請', {
      inputValidator: (v) =>
        v && v.trim().length >= MIN_REJECT_REASON ? true : `原因至少 ${MIN_REJECT_REASON} 字`,
    })
    reason = typeof result === 'object' ? result.value.trim() : ''
  } catch {
    return
  }
  busyId.value = row.id
  busyAction.value = 'reject'
  try {
    await rejectFeeRefundRequest(row.id, { reason })
    ElMessage.success('已駁回，未變動任何金額')
    emit('decided')
    await load()
  } catch (e: unknown) {
    ElMessage.error(friendlyError('駁回退費申請失敗', e))
  } finally {
    busyId.value = null
    busyAction.value = null
  }
}

onMounted(load)

defineExpose({ load, requests, visible, canApprove, isOwn, doApprove, doReject })
</script>

<style scoped>
.refund-requests {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md);
  background: var(--bg-color-soft);
}
.refund-requests__head {
  margin-bottom: var(--space-3);
}
.refund-requests__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  display: flex;
  align-items: center;
}
.refund-requests__hint {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.refund-requests__actions {
  display: inline-flex;
  gap: var(--space-1);
}
.refund-requests__own,
.refund-requests__waiting {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.ml-8 { margin-left: var(--space-2); }
</style>
