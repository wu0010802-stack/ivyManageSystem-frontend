<template>
  <div class="close-tab">
    <div class="toolbar">
      <el-date-picker
        v-model="month"
        type="month"
        value-format="YYYY-MM"
        placeholder="選擇月份"
        aria-label="選擇關帳月份"
        @change="fetchSummary"
      />
      <el-button aria-label="重新計算關帳試算" @click="fetchSummary">重算</el-button>
    </div>

    <template v-if="summary">
      <!-- 摘要卡 -->
      <div class="cards" data-test="close-cards">
        <el-card shadow="never">
          <div class="card-label">銀行實際入帳</div>
          <div class="card-value">{{ formatCurrency(summary.bank.credit_total) }}</div>
          <div class="card-sub">未分配 {{ formatCurrency(summary.bank.unallocated) }}</div>
        </el-card>
        <el-card shadow="never">
          <div class="card-label">會計現金收款</div>
          <div class="card-value">{{ formatCurrency(summary.cash.receipts_total) }}</div>
          <div class="card-sub">
            應交付 {{ formatCurrency(summary.cash.handover_expected) }}｜實收
            {{ formatCurrency(summary.cash.handover_actual) }}｜差異
            <span :class="{ 'variance-bad': summary.cash.handover_variance !== 0 }">
              {{ formatCurrency(summary.cash.handover_variance) }}
            </span>
          </div>
        </el-card>
        <el-card shadow="never">
          <div class="card-label">學費分配（實收）</div>
          <div class="card-value">{{ formatCurrency(summary.totals.fee_allocated) }}</div>
          <div class="card-sub">非學費 {{ formatCurrency(summary.totals.non_tuition) }}</div>
        </el-card>
        <el-card shadow="never">
          <div class="card-label">預繳款</div>
          <div class="card-value">新收 {{ formatCurrency(summary.prepayment.received) }}</div>
          <div class="card-sub">
            已套用 {{ formatCurrency(summary.prepayment.applied) }}（非新收款）｜退款
            {{ formatCurrency(summary.prepayment.refunded) }}（老闆支出）
          </div>
        </el-card>
        <el-card shadow="never">
          <div class="card-label">預繳餘額 roll-forward</div>
          <div class="card-value">{{ formatCurrency(summary.prepayment.closing_balance) }}</div>
          <div class="card-sub">
            期初 {{ formatCurrency(summary.prepayment.opening_balance) }} ＋收
            −套 −退 ＝ 期末
          </div>
        </el-card>
      </div>

      <!-- 核心等式 -->
      <el-alert
        :type="summary.checklist.equation_balanced ? 'success' : 'error'"
        :closable="false"
        class="mt-1"
        data-test="equation-alert"
      >
        銀行入帳＋現金收款（{{ formatCurrency(summary.totals.equation_left) }}）＝
        學費分配＋新收預繳＋非學費＋未分配（{{ formatCurrency(summary.totals.equation_right) }}）
        {{ summary.checklist.equation_balanced ? '✓ 平衡' : '✗ 不平衡，請先處理' }}
      </el-alert>

      <!-- 關帳 checklist：已通過 / 未通過（阻擋直接關帳，可修正或帶例外） -->
      <h4 class="section-title">關帳前檢查</h4>
      <ul class="checklist" data-test="close-checklist">
        <li v-for="(ok, key) in summary.checklist" :key="key">
          <el-icon :class="ok ? 'ok' : 'bad'" aria-hidden="true">
            <component :is="ok ? CircleCheck : CircleClose" />
          </el-icon>
          <span>
            {{ CHECKLIST_LABELS[key] ?? key }}
            <span class="check-state">{{ ok ? '（已通過）' : '（未通過，阻擋直接關帳）' }}</span>
          </span>
          <el-button
            v-if="!ok && CHECKLIST_FIX_TARGETS[key]"
            size="small"
            text
            type="primary"
            class="fix-link"
            :aria-label="`前往修正：${CHECKLIST_LABELS[key] ?? key}`"
            :data-test="`close-fix-${key}`"
            @click="emit('navigate', CHECKLIST_FIX_TARGETS[key])"
          >
            前往修正
          </el-button>
        </li>
      </ul>

      <p v-if="!allChecksPass" class="blocked-hint" data-test="close-blocked-hint">
        {{ failingCount }} 項檢查未通過，無法直接關帳：請逐項修正後按「重算」，
        或於下方填寫例外說明改為「帶例外關帳」（快照會標記有差異）。
      </p>

      <div class="close-bar">
        <el-input
          v-if="!allChecksPass"
          v-model="exceptionNote"
          type="textarea"
          :rows="2"
          placeholder="存在未分類交易/差異：帶例外關帳必須填寫例外說明"
          aria-label="帶例外關帳的例外說明"
          style="max-width: 480px"
          data-test="exception-note"
        />
        <el-button
          v-if="canApprove"
          :type="allChecksPass ? 'primary' : 'warning'"
          data-test="close-btn"
          :disabled="!allChecksPass && !exceptionNote.trim()"
          :aria-label="allChecksPass ? '關帳並凍結本月快照' : '帶例外關帳（需填例外說明）'"
          @click="doClose"
        >
          {{ allChecksPass ? '關帳' : '帶例外關帳' }}
        </el-button>
      </div>
    </template>

    <!-- 歷史關帳 -->
    <h4 class="section-title">關帳紀錄（凍結快照）</h4>
    <el-table :data="closes" size="small" border data-test="close-history">
      <el-table-column label="月份" width="100">
        <template #default="{ row }">{{ row.close_year }}-{{ String(row.close_month).padStart(2, '0') }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'closed' ? 'success' : 'warning'" size="small">
            {{ row.status === 'closed' ? '已關帳' : '已重開' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="例外" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.has_exceptions" type="danger" size="small">有差異</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="closed_at" label="關帳時間" width="160">
        <template #default="{ row }">{{ row.closed_at?.slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column prop="exception_note" label="例外說明" min-width="160">
        <template #default="{ row }">{{ row.exception_note || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button
            v-if="canApprove && row.status === 'closed'"
            size="small"
            type="warning"
            text
            aria-label="重開此月份關帳"
            @click="doReopen(row)"
          >
            重開
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import type { FeeNavTarget } from './workspace/feesNavigation'
import {
  closePeriod,
  getClosePeriods,
  getCloseSummary,
  reopenClosePeriod,
} from '@/api/fees'

interface CloseSummary {
  bank: { credit_total: number; unallocated: number; unclassified_count: number }
  cash: {
    receipts_total: number
    handover_expected: number
    handover_actual: number
    handover_variance: number
    handover_unconfirmed: number
  }
  prepayment: {
    opening_balance: number
    received: number
    applied: number
    refunded: number
    closing_balance: number
  }
  owner: { refund_paid: number; pending_refunds: number }
  totals: {
    fee_allocated: number
    non_tuition: number
    equation_left: number
    equation_right: number
  }
  checklist: Record<string, boolean>
}
interface CloseRow {
  id: number
  close_year: number
  close_month: number
  status: string
  has_exceptions: boolean
  closed_at: string
  exception_note: string | null
}

const CHECKLIST_LABELS: Record<string, string> = {
  all_bank_transactions_classified: '所有銀行交易已分類（分配/非學費/未媒合處理完畢）',
  bank_fully_allocated: '銀行入帳已全額分配',
  all_collection_payments_classified: '所有代收明細已分類',
  collection_fully_allocated: '代收款已全額分配',
  handover_all_confirmed: '現金交接已全數老闆簽收',
  handover_variance_zero: '現金交接差異為零',
  // 帳單頁收款寫 StudentFeePayment、現金交接與關帳只認 FeeReceipt，兩條路徑
  // 不互通。缺口不會讓收款等式失衡（等式兩側都不含這條路徑的錢），所以另立
  // 一項明確標示，避免整筆現金在關帳時靜默消失。
  legacy_cash_reconciled: '帳單頁收的現金皆已建立對帳收據',
  no_pending_refunds: '無待處理預繳退款',
  equation_balanced: '收款等式平衡',
}

// 每個阻擋項目的修正入口（由結算工作區冒泡給 StudentFeeView 導頁）
const CHECKLIST_FIX_TARGETS: Record<string, FeeNavTarget> = {
  all_bank_transactions_classified: { ws: 'billing', view: 'matching', src: 'passbook' },
  bank_fully_allocated: { ws: 'billing', view: 'matching', src: 'passbook' },
  handover_all_confirmed: { ws: 'settlement', view: 'handover' },
  handover_variance_zero: { ws: 'settlement', view: 'handover' },
  // 修正方式＝到現金交接頁為這些收款補建收據
  legacy_cash_reconciled: { ws: 'settlement', view: 'handover' },
  all_collection_payments_classified: { ws: 'billing', view: 'matching' },
  collection_fully_allocated: { ws: 'billing', view: 'matching' },
  no_pending_refunds: { ws: 'billing', view: 'refunds' },
  equation_balanced: { ws: 'billing', view: 'matching' },
}

const emit = defineEmits<{
  navigate: [target: FeeNavTarget]
}>()

const canApprove = computed(() => hasPermission(PERMISSION_NAMES.FEE_CLOSE_APPROVE))

const month = ref(todayISO().slice(0, 7))
const summary = ref<CloseSummary | null>(null)
const closes = ref<CloseRow[]>([])
const exceptionNote = ref('')

const allChecksPass = computed(
  () => !!summary.value && Object.values(summary.value.checklist).every(Boolean),
)
const failingCount = computed(() =>
  summary.value
    ? Object.values(summary.value.checklist).filter((ok) => !ok).length
    : 0,
)

function parseMonth(): { year: number; monthNum: number } | null {
  const [y, m] = (month.value || '').split('-').map(Number)
  if (!y || !m) return null
  return { year: y, monthNum: m }
}

async function fetchSummary() {
  const parsed = parseMonth()
  if (!parsed) return
  try {
    // 後端 summary 為動態彙總 dict（response_model=dict）→ 先過 unknown 再收斂
    summary.value = (await getCloseSummary(
      parsed.year,
      parsed.monthNum,
    )) as unknown as CloseSummary
  } catch (e) {
    ElMessage.error(friendlyError('載入關帳試算失敗', e))
  }
}

async function fetchCloses() {
  try {
    const data = await getClosePeriods()
    closes.value = data.items as CloseRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入關帳紀錄失敗', e))
  }
}

async function doClose() {
  const parsed = parseMonth()
  if (!parsed) return
  try {
    await ElMessageBox.confirm(
      '關帳後保留凍結快照與簽收人；後續更正只能 reopen 後重新關帳，不可修改舊快照。',
      '確認關帳',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await closePeriod({
      close_year: parsed.year,
      close_month: parsed.monthNum,
      exception_note: exceptionNote.value.trim() || null,
    })
    ElMessage.success('已關帳')
    exceptionNote.value = ''
    fetchCloses()
  } catch (e) {
    ElMessage.error(friendlyError('關帳失敗', e))
  }
}

async function doReopen(row: CloseRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入重開原因', '重開關帳', {
      inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await reopenClosePeriod(row.id, { reason })
    ElMessage.success('已重開；原快照保留為歷史')
    fetchCloses()
  } catch (e) {
    ElMessage.error(friendlyError('重開失敗', e))
  }
}

onMounted(() => {
  fetchSummary()
  fetchCloses()
})
defineExpose({ fetchSummary, fetchCloses })
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.card-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.card-value {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0;
}
.card-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.variance-bad {
  color: var(--el-color-danger);
  font-weight: 600;
}
.section-title {
  margin: 18px 0 8px;
}
.checklist {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.checklist li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.check-state {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.fix-link {
  padding: 0 4px;
}
.blocked-hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-color-warning-dark-2, var(--el-color-warning));
}
.checklist .ok {
  color: var(--el-color-success);
}
.checklist .bad {
  color: var(--el-color-danger);
}
.close-bar {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.mt-1 {
  margin-top: 8px;
}
</style>
