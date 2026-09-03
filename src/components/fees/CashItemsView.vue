<template>
  <section class="cash-items" aria-label="現金項目">
    <!-- A. 現金項目批次（教材費等） -->
    <div class="head">
      <div class="head__title">
        <strong>現金項目批次</strong>
        <span class="hint">教材費等只收現金、不上銀行；不進網銀媒合，也不在應收帳款月表</span>
      </div>
      <div class="head__actions">
        <el-select v-model="termKey" size="small" style="width: 130px" data-test="cfb-term" @change="fetchBatches">
          <el-option v-for="t in termOptions" :key="t.key" :value="t.key" :label="t.label" />
        </el-select>
        <el-button v-if="canWrite" type="primary" size="small" data-test="cfb-create-open" @click="createVisible = true">建立批次</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="batches" size="small" border data-test="cfb-list" @row-click="openBatch">
      <el-table-column label="批次" min-width="200">
        <template #default="{ row }">
          <div data-test="cfb-list-row" :data-batch="row.id">
            <el-tag size="small" effect="plain">{{ CASH_FEE_KIND_LABELS[row.kind as CashFeeKind] ?? row.kind }}</el-tag>
            {{ row.title }}
            <el-button size="small" text type="primary" data-test="cfb-open" @click.stop="openBatch(row)">逐生</el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="人數" width="70" align="right"><template #default="{ row }">{{ row.student_count }}</template></el-table-column>
      <el-table-column label="應收" width="110" align="right"><template #default="{ row }">{{ formatCurrency(row.total_due) }}</template></el-table-column>
      <el-table-column label="已收" width="110" align="right"><template #default="{ row }">{{ formatCurrency(row.total_paid) }}</template></el-table-column>
      <el-table-column label="未收" width="110" align="right">
        <template #default="{ row }"><span :class="{ owe: row.outstanding > 0 }">{{ formatCurrency(row.outstanding) }}</span></template>
      </el-table-column>
      <el-table-column label="逾期日" width="110"><template #default="{ row }">{{ row.due_date || '—' }}</template></el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button v-if="canWrite && row.total_paid === 0" size="small" text type="danger" data-test="cfb-delete" @click.stop="removeBatch(row)">刪除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState v-if="!loading" title="本學期尚無現金項目批次" description="教材費等只收現金的費用，按「建立批次」依年級填金額展開。" />
      </template>
    </el-table>

    <div v-if="detail" class="detail" data-test="cfb-detail">
      <h4>{{ detail.batch.title }}　<small class="hint">{{ detail.items.length }} 人・未收 {{ formatCurrency(detail.batch.outstanding) }}</small></h4>
      <table class="items">
        <thead>
          <tr><th>學生</th><th>班級</th><th class="num">應收</th><th class="num">已收</th><th>狀態</th><th>收款確認</th><th v-if="canWrite" /></tr>
        </thead>
        <tbody>
          <tr v-for="it in detail.items" :key="it.record_id" data-test="cfb-item-row" :data-record="it.record_id">
            <td>{{ it.student_name }}</td>
            <td>{{ it.classroom_name || '—' }}</td>
            <td class="num">{{ formatCurrency(it.amount_due) }}</td>
            <td class="num">{{ formatCurrency(it.amount_paid) }}</td>
            <td><el-tag :type="statusTag(it.status)" size="small">{{ statusLabel(it.status) }}</el-tag></td>
            <td>
              <el-tag v-for="tag in activeSettlementTags(it.settlement)" :key="tag.key" :type="tag.tagType" size="small" class="settle-tag">{{ tag.label }}</el-tag>
            </td>
            <td v-if="canWrite">
              <el-button v-if="it.status !== 'paid'" size="small" text type="primary" data-test="cfb-item-pay" @click="openPay(it)">收現金</el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <el-button v-if="canWrite" size="small" data-test="cfb-add-open" @click="addVisible = true">加入學生</el-button>
    </div>

    <!-- B. 新生預繳 -->
    <div class="head prepay-head">
      <div class="head__title">
        <strong>新生預繳</strong>
        <span class="hint">固定 5,000、只收現金；註冊費批產單時自動標記已套用</span>
      </div>
      <div class="head__actions">
        <el-button v-if="canWrite" type="primary" size="small" data-test="ppd-open" @click="prepayVisible = true">登記預繳現金</el-button>
        <el-button size="small" data-test="ppd-refunds-open" @click="refundsVisible = true">
          預繳退款{{ pendingRefundCount ? `（${pendingRefundCount} 待辦）` : '' }}
        </el-button>
      </div>
    </div>
    <table class="items" data-test="ppd-credits">
      <thead>
        <tr><th>對象</th><th>目標學期</th><th class="num">餘額</th><th>狀態</th><th /></tr>
      </thead>
      <tbody>
        <tr v-for="c in credits" :key="c.id" data-test="ppd-credit-row">
          <td>{{ c.student_id ? `${c.student_name}（學生）` : `${c.visit_child_name}（招生訪視）` }}</td>
          <td>{{ c.target_school_year }}-{{ c.target_semester === 1 ? '上' : '下' }}</td>
          <td class="num">{{ formatCurrency(c.balance) }}</td>
          <td><el-tag :type="creditStatusTag(c.status)" size="small">{{ CREDIT_STATUS_LABELS[c.status] ?? c.status }}</el-tag></td>
          <td><el-button size="small" text data-test="ppd-credit-manage" @click="openCredit(c)">管理</el-button></td>
        </tr>
        <tr v-if="credits.length === 0"><td colspan="5" class="hint">本學期尚無有效預繳額度</td></tr>
      </tbody>
    </table>

    <CashFeeBatchDialog v-model="createVisible" @created="fetchBatches" />
    <StudentCashReceiptDialog
      v-model="payVisible"
      :student-id="payStudent?.id ?? null"
      :student-name="payStudent?.name ?? ''"
      :preselect-record-ids="payPreselect"
      @paid="onPaid"
    />
    <PrepaymentCashReceiptDialog v-model="prepayVisible" @received="fetchPrepay" />
    <PrepaymentDrawer v-model="drawerVisible" :credits="drawerCredits" :title="drawerTitle" @refresh="fetchPrepay" />
    <PrepaymentRefundsDialog v-model="refundsVisible" :refunds="refunds" @refresh="fetchPrepay" />
    <StudentPickerDialog v-model="addVisible" title="加入學生到此批次" @pick="onAddPick" />
  </section>
</template>

<script setup lang="ts">
/**
 * 現金項目檢視（SPEC-019 §7）：教材費等現金項目批次＋新生預繳。
 * 兩者只收現金、不進網銀媒合；批次逐生收現金重用 StudentCashReceiptDialog（預勾該張單）。
 */
import { computed, onActivated, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  addCashFeeBatchEntries,
  deleteCashFeeBatch,
  getCashFeeBatch,
  getCashFeeBatches,
  getPrepaymentRefunds,
  getPrepayments,
} from '@/api/fees'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { getCurrentAcademicTerm } from '@/utils/academic'
import EmptyState from '@/components/common/EmptyState.vue'
import { activeSettlementTags } from './settlementDisplay'
import { CASH_FEE_KIND_LABELS, type CashFeeBatchItemRow, type CashFeeBatchRow, type CashFeeKind } from './cashItemTypes'
import { CREDIT_STATUS_LABELS, creditStatusTag, type PrepayCreditRow, type PrepayRefundRow } from './prepayTypes'
import CashFeeBatchDialog from './CashFeeBatchDialog.vue'
import PrepaymentCashReceiptDialog from './PrepaymentCashReceiptDialog.vue'
import PrepaymentDrawer from './PrepaymentDrawer.vue'
import PrepaymentRefundsDialog from './PrepaymentRefundsDialog.vue'
import StudentCashReceiptDialog from './StudentCashReceiptDialog.vue'
import StudentPickerDialog from './StudentPickerDialog.vue'

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

// 學期選項：當前±1 學年 × 上下學期
const term = getCurrentAcademicTerm()
const termOptions = [term.school_year + 1, term.school_year, term.school_year - 1].flatMap((y) =>
  [1, 2].map((s) => ({ key: `${y}-${s}`, label: `${y}-${s === 1 ? '上' : '下'}` })),
)
const termKey = ref(`${term.school_year}-${term.semester}`)

const batches = ref<CashFeeBatchRow[]>([])
const loading = ref(false)
const detail = ref<{ batch: CashFeeBatchRow; items: CashFeeBatchItemRow[] } | null>(null)

// 建批 dialog（宣告在較前面，避免 defineExpose 之後才宣告造成 TDZ）
const createVisible = ref(false)

async function fetchBatches() {
  loading.value = true
  const [y, s] = termKey.value.split('-').map(Number)
  try {
    batches.value = (await getCashFeeBatches({ school_year: y, semester: s })) as unknown as CashFeeBatchRow[]
    if (detail.value && !batches.value.some((b) => b.id === detail.value?.batch.id)) detail.value = null
  } catch (e) {
    ElMessage.error(friendlyError('載入現金項目批次失敗', e))
  } finally {
    loading.value = false
  }
}

async function openBatch(row: CashFeeBatchRow) {
  try {
    detail.value = (await getCashFeeBatch(row.id)) as unknown as {
      batch: CashFeeBatchRow
      items: CashFeeBatchItemRow[]
    }
  } catch (e) {
    ElMessage.error(friendlyError('載入批次明細失敗', e))
  }
}

async function removeBatch(row: CashFeeBatchRow) {
  try {
    await ElMessageBox.confirm(`確定刪除「${row.title}」（${row.student_count} 人）？`, '刪除現金項目批次', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteCashFeeBatch(row.id)
    ElMessage.success('已刪除')
    await fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('刪除失敗', e))
  }
}

// 逐生收現金：預勾該張單
const payVisible = ref(false)
const payStudent = ref<{ id: number; name: string } | null>(null)
const payPreselect = ref<number[]>([])

function openPay(it: CashFeeBatchItemRow) {
  payStudent.value = { id: it.student_id, name: it.student_name ?? '' }
  payPreselect.value = [it.record_id]
  payVisible.value = true
}

async function onPaid() {
  if (detail.value) await openBatch(detail.value.batch)
  await fetchBatches()
}

// 加入學生（轉入生）
const addVisible = ref(false)
async function onAddPick(s: { id: number; name: string }) {
  if (!detail.value) return
  const amount = detail.value.items[0]?.amount_due ?? 0
  try {
    const out = await addCashFeeBatchEntries(detail.value.batch.id, {
      entries: [{ student_id: s.id, amount: amount || 1 }],
    })
    ElMessage.success(out.created ? `已加入 ${s.name}（金額同批次第一位，可到逐筆明細調整）` : `${s.name} 已在此批次`)
    await openBatch(detail.value.batch)
    await fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('加入學生失敗', e))
  }
}

// 新生預繳
const credits = ref<PrepayCreditRow[]>([])
const refunds = ref<PrepayRefundRow[]>([])
const prepayVisible = ref(false)
const refundsVisible = ref(false)
const drawerVisible = ref(false)
const drawerCredits = ref<PrepayCreditRow[]>([])
const drawerTitle = ref('')
const pendingRefundCount = computed(
  () => refunds.value.filter((r) => ['requested', 'approved'].includes(r.status)).length,
)

async function fetchPrepay() {
  try {
    const [c, r] = await Promise.all([getPrepayments(), getPrepaymentRefunds()])
    credits.value = ((c.items ?? []) as PrepayCreditRow[]).filter((x) =>
      ['available', 'applied', 'refund_pending'].includes(x.status),
    )
    refunds.value = (r.items ?? []) as PrepayRefundRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入預繳款失敗', e))
  }
}

function openCredit(c: PrepayCreditRow) {
  drawerCredits.value = [c]
  drawerTitle.value = `${c.student_name ?? c.visit_child_name ?? ''} 的預繳款`
  drawerVisible.value = true
}

function statusLabel(s: string) {
  return s === 'paid' ? '已繳清' : s === 'partial' ? '部分繳費' : '未繳'
}
function statusTag(s: string): 'success' | 'warning' | 'danger' {
  return s === 'paid' ? 'success' : s === 'partial' ? 'warning' : 'danger'
}

function refresh() {
  fetchBatches()
  fetchPrepay()
}

onMounted(refresh)
let activatedOnce = false
onActivated(() => {
  if (activatedOnce) refresh()
  activatedOnce = true
})

defineExpose({ refresh, openCreate: () => (createVisible.value = true) })
</script>

<style scoped>
.cash-items { display: flex; flex-direction: column; gap: var(--space-3); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.head__title { display: flex; flex-direction: column; gap: 2px; }
.head__actions { display: flex; gap: var(--space-2); align-items: center; }
.prepay-head { margin-top: var(--space-4); }
.hint { font-size: 12px; color: var(--el-text-color-secondary); }
.owe { color: var(--color-danger-darker); font-weight: 600; }
.detail { border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); padding: var(--space-3); }
.detail h4 { margin: 0 0 8px; }
.items { width: 100%; border-collapse: collapse; font-size: 13px; }
.items th, .items td { padding: 6px 8px; border-bottom: 1px solid var(--el-border-color-lighter); text-align: left; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.settle-tag { margin-right: 4px; }
</style>
