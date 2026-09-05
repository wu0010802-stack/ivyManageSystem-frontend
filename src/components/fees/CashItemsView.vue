<template>
  <section class="cash-items" aria-label="現金項目">
    <!-- A. 現金項目批次（教材費等） -->
    <div class="head">
      <div class="head__title">
        <h3>現金項目</h3>
        <span class="hint">管理不納入網銀銷帳單的收費，例如新生註冊費、耗材費。</span>
      </div>
      <div class="head__actions">
        <el-select v-model="termKey" size="small" style="width: 130px" aria-label="收費學期" data-test="cfb-term" @change="fetchBatches">
          <el-option v-for="t in termOptions" :key="t.key" :value="t.key" :label="t.label" />
        </el-select>
        <el-button v-if="canWrite" type="primary" size="small" data-test="cfb-create-open" @click="createVisible = true">新增收費項目</el-button>
      </div>
    </div>

    <div class="filters">
      <el-input v-model="search" clearable placeholder="搜尋已載入項目" aria-label="搜尋已載入項目" data-test="cfb-search" />
      <el-select v-model="collectionFilter" aria-label="收款狀態" data-test="cfb-filter">
        <el-option value="all" label="全部項目" /><el-option value="outstanding" label="尚未收齊" /><el-option value="paid" label="已收齊" />
      </el-select>
    </div>
    <p v-if="batches.length >= 200" class="hint">目前顯示此學期最近 200 筆項目，搜尋與篩選僅套用於已載入項目。</p>
    <el-alert v-if="listError" :title="listError" type="error" :closable="false"><el-button @click="fetchBatches">重新載入</el-button></el-alert>
    <p class="mobile-table-hint hint">左右滑動查看金額與繳費期限</p>
    <div class="table-scroll">
    <el-table v-loading="loading" :data="filteredBatches" size="small" border data-test="cfb-list" @row-click="openBatch">
      <el-table-column label="項目名稱" min-width="200">
        <template #default="{ row }">
          <div data-test="cfb-list-row" :data-batch="row.id">
            <el-tag size="small" effect="plain">{{ CASH_FEE_KIND_LABELS[row.kind as CashFeeKind] ?? row.kind }}</el-tag>
            {{ row.title }}
            <el-button size="small" text type="primary" data-test="cfb-open" @click.stop="openBatch(row)">收款明細</el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="人數" width="70" align="right"><template #default="{ row }">{{ row.student_count }}</template></el-table-column>
      <el-table-column label="應收" width="110" align="right"><template #default="{ row }">{{ formatCurrency(row.total_due) }}</template></el-table-column>
      <el-table-column label="已收" width="110" align="right"><template #default="{ row }">{{ formatCurrency(row.total_paid) }}</template></el-table-column>
      <el-table-column label="未收" width="110" align="right">
        <template #default="{ row }"><span :class="{ owe: row.outstanding > 0 }">{{ formatCurrency(row.outstanding) }}</span></template>
      </el-table-column>
      <el-table-column label="繳費期限" width="110"><template #default="{ row }">{{ row.due_date || '—' }}</template></el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button v-if="canWrite && row.total_paid === 0" size="small" text type="danger" data-test="cfb-delete" @click.stop="removeBatch(row)">刪除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState v-if="!loading && !listError" :title="search || collectionFilter !== 'all' ? '沒有符合條件的項目' : '此學期尚無現金項目'" description="新增收費項目，選擇學生並填入應收金額。" />
      </template>
    </el-table>
    </div>
    <p v-if="detailLoading" role="status">正在載入收款明細…</p>
    <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />

    <div v-if="detail" class="detail" data-test="cfb-detail">
      <div class="head"><h4>收款明細 · {{ detail.batch.title }}　<small class="hint">{{ detail.items.length }} 人・未收 {{ formatCurrency(detail.batch.outstanding) }}</small></h4><el-button data-test="cfb-detail-close" @click="closeDetail">關閉明細</el-button></div>
      <div class="table-scroll"><table class="items">
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
              <el-button v-if="it.status !== 'paid'" size="small" text type="primary" data-test="cfb-item-pay" @click="openPay(it)">登記收款</el-button>
            </td>
          </tr>
        </tbody>
      </table></div>
      <el-button v-if="canWrite && canReadStudents" size="small" data-test="cfb-add-open" @click="startAdd">加入學生</el-button>
      <p v-if="canWrite && !canReadStudents" class="hint">加入學生需具備學生檢視權限。</p>
    </div>

    <!-- B. 新生預繳 -->
    <details class="prepay-section">
    <summary>新生預繳 <span class="hint">固定 5,000 元現金預繳 · {{ pendingRefundCount }} 筆退款待辦</span></summary>
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
    <div class="table-scroll"><table class="items" data-test="ppd-credits">
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
        <tr v-if="credits.length === 0"><td colspan="5" class="hint">目前尚無有效預繳額度</td></tr>
      </tbody>
    </table>

    </div></details>

    <CashFeeBatchDialog v-model="createVisible" :school-year="selectedTerm.school_year" :semester="selectedTerm.semester" @created="fetchBatches" />
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
    <StudentPickerDialog v-if="canReadStudents" v-model="addVisible" title="選擇要加入的學生" @pick="onAddPick" />
    <el-dialog v-model="addConfirmVisible" title="確認加入收費項目" width="min(440px, 94vw)" :close-on-click-modal="!adding" :close-on-press-escape="!adding" :show-close="!adding">
      <p>{{ addTarget?.title }} · {{ addStudent?.name }}</p>
      <label>本次應收金額<el-input-number v-model="addAmount" :min="0" :precision="0" :disabled="adding" aria-label="加入學生應收金額" data-test="cfb-add-amount" /></label>
      <template #footer>
        <el-button :disabled="adding" data-test="cfb-add-cancel" @click="addConfirmVisible = false">取消</el-button>
        <el-button type="primary" :loading="adding" :disabled="!validAddAmount || adding" data-test="cfb-add-confirm" @click="confirmAdd">確認加入</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
/**
 * 現金項目檢視（SPEC-019 §7）：教材費等現金項目批次＋新生預繳。
 * 兩者只收現金、不進網銀媒合；批次逐生收現金重用 StudentCashReceiptDialog（預勾該張單）。
 */
import { computed, onActivated, onMounted, onBeforeUnmount, ref, watch } from 'vue'
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

const canReadStudents = computed(() => hasPermission(PERMISSION_NAMES.STUDENTS_READ))
const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

// 學期選項：當前±1 學年 × 上下學期
const term = getCurrentAcademicTerm()
const termOptions = [term.school_year + 1, term.school_year, term.school_year - 1].flatMap((y) =>
  [1, 2].map((s) => ({ key: `${y}-${s}`, label: `${y}-${s === 1 ? '上' : '下'}` })),
)
const termKey = ref(`${term.school_year}-${term.semester}`)

const selectedTerm = computed(() => { const [school_year, semester] = termKey.value.split('-').map(Number); return { school_year, semester } })
const search = ref('')
const collectionFilter = ref('all')
const listError = ref('')
const detailError = ref('')
const detailLoading = ref(false)
let listSequence = 0
let detailSequence = 0
const batches = ref<CashFeeBatchRow[]>([])
const loading = ref(false)
const detail = ref<{ batch: CashFeeBatchRow; items: CashFeeBatchItemRow[] } | null>(null)

const filteredBatches = computed(() => batches.value.filter(batch => batch.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()) && (collectionFilter.value === 'all' || (collectionFilter.value === 'paid' ? batch.outstanding <= 0 : batch.outstanding > 0))))

function closeDetail() { detailSequence++; detail.value = null; detailLoading.value = false; detailError.value = '' }
watch(termKey, () => { closeDetail(); batches.value = [] })
onBeforeUnmount(() => { listSequence++; detailSequence++ })

// 建批 dialog（宣告在較前面，避免 defineExpose 之後才宣告造成 TDZ）
const createVisible = ref(false)

async function fetchBatches() {
  const sequence = ++listSequence
  listError.value = ''
  loading.value = true
  const [y, s] = termKey.value.split('-').map(Number)
  try {
    const result = await getCashFeeBatches({ school_year: y, semester: s })
    if (sequence !== listSequence) return
    batches.value = result as unknown as CashFeeBatchRow[]
    if (detail.value && !batches.value.some((b) => b.id === detail.value?.batch.id)) detail.value = null
  } catch (e) {
    if (sequence === listSequence) listError.value = friendlyError('載入收費項目失敗', e)
  } finally {
    if (sequence === listSequence) loading.value = false
  }
}

async function openBatch(row: CashFeeBatchRow) {
  const sequence = ++detailSequence
  detail.value = null
  detailLoading.value = true
  detailError.value = ''
  try {
    const result = await getCashFeeBatch(row.id)
    if (sequence !== detailSequence) return
    detail.value = result as unknown as { batch: CashFeeBatchRow; items: CashFeeBatchItemRow[] }
  } catch (e) {
    if (sequence === detailSequence) detailError.value = friendlyError('載入收款明細失敗', e)
  } finally {
    if (sequence === detailSequence) detailLoading.value = false
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
const addConfirmVisible = ref(false)
const adding = ref(false)
const addAmount = ref<number | undefined>()
const addTarget = ref<CashFeeBatchRow | null>(null)
const addStudent = ref<{ id: number; name: string } | null>(null)
const validAddAmount = computed(() => typeof addAmount.value === 'number' && Number.isSafeInteger(addAmount.value) && addAmount.value > 0)
function startAdd() {
  if (!canReadStudents.value || !detail.value || adding.value) return
  addTarget.value = detail.value.batch
  addStudent.value = null
  addAmount.value = undefined
  addVisible.value = true
}
function onAddPick(student: { id: number; name: string }) {
  if (!canReadStudents.value || !addTarget.value || adding.value) return
  addStudent.value = student
  addVisible.value = false
  addConfirmVisible.value = true
}
async function confirmAdd() {
  if (!canReadStudents.value || !addTarget.value || !addStudent.value || !validAddAmount.value || adding.value) return
  const batch = addTarget.value
  const student = addStudent.value
  adding.value = true
  try {
    const out = await addCashFeeBatchEntries(batch.id, { entries: [{ student_id: student.id, amount: addAmount.value! }] })
    ElMessage.success(out.created ? `已加入 ${student.name}` : `${student.name} 已在此項目`)
    addConfirmVisible.value = false
    if (detail.value?.batch.id === batch.id) await openBatch(batch)
    await fetchBatches()
  } catch (e) { ElMessage.error(friendlyError('加入學生失敗', e)) }
  finally { adding.value = false }
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
.cash-items { min-width: 0; }
.mobile-table-hint { display: none; margin: 0; }
.head h3 { margin: 0; font-size: var(--text-lg); }
.filters { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.filters > :first-child { max-width: 320px; }
.filters > :last-child { width: 160px; }
.table-scroll { overflow-x: auto; max-width: 100%; }
.items { min-width: 560px; }
.prepay-section { border-top: 1px solid var(--el-border-color-lighter); padding-top: var(--space-4); margin-top: var(--space-4); }
.prepay-section summary { cursor: pointer; font-weight: 600; }
.prepay-section summary .hint { font-weight: 400; margin-left: var(--space-2); }
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
.items .num { text-align: right; font-variant-numeric: tabular-nums; }
.settle-tag { margin-right: 4px; }
@media (--to-sm) {
  .mobile-table-hint { display: block; }
  .head__actions { width: 100%; flex-wrap: wrap; }
  .head__actions :deep(.el-button) { min-height: 44px; }
  .filters > :first-child { max-width: none; flex: 1 1 100%; }
  .prepay-section summary .hint { display: block; margin: var(--space-2) 0 0; }
}
</style>
