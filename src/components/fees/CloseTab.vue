<template>
  <div class="close-tab">
    <template v-if="summary">
      <el-alert
        :type="!closesLoaded ? 'warning' : isClosed ? 'info' : allChecksPass ? 'success' : 'warning'"
        :closable="false"
        data-test="close-status"
        role="status"
      >
        {{ !closesLoaded ? '尚未確認關帳狀態・請重新檢查' : isClosed ? '本月已關帳・快照已保留' : !allChecksPass ? `尚不可直接關帳・${failingCount} 項待處理` : '本月檢查全數通過' }}
      </el-alert>
      <p v-if="!closesLoaded" class="check-state">尚未確認關帳紀錄，請重新檢查後再試。</p>
      <p v-if="isClosed" class="close-equation-note">以下為目前資料的檢查結果；關帳時的快照保留於歷次關帳紀錄。</p>
      <h4 class="section-title">{{ failingCount ? '待處理事項' : '關帳前檢查' }}</h4>
      <ul v-if="failingCount" class="checklist" data-test="close-checklist">
        <li v-for="{ key } in failingChecks" :key="key">
          <el-icon class="bad" aria-hidden="true">
            <CircleClose />
          </el-icon>
          <div class="check-content">
            <span>{{ CHECKLIST_PENDING_LABELS[key] ?? CHECKLIST_LABELS[key] ?? key }}</span>
            <span v-if="checkDetail(key)" class="check-state">{{ checkDetail(key) }}</span>
          </div>
          <el-button
            v-if="CHECKLIST_FIX_TARGETS[key]"
            text
            type="primary"
            class="fix-link"
            :aria-label="CHECKLIST_FIX_LABELS[key] ?? '查看收款資料'"
            :data-test="`close-fix-${key}`"
            @click="emit('navigate', CHECKLIST_FIX_TARGETS[key])"
          >
            {{ CHECKLIST_FIX_LABELS[key] ?? '查看收款資料' }}
          </el-button>
        </li>
      </ul>
      <details v-if="passedChecks.length" :key="month" class="close-detail" data-test="passed-checks">
        <summary>已通過 {{ passedChecks.length }} 項檢查</summary>
        <ul class="checklist">
          <li v-for="{ key } in passedChecks" :key="key">
            <el-icon class="ok" aria-hidden="true">
              <CircleCheck />
            </el-icon>{{ CHECKLIST_LABELS[key] ?? key }}（已通過）
          </li>
        </ul>
      </details>
      <p v-if="!allChecksPass && !isClosed" class="blocked-hint" data-test="close-blocked-hint">
        {{ failingCount }} 項檢查未通過，無法直接關帳。請逐項處理後按「重新檢查」。
      </p>
      <section aria-label="本月收款與分配" class="close-finance">
        <h4 class="section-title">本月收款與分配</h4>
        <el-tag
          :type="summary.checklist.equation_balanced ? 'success' : 'danger'"
          data-test="equation-alert"
        >
          {{ summary.checklist.equation_balanced ? '收款等式平衡' : '收款等式不平衡，請先處理' }}
        </el-tag>
        <p class="close-equation-note">平衡表示本月收款來源與分配去向等式相符，不代表每筆款項均已媒合或代收款已撥入銀行；仍須通過所有關帳檢查。</p>
        <details class="close-equation-detail" data-test="equation-detail">
          <summary>查看收款等式加總明細</summary>
          <p>存摺入帳已排除由代收涵蓋的交易，避免重複列入。代收毛額為帳單面額，不等同銀行已撥款；手續費 {{ formatCurrency(summary.collection.fee_total) }} 另列支出，淨額 {{ formatCurrency(summary.collection.net_total) }} 供存摺勾稽。</p>
          <p>收款來源：存摺入帳 {{ formatCurrency(summary.bank.credit_total) }} ＋代收毛額 {{ formatCurrency(summary.collection.gross_total) }} ＋已確認現金 {{ formatCurrency(summary.cash.receipts_total) }} ＝ {{ formatCurrency(summary.totals.equation_left) }}</p>
          <p>分配去向：學費分配 {{ formatCurrency(summary.totals.fee_allocated) }} ＋新收預繳分配 {{ formatCurrency(summary.totals.prepayment_received_allocated) }} ＋非學費 {{ formatCurrency(summary.totals.non_tuition) }} ＋存摺標記非學費 {{ formatCurrency(summary.bank.ignored_amount) }} ＋存摺未分配 {{ formatCurrency(summary.bank.unallocated) }} ＋代收未分配 {{ formatCurrency(summary.collection.unallocated) }} ＝ {{ formatCurrency(summary.totals.equation_right) }}</p>
          <p>新收預繳分配依本月收款來源歸屬；預繳款異動摘要依預繳異動期間統計，口徑可能不同。</p>
        </details>
        <h5>收款來源合計 {{ formatCurrency(summary.totals.equation_left) }}</h5>
        <div class="close-strip" data-test="close-cards">
          <div class="close-cell">
            <div class="close-cell__label">存摺入帳（排除代收涵蓋）</div>
            <div class="close-cell__value">{{ formatCurrency(summary.bank.credit_total) }}</div>
            <div class="close-cell__sub">依存摺入帳日歸月・未分配 {{ formatCurrency(summary.bank.unallocated) }}</div>
          </div>
          <div class="close-cell" data-test="close-collection">
            <div class="close-cell__label">代收繳費（帳單面額）</div>
            <div class="close-cell__value">{{ formatCurrency(summary.collection.gross_total) }}</div>
            <div class="close-cell__sub">依家長繳費日歸月・含尚未撥款的在途繳費。</div>
          </div>
          <div class="close-cell">
            <div class="close-cell__label">會計現金收款</div>
            <div class="close-cell__value">{{ formatCurrency(summary.cash.receipts_total) }}</div>
            <div class="close-cell__sub">依收據收款日歸月・僅已確認收據</div>
            <div class="close-cell__sub">
              應交付 {{ formatCurrency(summary.cash.handover_expected) }}｜實收
              {{ formatCurrency(summary.cash.handover_actual) }}｜差異
              <span :class="{ 'variance-bad': summary.cash.handover_variance !== 0 }">
                {{ formatCurrency(summary.cash.handover_variance) }}
              </span>
            </div>
          </div>
        </div>
        <h5>分配去向合計 {{ formatCurrency(summary.totals.equation_right) }}</h5>
        <dl class="allocation-list">
          <div>
            <dt>學費分配（實收）</dt>
            <dd>{{ formatCurrency(summary.totals.fee_allocated) }}</dd>
          </div>
          <div>
            <dt>新收預繳分配</dt>
            <dd>{{ formatCurrency(summary.totals.prepayment_received_allocated) }}</dd>
          </div>
          <div>
            <dt>非學費</dt>
            <dd>{{ formatCurrency(summary.totals.non_tuition) }}</dd>
          </div>
          <div>
            <dt>存摺標記非學費</dt>
            <dd>{{ formatCurrency(summary.bank.ignored_amount) }}</dd>
          </div>
          <div>
            <dt>存摺未分配</dt>
            <dd>{{ formatCurrency(summary.bank.unallocated) }}</dd>
          </div>
          <div>
            <dt>代收未分配</dt>
            <dd>{{ formatCurrency(summary.collection.unallocated) }}</dd>
          </div>
        </dl>
      </section>
      <details :key="`prepayment-${month}`" class="close-detail" data-test="prepayment-detail">
        <summary>預繳款異動與餘額</summary>
        <div class="close-strip">
          <div class="close-cell">
            <div class="close-cell__label">預繳款</div>
            <div class="close-cell__value">新收 {{ formatCurrency(summary.prepayment.received) }}</div>
            <div class="close-cell__sub">
              已套用 {{ formatCurrency(summary.prepayment.applied) }}（非新收款）｜退款
              {{ formatCurrency(summary.prepayment.refunded) }}（老闆支出）
            </div>
          </div>
          <div class="close-cell">
            <div class="close-cell__label">預繳款期初／期末餘額</div>
            <div class="close-cell__value">
              {{ formatCurrency(summary.prepayment.closing_balance) }}
            </div>
            <div class="close-cell__sub">
              期初 {{ formatCurrency(summary.prepayment.opening_balance) }} ＋收
              −套 −退 ＝ 期末
            </div>
          </div>
        </div>
      </details>
      <div v-if="canApprove && !isClosed" class="close-actions">
        <el-button
          type="primary"
          data-test="close-btn"
          :disabled="!allChecksPass || closing || !closesLoaded"
          :loading="closing"
          aria-label="確認關帳並凍結本月快照"
          @click="doClose(false)"
        >
          確認關帳
        </el-button>
        <template v-if="!allChecksPass">
          <el-button
            text
            data-test="exception-toggle"
            :aria-expanded="exceptionMode"
            aria-controls="close-exception-panel"
            @click="toggleException"
          >
            {{ exceptionMode ? '收起例外關帳' : '需要帶例外關帳？' }}
          </el-button>
          <div v-if="exceptionMode" id="close-exception-panel" class="exception-panel">
            <p>仍有 {{ failingCount }} 項檢查未通過。帶例外關帳會保留以下未通過項目與例外說明，快照會標記有差異。</p>
            <ul>
              <li v-for="{ key } in failingChecks" :key="key">{{ CHECKLIST_LABELS[key] ?? key }}</li>
            </ul>
            <label for="close-exception-note">例外說明（必填）</label>
            <el-input
              id="close-exception-note"
              v-model="exceptionNote"
              type="textarea"
              :rows="3"
              placeholder="請說明未通過項目的原因與後續處理方式"
              aria-label="帶例外關帳的例外說明"
              data-test="exception-note"
             />
            <el-button
              type="warning"
              data-test="exception-close-btn"
              :disabled="!exceptionNote.trim() || closing || !closesLoaded"
              :loading="closing"
              @click="doClose(true)"
            >
              帶例外關帳
            </el-button>
          </div>
        </template>
      </div>
    </template>
    <!-- 歷史關帳 -->
    <details class="close-detail" data-test="history-detail">
      <summary>歷次關帳紀錄（凍結快照）</summary>
      <p v-if="closesLoaded && !closes.length">尚無關帳紀錄，完成關帳後會保留當時的檢查結果與快照。</p>
      <el-table
        v-if="closesLoaded && closes.length"
        :data="closes"
        size="small"
        border
        data-test="close-history"
      >
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
    </details>
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
  bank: { credit_total: number; unallocated: number; unclassified_count: number; ignored_amount: number }
  collection: { gross_total: number; net_total: number; fee_total: number; unallocated: number }
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
    prepayment_received_allocated: number
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
  no_pending_refunds: { ws: 'billing', view: 'cashItems' },
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
const exceptionMode = ref(false)
const closing = ref(false)
const closesLoaded = ref(false)
const isClosed = computed(() => {
  if (!closesLoaded.value) return false
  const parsed = parseMonth()
  return closes.value.some((row) => row.close_year === parsed?.year && row.close_month === parsed?.monthNum && row.status === 'closed')
})

const allChecksPass = computed(
  () => !!summary.value && Object.values(summary.value.checklist).every(Boolean),
)
const failingCount = computed(() =>
  summary.value
    ? Object.values(summary.value.checklist).filter((ok) => !ok).length
    : 0,
)

/** 未通過的排最前（其餘維持後端給的順序）：要處理的事不該混在一長串 ✓ 裡找 */
const orderedChecklist = computed<{ key: string; ok: boolean }[]>(() => {
  const entries = Object.entries(summary.value?.checklist ?? {}).map(([key, ok]) => ({
    key,
    ok: !!ok,
  }))
  return [...entries.filter((e) => !e.ok), ...entries.filter((e) => e.ok)]
})

const failingChecks = computed(() => orderedChecklist.value.filter(({ ok }) => !ok))
const passedChecks = computed(() => orderedChecklist.value.filter(({ ok }) => ok))

const CHECKLIST_PENDING_LABELS: Record<string, string> = {
  all_bank_transactions_classified: '銀行交易尚未完成分類',
  bank_fully_allocated: '銀行入帳尚未分配完成',
  all_collection_payments_classified: '代收明細尚未完成分類',
  collection_fully_allocated: '代收款尚未分配完成',
  handover_all_confirmed: '現金交接尚未全數簽收',
  handover_variance_zero: '現金交接仍有差異',
  legacy_cash_reconciled: '帳單頁現金收款尚未全數建立對帳收據',
  no_pending_refunds: '預繳退款尚待處理',
  equation_balanced: '收款來源與分配去向不平衡',
}
const CHECKLIST_FIX_LABELS: Record<string, string> = {
  all_bank_transactions_classified: '處理銀行分類', bank_fully_allocated: '處理銀行分配',
  all_collection_payments_classified: '處理代收分類', collection_fully_allocated: '處理代收分配',
  handover_all_confirmed: '查看現金交接', handover_variance_zero: '核對交接差異',
  legacy_cash_reconciled: '補建對帳收據', no_pending_refunds: '處理預繳退款', equation_balanced: '核對收款分配',
}
function checkDetail(key: string): string {
  const current = summary.value
  if (!current) return ''
  if (key === 'all_bank_transactions_classified') return `${current.bank.unclassified_count} 筆待分類`
  if (key === 'bank_fully_allocated') return `未分配 ${formatCurrency(current.bank.unallocated)}`
  if (key === 'collection_fully_allocated') return `未分配 ${formatCurrency(current.collection.unallocated)}`
  if (key === 'handover_all_confirmed') return `${current.cash.handover_unconfirmed} 筆待簽收`
  if (key === 'handover_variance_zero') return `差異 ${formatCurrency(current.cash.handover_variance)}`
  return ''
}
function resetException() { exceptionMode.value = false; exceptionNote.value = '' }
function toggleException() {
  if (exceptionMode.value) resetException()
  else exceptionMode.value = true
}

function parseMonth(): { year: number; monthNum: number } | null {
  const [y, m] = (month.value || '').split('-').map(Number)
  if (!y || !m) return null
  return { year: y, monthNum: m }
}

let summaryRequest = 0

async function fetchSummary() {
  const request = ++summaryRequest
  summary.value = null
  resetException()
  const parsed = parseMonth()
  if (!parsed) return
  try {
    // 後端 summary 為動態彙總 dict（response_model=dict）→ 先過 unknown 再收斂
    const result = (await getCloseSummary(
      parsed.year,
      parsed.monthNum,
    )) as unknown as CloseSummary
    if (request === summaryRequest) summary.value = result
  } catch (e) {
    if (request !== summaryRequest) return
    ElMessage.error(friendlyError('載入關帳試算失敗', e))
  }
}

async function fetchCloses() {
  closesLoaded.value = false
  try {
    const data = await getClosePeriods()
    closes.value = data.items as CloseRow[]
    closesLoaded.value = true
  } catch (e) {
    ElMessage.error(friendlyError('載入關帳紀錄失敗', e))
  }
}

async function doClose(withException = false) {
  if (!canApprove.value || isClosed.value || closing.value || !closesLoaded.value || !summary.value) return
  if (!allChecksPass.value && (!withException || !exceptionMode.value || !exceptionNote.value.trim())) return
  const parsed = parseMonth()
  if (!parsed) return
  const selectedMonth = month.value
  const selectedSummaryRequest = summaryRequest
  const note = withException ? exceptionNote.value.trim() : null
  closing.value = true
  try {
    await ElMessageBox.confirm(
      (withException ? `未通過項目：${failingChecks.value.map(({ key }) => CHECKLIST_LABELS[key] ?? key).join('、')}。例外說明：${note}。快照會標記有差異。\n` : '') +
      '關帳後保留凍結快照與簽收人；後續更正須重開後重新關帳，不可修改舊快照。',
      withException ? '確認帶例外關帳' : '確認關帳',
      { type: 'warning' },
    )
  } catch {
    closing.value = false
    return
  }
  if (selectedMonth !== month.value || selectedSummaryRequest !== summaryRequest || !summary.value) { closing.value = false; return }
  try {
    await closePeriod({
      close_year: parsed.year,
      close_month: parsed.monthNum,
      exception_note: note || null,
    })
    ElMessage.success('已關帳')
    resetException()
    await fetchCloses()
  } catch (e) {
    ElMessage.error(friendlyError('關帳失敗', e))
  } finally {
    closing.value = false
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
/**
 * 月份選擇與「重新檢查」上移到結算工作區的共用工具列，故對外開放讀寫。
 * 注意 defineExpose 會把 ref 解包，父層讀得到值但寫不回去，因此提供 setMonth。
 */
function setMonth(next: string) {
  if (!next || next === month.value) return
  month.value = next
  fetchSummary()
}

defineExpose({ fetchSummary, fetchCloses, month, setMonth })
</script>

<style scoped>
.close-equation-note, .close-equation-detail, .check-state {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}
.close-detail, .close-finance {
  margin-block: var(--space-4);
}
.close-detail > summary, .close-equation-detail > summary {
  min-height: var(--touch-target-min);
  cursor: pointer;
  align-content: center;
  font-weight: 600;
}
summary:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: var(--space-1);
}
.allocation-list {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
}
.allocation-list > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: var(--space-1);
  font-size: var(--text-sm);
}
.allocation-list dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.close-strip {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  background: var(--el-bg-color);
  overflow: hidden;
}
.close-cell {
  flex: 1 1 12rem;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-3) var(--space-4);
  border-right: 1px solid var(--el-border-color-lighter);
}
.close-cell:last-child {
  border-right: none;
}
.close-cell__label, .close-cell__sub {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}
.close-cell__value {
  font-size: var(--text-lg);
  font-weight: 700;
  margin-block: var(--space-1);
  font-variant-numeric: tabular-nums;
}
.variance-bad, .checklist .bad {
  color: var(--el-color-danger);
}
.section-title {
  margin: var(--space-4) 0 var(--space-2);
}
h5 {
  font-size: var(--text-sm);
  margin-block: var(--space-3) var(--space-2);
}
.checklist {
  list-style: none;
  padding: 0;
  margin: 0;
}
.checklist li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.check-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.fix-link {
  min-height: var(--touch-target-min);
  flex-shrink: 0;
}
.blocked-hint {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}
.checklist .ok {
  color: var(--el-color-success);
}
.close-actions {
  padding-block: var(--space-4);
  border-block: 1px solid var(--el-border-color-lighter);
}
.exception-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding: var(--space-4);
  background: var(--el-fill-color-light);
  border-radius: var(--radius-md);
}
.exception-panel p, .exception-panel ul {
  margin: 0;
}
@media (--to-sm) {
  .close-strip {
  flex-direction: column;
}
  .close-cell {
  flex-basis: auto;
  border-right: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
  .checklist li {
  flex-wrap: wrap;
}
  .check-content {
  flex-basis: 80%;
}
  .fix-link {
  margin-left: auto;
}
}
</style>
