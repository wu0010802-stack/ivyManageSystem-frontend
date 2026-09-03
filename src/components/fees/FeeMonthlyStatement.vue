<template>
  <section class="fee-monthly-statement" aria-label="月繳總表">
    <!-- 摘要列（2026-09-02 收斂）：待收金額＋狀態快篩＋應收/已收＋收款確認
         合併成一列。改版前這四塊各佔一列，表格被推到第五列才開始。 -->
    <div class="stmt-strip" data-test="stmt-summary">
      <div class="stmt-strip__main">
        <div class="stmt-strip__label">{{ monthLabel }}待收</div>
        <div class="stmt-strip__value">{{ formatCurrency(scopeOutstanding) }}</div>
      </div>

      <div class="stmt-strip__chips" role="group" aria-label="繳費狀態快篩">
        <button
          v-for="tile in statusTiles"
          :key="tile.key"
          type="button"
          class="stmt-chip"
          :class="{ 'stmt-chip--on': statusOn[tile.key] }"
          :data-test="`stmt-flt-${tile.key}`"
          :aria-pressed="statusOn[tile.key]"
          @click="toggleStatus(tile.key)"
        >
          <span class="stmt-dot" :class="`stmt-dot--${tile.key}`" aria-hidden="true" />
          {{ tile.label }} <b>{{ tile.count }}</b><small> 人</small>
        </button>
        <!-- SPEC-015 逾期快篩：衍生標註（due_date 已過且未繳清），與狀態維度正交 -->
        <button
          type="button"
          class="stmt-chip"
          :class="{ 'stmt-chip--on': overdueOnly }"
          data-test="stmt-flt-overdue"
          :aria-pressed="overdueOnly"
          @click="overdueOnly = !overdueOnly"
        >
          <span class="stmt-dot stmt-dot--overdue" aria-hidden="true" />
          逾期 <b>{{ overdueCount }}</b><small> 人</small>
        </button>
      </div>

      <div class="stmt-strip__side">
        <div class="stmt-strip__totals">
          應收 <strong class="num-cell">{{ formatCurrency(scopeDue) }}</strong>
          <span aria-hidden="true"> ・ </span>
          已收 <strong class="num-cell">{{ formatCurrency(scopePaid) }}</strong>
        </div>
        <!-- 收款確認分解（SPEC-014 §16 老闆視角）：已收的錢各經過哪一層確認。
             範圍與上方統計同軸（班級＋姓名篩選，不含狀態快篩）。 -->
        <div class="stmt-strip__settlement" data-test="stmt-settlement">
          <template v-if="scopeSettlementTags.length">
            <el-tag
              v-for="tag in scopeSettlementTags"
              :key="tag.key"
              :type="tag.tagType"
              size="small"
              class="stmt-settlement__tag"
              :class="{ 'stmt-settlement__tag--link': tag.jump }"
              data-test="stmt-settlement-tag"
              :data-bucket="tag.key"
              @click="tag.jump && jumpToWorkspace(tag.jump)"
            >
              {{ tag.label }} {{ formatCurrency(tag.amount) }}
            </el-tag>
          </template>
          <span v-else class="stmt-strip__empty" data-test="stmt-settlement-empty">
            本月尚無已入帳收款
          </span>
        </div>
      </div>
    </div>

    <!-- 篩選列：月份、班級、姓名、批次動作全部收在同一列 -->
    <div class="stmt-filters">
      <div class="month-nav" role="group" aria-label="月份選擇">
        <el-button
          size="small"
          data-test="stmt-month-prev"
          aria-label="上一月"
          @click="shiftMonth(-1)"
        >
          ‹
        </el-button>
        <div class="month-label">
          <strong data-test="stmt-month-label">{{ monthLabel }}</strong>
        </div>
        <el-button
          size="small"
          data-test="stmt-month-next"
          aria-label="下一月"
          @click="shiftMonth(1)"
        >
          ›
        </el-button>
        <el-button
          size="small"
          data-test="stmt-month-current"
          :disabled="isCurrentMonth"
          @click="goCurrentMonth"
        >
          本月
        </el-button>
      </div>

      <!-- 班級：改版前是 11 顆 chip 佔滿一整列，改為下拉並在選項內保留未收人數 -->
      <el-select
        :model-value="selectedClassroom ?? ALL_CLASSROOMS"
        class="stmt-class-select"
        data-test="stmt-class-select"
        aria-label="班級篩選"
        @update:model-value="onClassroomSelect"
      >
        <el-option
          v-for="chip in classChips"
          :key="chip.name || ALL_CLASSROOMS"
          :value="chip.name || ALL_CLASSROOMS"
          :label="chip.selectLabel"
          :data-classroom="chip.name"
        />
      </el-select>

      <el-input
        v-model="searchName"
        class="stmt-search"
        data-test="stmt-search"
        placeholder="搜尋學生姓名"
        clearable
        aria-label="搜尋學生姓名"
      />

      <span class="stmt-filters__spacer" />

      <span class="stmt-filters__count" data-test="stmt-visible-count">
        共 {{ visibleStudents.length }} 人
      </span>

      <el-button
        v-if="canWrite"
        type="primary"
        data-test="stmt-batch-pay"
        :disabled="checkedIds.size === 0"
        @click="openBatchPay"
      >
        批次收款{{ checkedIds.size ? `（${checkedIds.size} 人）` : '' }}
      </el-button>
    </div>

    <p
      v-if="canWrite && checkedIds.size"
      class="stmt-selected-hint"
      data-test="stmt-batch-hint"
    >
      已選 {{ checkedIds.size }} 人，未收合計
      <strong>{{ formatCurrency(checkedOutstanding) }}</strong>
    </p>

    <!-- 載入/錯誤/內容 -->
    <el-skeleton v-if="loading && !statement" :rows="5" animated />
    <div v-else-if="loadError" class="stmt-state" data-test="stmt-error" role="alert">
      <p>載入月繳總表失敗</p>
      <el-button size="small" data-test="stmt-retry" @click="fetchStatement">重試</el-button>
    </div>
    <div v-else-if="students.length === 0" class="stmt-state" data-test="stmt-empty">
      <p>{{ monthLabel }}尚無費用單——請匯入繳款單檢核檔產單（月費批／註冊費批）</p>
      <el-button
        v-if="canWrite"
        size="small"
        type="primary"
        data-test="stmt-empty-import"
        @click="emit('open-imports')"
      >
        匯入檢核檔
      </el-button>
    </div>
    <div v-else class="stmt-table-wrap">
      <table class="stmt-table" data-test="stmt-table">
        <thead>
          <tr>
            <th v-if="canWrite" class="col-check">
              <input
                type="checkbox"
                aria-label="全選本頁可收款學生"
                :checked="allChecked"
                @change="toggleCheckAll"
              />
            </th>
            <th class="col-student">學生</th>
            <th>班級</th>
            <th>銷帳碼</th>
            <th v-for="b in visibleBuckets" :key="b.key" class="num-col">{{ b.label }}</th>
            <th class="num-col">應繳合計</th>
            <th class="num-col">未收</th>
            <!-- SPEC-019 §8.1：分辨這筆錢是現金收的還是網銀進來的 -->
            <th class="num-col">現金已收</th>
            <th class="num-col">網銀已收</th>
            <th>預繳</th>
            <th>狀態</th>
            <th v-if="canWrite">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="stu in visibleStudents" :key="stu.student_id">
            <tr
              class="stmt-row"
              :class="{ 'stmt-row--paid': stu.status === 'paid' }"
              data-test="stmt-row"
              :data-student="stu.student_name ?? ''"
            >
              <td v-if="canWrite" class="col-check">
                <input
                  type="checkbox"
                  data-test="stmt-check"
                  :aria-label="`選取 ${stu.student_name}`"
                  :disabled="stu.status === 'paid'"
                  :checked="checkedIds.has(stu.student_id)"
                  @change="toggleCheck(stu.student_id)"
                />
              </td>
              <td class="col-student">
                <button
                  type="button"
                  class="expand-btn"
                  data-test="stmt-expand"
                  :aria-expanded="expandedIds.has(stu.student_id)"
                  :aria-label="`展開 ${stu.student_name} 明細`"
                  @click="toggleExpand(stu.student_id)"
                >
                  <span class="expand-caret" :class="{ 'expand-caret--open': expandedIds.has(stu.student_id) }">▸</span>
                  <span class="student-name">{{ stu.student_name }}</span>
                </button>
              </td>
              <td>{{ stu.classroom_name || '—' }}</td>
              <td class="col-billing-code">
                <BillingCodeCell
                  :suffix="stu.billing_code_suffix"
                  :full-number="stu.full_collection_number"
                />
              </td>
              <td v-for="b in visibleBuckets" :key="b.key" class="num-cell">
                <template v-if="bucketCell(stu, b.key)">
                  <span
                    class="bucket-amount"
                    :class="{ 'bucket-amount--paid': bucketCell(stu, b.key)!.allPaid }"
                    :title="bucketCell(stu, b.key)!.names"
                  >
                    {{ bucketCell(stu, b.key)!.due.toLocaleString('zh-Hant') }}
                  </span>
                </template>
                <span v-else class="cell-empty">—</span>
              </td>
              <td class="num-cell total-due">{{ formatCurrency(stu.total_due) }}</td>
              <td class="num-cell" :class="stu.outstanding > 0 ? 'outstanding-pos' : 'cell-empty'">
                {{ stu.outstanding > 0 ? formatCurrency(stu.outstanding) : '—' }}
              </td>
              <td
                class="num-cell"
                :class="{ 'cell-empty': paidSplit(stu).cash <= 0 }"
                data-test="stmt-cash-paid"
              >
                {{ paidSplit(stu).cash > 0 ? formatCurrency(paidSplit(stu).cash) : '—' }}
              </td>
              <td
                class="num-cell"
                :class="{ 'cell-empty': paidSplit(stu).bank <= 0 }"
                data-test="stmt-bank-paid"
              >
                {{ paidSplit(stu).bank > 0 ? formatCurrency(paidSplit(stu).bank) : '—' }}
              </td>
              <td>
                <button
                  v-if="prepayCells.get(stu.student_id)"
                  type="button"
                  class="prepay-cell-btn"
                  data-test="stmt-prepay-cell"
                  :aria-label="`開啟 ${stu.student_name} 預繳管理`"
                  @click="openStudentDrawer(stu)"
                >
                  <el-tag :type="prepayCells.get(stu.student_id)!.tagType" size="small">
                    {{ prepayCells.get(stu.student_id)!.label }}
                  </el-tag>
                </button>
                <span v-else class="cell-empty">—</span>
              </td>
              <td>
                <el-tag :type="statusTagType(stu.status)" size="small">
                  {{ statusLabel(stu.status) }}
                </el-tag>
                <el-tag
                  v-if="isOverdueStudent(stu)"
                  type="danger"
                  size="small"
                  effect="plain"
                  class="overdue-tag"
                  data-test="stmt-overdue-tag"
                >
                  逾期
                </el-tag>
              </td>
              <td v-if="canWrite">
                <el-button
                  v-if="stu.status !== 'paid'"
                  link
                  type="primary"
                  size="small"
                  data-test="stmt-pay"
                  @click="openCashFor(stu)"
                >
                  收現金
                </el-button>
              </td>
            </tr>
            <tr v-if="expandedIds.has(stu.student_id)" class="stmt-detail" data-test="stmt-detail">
              <td :colspan="totalColumns">
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>費用項目</th>
                      <th class="num-col">金額</th>
                      <th>狀態</th>
                      <th>繳費日期</th>
                      <th>方式</th>
                      <th>收款確認</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="it in stu.items" :key="it.id">
                      <td>{{ it.fee_item_name }}</td>
                      <td class="num-cell">{{ formatCurrency(it.amount_due) }}</td>
                      <td>
                        <el-tag :type="statusTagType(it.status ?? 'unpaid')" size="small">
                          {{ statusLabel(it.status ?? 'unpaid') }}
                        </el-tag>
                      </td>
                      <td>{{ it.payment_date || '—' }}</td>
                      <td>{{ it.payment_method || '—' }}</td>
                      <td>
                        <template v-if="activeSettlementTags(it.settlement).length">
                          <el-tag
                            v-for="tag in activeSettlementTags(it.settlement)"
                            :key="tag.key"
                            :type="tag.tagType"
                            size="small"
                            class="stmt-settlement__tag"
                            :title="`${tag.label} ${formatCurrency(tag.amount)}`"
                            data-test="stmt-item-settlement-tag"
                          >
                            {{ tag.label }}
                          </el-tag>
                        </template>
                        <span v-else class="cell-empty">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div class="detail-footer">
                  <el-button
                    link
                    type="primary"
                    size="small"
                    data-test="stmt-open-list"
                    @click="emit('open-list', stu.student_name ?? '')"
                  >
                    到逐筆明細處理（部分繳費／退款）
                  </el-button>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="visibleStudents.length === 0">
            <td :colspan="totalColumns" class="stmt-state" data-test="stmt-no-match">
              此篩選條件下沒有學生——試試切換狀態或班級
            </td>
          </tr>
        </tbody>
        <tfoot v-if="visibleStudents.length">
          <tr>
            <td v-if="canWrite" />
            <td :colspan="3 + visibleBuckets.length">合計（目前篩選 {{ visibleStudents.length }} 人）</td>
            <td class="num-cell">{{ formatCurrency(visibleDue) }}</td>
            <td class="num-cell outstanding-pos">{{ formatCurrency(visibleOutstanding) }}</td>
            <!-- 現金已收／網銀已收／預繳／狀態（＋canWrite 的操作欄）不做合計 -->
            <td :colspan="canWrite ? 5 : 4" />
          </tr>
        </tfoot>
      </table>
    </div>

    <BatchPayDialog v-model="payDialogVisible" :records="payRecords" @paid="onPaid" />
    <PrepaymentDrawer
      v-model="drawerVisible"
      :credits="drawerCredits"
      :title="drawerTitle"
      @refresh="onPrepayMutated"
    />
    <StudentCashReceiptDialog
      v-model="cashDialogVisible"
      :student-id="cashStudent?.id ?? null"
      :student-name="cashStudent?.name ?? ''"
      :month="month"
      @paid="onPaid"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * 月繳總表（帳單工作區「彙總繳費表」檢視，2026-08 改版）。
 *
 * 一次撈整月 per-student 聚合（GET /fees/monthly-statement），
 * 班級 chips／狀態快篩／姓名搜尋全部前端即時切換（園所規模單月 ≤ 數百人）。
 * 批次收款（多人繳清全額）走 BatchPayDialog；部分繳費／退款導向逐筆明細
 * （emit open-list 由帳單工作區切換模式）。
 *
 * 預繳款自 2026-08-26 起併入本表：每列「預繳」欄顯示該生額度狀態，
 * 點擊開 PrepaymentDrawer 管理。
 *
 * 2026-09-02 SPEC-019：列上「收現金」改開 StudentCashReceiptDialog（該生
 * 月費＋註冊＋教材費一次收成一張收據）；新增「現金已收／網銀已收」兩欄，
 * 讓業主一眼分辨錢是現金收的還是網銀進來的；工具列「預繳款」下拉移到
 * 現金項目檢視（訪視預繳／預繳退款），本表只留每列預繳欄。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getFeeMonthlyStatement, getPrepayments } from '@/api/fees'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import BatchPayDialog from '@/components/fees/BatchPayDialog.vue'
import BillingCodeCell from '@/components/fees/BillingCodeCell.vue'
import {
  activeSettlementTags,
  sumSettlements,
} from '@/components/fees/settlementDisplay'
import type { FeeWorkspaceKey } from '@/components/fees/workspace/feesNavigation'
import PrepaymentDrawer from '@/components/fees/PrepaymentDrawer.vue'
import StudentCashReceiptDialog from '@/components/fees/StudentCashReceiptDialog.vue'
import {
  CREDIT_STATUS_LABELS,
  creditStatusTag,
  type PrepayCreditRow,
} from '@/components/fees/prepayTypes'

type MonthlyStatement = Awaited<ReturnType<typeof getFeeMonthlyStatement>>
type StatementStudent = MonthlyStatement['students'][number]

interface ClassroomLite {
  name?: string | null
  grade_name?: string | null
}

const props = withDefaults(
  defineProps<{
    classrooms?: ClassroomLite[]
  }>(),
  { classrooms: () => [] },
)

const emit = defineEmits<{
  'open-list': [studentName: string]
  /** SPEC-019：空狀態導向發單批次抽屜（應收唯一來源＝檢核檔產單） */
  'open-imports': []
}>()

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

// ─── 月份狀態 ──────────────────────────────────────────────────────────────
const currentMonth = () => todayISO().slice(0, 7)
const month = ref(currentMonth())
const isCurrentMonth = computed(() => month.value === currentMonth())
const monthLabel = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return `${y - 1911} 年 ${m} 月`
})

function shiftMonth(delta: number) {
  const [y, m] = month.value.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  month.value = `${ny}-${String(nm).padStart(2, '0')}`
}

function goCurrentMonth() {
  month.value = currentMonth()
}

// ─── 資料載入（race guard：舊回應不得覆蓋新條件）──────────────────────────
const statement = ref<MonthlyStatement | null>(null)
const loading = ref(false)
const loadError = ref(false)
let requestSeq = 0

async function fetchStatement() {
  const seq = ++requestSeq
  loading.value = true
  loadError.value = false
  try {
    const data = await getFeeMonthlyStatement({ month: month.value })
    if (seq !== requestSeq) return
    statement.value = data
  } catch {
    if (seq !== requestSeq) return
    loadError.value = true
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(month, () => {
  checkedIds.value = new Set()
  expandedIds.value = new Set()
  fetchStatement()
})
onMounted(() => {
  fetchStatement()
  fetchPrepayData()
})

function refreshAll() {
  fetchStatement()
  fetchPrepayData()
}

defineExpose({ refresh: refreshAll })

// ─── 預繳款（2026-08-26 併入帳款）────────────────────────────────────────
const prepayCredits = ref<PrepayCreditRow[]>([])

async function fetchPrepayData() {
  try {
    const creditsRes = await getPrepayments()
    prepayCredits.value = (creditsRes.items ?? []) as PrepayCreditRow[]
  } catch (e) {
    // 不阻擋帳款主表；欄位顯示 '—' 但明講載入失敗，避免誤讀成「無預繳」
    ElMessage.error(friendlyError('載入預繳款失敗', e))
  }
}

/** 每位學生的預繳欄內容：可用（合計餘額）＞退款處理中＞已套用；終態不顯示 */
const prepayCells = computed(() => {
  const byStudent = new Map<number, PrepayCreditRow[]>()
  prepayCredits.value.forEach((c) => {
    if (c.student_id == null) return
    const list = byStudent.get(c.student_id) ?? []
    list.push(c)
    byStudent.set(c.student_id, list)
  })
  const cells = new Map<
    number,
    { label: string; tagType: 'success' | 'info' | 'warning' | 'danger' }
  >()
  byStudent.forEach((list, studentId) => {
    const availableTotal = list
      .filter((c) => c.status === 'available')
      .reduce((a, c) => a + c.balance, 0)
    if (availableTotal > 0) {
      cells.set(studentId, {
        label: `${CREDIT_STATUS_LABELS.available} ${formatCurrency(availableTotal)}`,
        tagType: creditStatusTag('available'),
      })
      return
    }
    const next = list.find((c) => c.status === 'refund_pending') ?? list.find((c) => c.status === 'applied')
    if (next) {
      cells.set(studentId, {
        label: CREDIT_STATUS_LABELS[next.status] ?? next.status,
        tagType: creditStatusTag(next.status),
      })
    }
  })
  return cells
})

// 抽屜只剩單一學生模式（點預繳欄）；訪視預繳／預繳退款入口自 SPEC-019 起
// 移到收款›現金項目檢視
const drawerVisible = ref(false)
const drawerStudent = ref<{ id: number; name: string } | null>(null)

const drawerCredits = computed(() =>
  prepayCredits.value.filter((c) => c.student_id === drawerStudent.value?.id),
)

const drawerTitle = computed(() => `${drawerStudent.value?.name ?? ''} 的預繳款`)

function openStudentDrawer(stu: StatementStudent) {
  drawerStudent.value = { id: stu.student_id, name: stu.student_name ?? '' }
  drawerVisible.value = true
}

// 預繳 mutation（套用會建立折抵，影響應繳）→ 帳款與預繳一起重抓
function onPrepayMutated() {
  refreshAll()
}

// ─── 前端快篩狀態 ──────────────────────────────────────────────────────────
const searchName = ref('')
const selectedClassroom = ref<string | null>(null)
// 預設「該繳的人」：未繳＋部分繳費開、已繳清關
const statusOn = ref<Record<string, boolean>>({
  unpaid: true,
  partial: true,
  paid: false,
})

function toggleStatus(key: string) {
  const next = { ...statusOn.value, [key]: !statusOn.value[key] }
  // 至少保留一個狀態開啟，避免表格必然全空
  if (!next.unpaid && !next.partial && !next.paid) return
  statusOn.value = next
}

/** el-select 用空字串當值會被當成「未選」而顯示 placeholder，故全部班級用哨兵值 */
const ALL_CLASSROOMS = '__all__'

function onClassroomSelect(value: unknown) {
  const name =
    typeof value === 'string' && value && value !== ALL_CLASSROOMS ? value : null
  if (name === selectedClassroom.value) return
  selectedClassroom.value = name
  checkedIds.value = new Set()
}

const students = computed<StatementStudent[]>(() => statement.value?.students ?? [])

// scope＝班級＋姓名（不含狀態），供統計 tiles 與費用欄位可見性
const scopeStudents = computed(() => {
  const kw = searchName.value.trim()
  return students.value.filter(
    (s) =>
      (!selectedClassroom.value || s.classroom_name === selectedClassroom.value) &&
      (!kw || (s.student_name ?? '').includes(kw)),
  )
})

// ─── 逾期（SPEC-015 衍生標註）：任一費用項 due_date 已過且該項未繳清 ───────
// 只標註、不擋操作；與 unpaid/partial/paid 狀態維度正交（獨立 toggle）。
const overdueOnly = ref(false)

function isOverdueStudent(s: StatementStudent): boolean {
  const today = todayISO()
  return (s.items ?? []).some(
    (it) => !!it.due_date && it.due_date < today && it.status !== 'paid',
  )
}

const overdueCount = computed(
  () => scopeStudents.value.filter((s) => isOverdueStudent(s)).length,
)

const visibleStudents = computed(() =>
  scopeStudents.value.filter(
    (s) => (statusOn.value[s.status] ?? true) && (!overdueOnly.value || isOverdueStudent(s)),
  ),
)

// ─── 收款確認分解（SPEC-014 §16）：scope 內逐項 settlement 加總 ────────────
const scopeSettlementTags = computed(() =>
  activeSettlementTags(
    sumSettlements(
      scopeStudents.value.flatMap((s) => s.items.map((it) => it.settlement)),
    ),
  ),
)

// 收款確認 tag 跳轉（現金桶→結算交接、網銀桶→對帳）。測試環境可能未掛
// router：useRouter 回 undefined 時靜默略過。
const router = useRouter()
function jumpToWorkspace(target: { ws: FeeWorkspaceKey; view: string }) {
  router?.push({ path: '/fees', query: { ws: target.ws, view: target.view } })
}

const scopeDue = computed(() => scopeStudents.value.reduce((a, s) => a + s.total_due, 0))
const scopePaid = computed(() => scopeStudents.value.reduce((a, s) => a + s.total_paid, 0))
const scopeOutstanding = computed(() =>
  scopeStudents.value.reduce((a, s) => a + s.outstanding, 0),
)
const visibleDue = computed(() => visibleStudents.value.reduce((a, s) => a + s.total_due, 0))
const visibleOutstanding = computed(() =>
  visibleStudents.value.reduce((a, s) => a + s.outstanding, 0),
)

const statusTiles = computed(() => {
  const count = (st: string) => scopeStudents.value.filter((s) => s.status === st).length
  return [
    { key: 'unpaid', label: '未繳', count: count('unpaid') },
    { key: 'partial', label: '部分繳費', count: count('partial') },
    { key: 'paid', label: '已繳清', count: count('paid') },
  ]
})

// ─── 班級 chips（跨學期同名去重；未收齊人數以整月資料計，不受搜尋影響）──
const classChips = computed(() => {
  const oweBy = new Map<string, number>()
  students.value.forEach((s) => {
    if (s.status === 'paid') return
    const key = s.classroom_name ?? ''
    oweBy.set(key, (oweBy.get(key) ?? 0) + 1)
  })
  const seen = new Set<string>()
  const chips: Array<{
    name: string
    label: string
    gradeName: string
    oweCount: number
    /** 下拉選項文字：班名（年級）＋未收人數／已收齊 */
    selectLabel: string
  }> = []
  const allOwe = students.value.filter((s) => s.status !== 'paid').length
  chips.push({
    name: '',
    label: '全部班級',
    gradeName: '',
    oweCount: allOwe,
    selectLabel: allOwe ? `全部班級（${allOwe} 人未收齊）` : '全部班級（已收齊）',
  })
  props.classrooms.forEach((c) => {
    const name = c.name ?? ''
    if (!name || seen.has(name)) return
    seen.add(name)
    const grade = c.grade_name ?? ''
    const owe = oweBy.get(name) ?? 0
    chips.push({
      name,
      label: name,
      gradeName: grade,
      oweCount: owe,
      selectLabel: `${name}${grade ? `（${grade}）` : ''}　${owe ? `${owe} 人未收齊` : '已收齊'}`,
    })
  })
  return chips
})

// ─── 費用欄位（依當月出現的 fee_type 動態顯示）────────────────────────────
const FEE_BUCKETS = [
  { key: 'monthly', label: '月費' },
  { key: 'registration', label: '註冊費' },
  { key: 'material', label: '教材費' },
  { key: 'insurance', label: '保險費' },
  { key: 'misc', label: '雜項' },
]

function bucketOf(feeType?: string | null): string {
  return ['monthly', 'registration', 'material', 'insurance'].includes(feeType ?? '')
    ? (feeType as string)
    : 'misc'
}

const visibleBuckets = computed(() =>
  FEE_BUCKETS.filter((b) =>
    scopeStudents.value.some((s) => s.items.some((it) => bucketOf(it.fee_type) === b.key)),
  ),
)

function bucketCell(stu: StatementStudent, bucketKey: string) {
  const items = stu.items.filter((it) => bucketOf(it.fee_type) === bucketKey)
  if (!items.length) return null
  return {
    due: items.reduce((a, it) => a + it.amount_due, 0),
    allPaid: items.every((it) => it.status === 'paid'),
    names: items.map((it) => it.fee_item_name ?? '').join('、'),
  }
}

// 9 固定欄（學生/班級/銷帳碼/應繳合計/未收/現金已收/網銀已收/預繳/狀態）
// ＋動態費用欄＋canWrite 時的勾選與操作兩欄
const totalColumns = computed(
  () => 9 + visibleBuckets.value.length + (canWrite.value ? 2 : 0),
)

/**
 * SPEC-019 §8.1：每列現金／網銀已收＝該生各項 settlement 五桶加總。
 * 現金三桶（已登錄／待簽收／已簽收）都是「現金收到了」，只是簽收層級不同；
 * 網銀為對帳銷帳。unreceipted（存量無收據）不歸入任一欄，仍由既有 tag 呈現。
 */
function paidSplit(stu: StatementStudent): { cash: number; bank: number } {
  return stu.items.reduce(
    (acc, it) => {
      const s = it.settlement
      acc.cash += (s?.cash_registered ?? 0) + (s?.cash_submitted ?? 0) + (s?.cash_confirmed ?? 0)
      acc.bank += s?.bank_reconciled ?? 0
      return acc
    },
    { cash: 0, bank: 0 },
  )
}

// ─── 展開明細 ──────────────────────────────────────────────────────────────
const expandedIds = ref<Set<number>>(new Set())

function toggleExpand(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

// ─── 勾選與收款 ────────────────────────────────────────────────────────────
const checkedIds = ref<Set<number>>(new Set())

function toggleCheck(id: number) {
  const next = new Set(checkedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checkedIds.value = next
}

const payableStudents = computed(() =>
  visibleStudents.value.filter((s) => s.status !== 'paid'),
)
const allChecked = computed(
  () =>
    payableStudents.value.length > 0 &&
    payableStudents.value.every((s) => checkedIds.value.has(s.student_id)),
)

function toggleCheckAll() {
  checkedIds.value = allChecked.value
    ? new Set()
    : new Set(payableStudents.value.map((s) => s.student_id))
}

const checkedOutstanding = computed(() =>
  students.value
    .filter((s) => checkedIds.value.has(s.student_id))
    .reduce((a, s) => a + s.outstanding, 0),
)

interface PayRecordLite {
  id: number
  student_name: string
  classroom_name: string
  fee_item_name: string
  period: string
  amount_due: number
}

const payDialogVisible = ref(false)
const payRecords = ref<PayRecordLite[]>([])

function outstandingRecordsOf(stu: StatementStudent): PayRecordLite[] {
  return stu.items
    .filter((it) => it.status !== 'paid')
    .map((it) => ({
      id: it.id,
      student_name: stu.student_name ?? '',
      classroom_name: stu.classroom_name ?? '',
      fee_item_name: it.fee_item_name ?? '',
      period: it.period ?? '',
      amount_due: it.amount_due,
    }))
}

// 列上收現金（SPEC-019 §8.2）：一生多單開一張現金收據，dialog 自己撈該生
// 全部未繳／部分繳的單（含其他月份、現金項目），不只本月這幾張
const cashDialogVisible = ref(false)
const cashStudent = ref<{ id: number; name: string } | null>(null)

function openCashFor(stu: StatementStudent) {
  cashStudent.value = { id: stu.student_id, name: stu.student_name ?? '' }
  cashDialogVisible.value = true
}

function openBatchPay() {
  payRecords.value = students.value
    .filter((s) => checkedIds.value.has(s.student_id))
    .flatMap(outstandingRecordsOf)
  payDialogVisible.value = true
}

function onPaid() {
  checkedIds.value = new Set()
  fetchStatement()
}

// ─── 顯示輔助 ──────────────────────────────────────────────────────────────
function statusLabel(status: string): string {
  if (status === 'paid') return '已繳清'
  if (status === 'partial') return '部分繳費'
  return '未繳'
}

function statusTagType(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'danger'
}
</script>

<style scoped>
.fee-monthly-statement {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* 工具列 */
/* ── 摘要列（2026-09-02 收斂）：待收＋狀態快篩＋應收/已收＋收款確認 ──────
   改版前這四塊各佔一列（tile 群、summary-side、settlement 列、批次列），
   表格要捲到第五列才開始。 */
.stmt-strip {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md, 8px);
  background: var(--el-bg-color);
  overflow: hidden;
}

.stmt-strip__main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 10px var(--space-4);
  min-width: 180px;
  white-space: nowrap;
  background: var(--el-color-primary-light-9);
  border-right: 1px solid var(--el-border-color-lighter);
}

.stmt-strip__label {
  font-size: 12px;
  color: var(--el-color-primary);
}

.stmt-strip__value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.stmt-strip__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: var(--space-2) var(--space-3);
}

.stmt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-full, 9999px);
  background: var(--el-fill-color-blank);
  font: inherit;
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  cursor: pointer;
}

.stmt-chip b {
  font-variant-numeric: tabular-nums;
}

.stmt-chip small {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.stmt-chip:hover {
  border-color: var(--el-color-primary);
}

.stmt-chip--on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary-dark-2);
}

.stmt-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stmt-dot--unpaid {
  background: var(--el-color-danger);
}

.stmt-dot--partial {
  background: var(--el-color-warning);
}

.stmt-dot--paid {
  background: var(--el-color-success);
}

.stmt-dot--overdue {
  background: var(--el-color-danger-dark-2);
}

.stmt-strip__side {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  padding: var(--space-2) var(--space-4);
  text-align: right;
}

.stmt-strip__totals {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

/* 收款確認分解（SPEC-014 §16） */
.stmt-strip__settlement {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.stmt-settlement__tag--link {
  cursor: pointer;
}

.stmt-strip__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* ── 篩選列：月份、班級、姓名、批次動作同一列 ───────────────────────────── */
.stmt-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.stmt-filters__spacer {
  flex: 1 1 auto;
}

.stmt-filters__count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.month-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.month-label {
  min-width: 96px;
  text-align: center;
  font-size: 14px;
}

.stmt-class-select {
  width: 200px;
}

.stmt-search {
  width: 200px;
}

.stmt-selected-hint {
  margin: 0;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.prepay-cell-btn {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}

/* 表格 */
.stmt-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md, 8px);
}

.stmt-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 860px;
  font-size: 13.5px;
}

.stmt-table thead th {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-weight: 600;
  font-size: 12.5px;
  text-align: left;
  padding: 9px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  white-space: nowrap;
}

.stmt-table tbody td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  vertical-align: middle;
}

.stmt-table tfoot td {
  background: var(--el-fill-color-lighter);
  font-weight: 700;
  padding: 9px 12px;
  border-top: 1px solid var(--el-border-color-light);
  font-variant-numeric: tabular-nums;
}

.num-col,
.num-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.col-check {
  width: 36px;
}

.stmt-row--paid td {
  color: var(--el-text-color-placeholder);
}

.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: inherit;
  color: inherit;
}

.expand-caret {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  transition: transform 0.15s;
}

.expand-caret--open {
  transform: rotate(90deg);
  color: var(--el-color-primary);
}

.student-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stmt-row--paid .student-name {
  color: var(--el-text-color-secondary);
}

.bucket-amount--paid {
  color: var(--el-text-color-placeholder);
}

.bucket-amount--paid::after {
  content: ' ✓';
  color: var(--el-color-success);
  font-size: 11px;
}

.cell-empty {
  color: var(--el-text-color-placeholder);
}

.total-due {
  font-weight: 700;
}

.outstanding-pos {
  font-weight: 700;
  color: var(--color-danger-darker, #b91c1c);
}

/* 展開明細 */
.stmt-detail > td {
  background: var(--el-fill-color-lighter);
  padding: 10px 16px 12px 44px;
}

.detail-table {
  border-collapse: collapse;
  min-width: 520px;
  font-size: 12.5px;
}

.detail-table th {
  text-align: left;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-light);
  padding: 4px 14px 4px 0;
}

.detail-table td {
  border-bottom: 1px dashed var(--el-border-color-lighter);
  padding: 6px 14px 6px 0;
}

.detail-table tr:last-child td {
  border-bottom: none;
}

.detail-footer {
  margin-top: var(--space-1);
}

/* 狀態區塊 */
.stmt-state {
  padding: var(--space-6, 40px) var(--space-3);
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13.5px;
}

@media (max-width: 720px) {
  .stmt-search,
  .stmt-class-select {
    max-width: 100%;
    width: 100%;
  }

  .stmt-strip__side {
    margin-left: 0;
    align-items: flex-start;
    text-align: left;
    width: 100%;
  }

  .stmt-strip__settlement {
    justify-content: flex-start;
  }
}
</style>
