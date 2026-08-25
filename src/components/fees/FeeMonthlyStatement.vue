<template>
  <section class="fee-monthly-statement" aria-label="月繳總表">
    <!-- 工具列：月份導航 + 姓名搜尋 -->
    <div class="stmt-toolbar">
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
      <el-input
        v-model="searchName"
        class="stmt-search"
        data-test="stmt-search"
        placeholder="搜尋學生姓名"
        clearable
        aria-label="搜尋學生姓名"
      />
    </div>

    <!-- 班級 chips 直列快篩 -->
    <div class="class-chips" role="group" aria-label="班級快篩">
      <button
        v-for="chip in classChips"
        :key="chip.name || '__all__'"
        type="button"
        class="class-chip"
        data-test="stmt-class-chip"
        :data-classroom="chip.name"
        :aria-pressed="selectedClassroom === (chip.name || null)"
        @click="toggleClassroom(chip.name || null)"
      >
        {{ chip.label }}
        <span v-if="chip.gradeName" class="class-chip__grade">{{ chip.gradeName }}</span>
        <span
          class="class-chip__count"
          :class="{ 'class-chip__count--clear': chip.oweCount === 0 }"
          :aria-label="chip.oweCount === 0 ? '已收齊' : `未收齊 ${chip.oweCount} 人`"
        >
          {{ chip.oweCount === 0 ? '✓' : chip.oweCount }}
        </span>
      </button>
    </div>

    <!-- 統計 + 狀態快篩 -->
    <div class="summary-strip" data-test="stmt-summary">
      <div class="stat-tile stat-tile--main">
        <div class="stat-tile__label">本月待收金額</div>
        <div class="stat-tile__value">{{ formatCurrency(scopeOutstanding) }}</div>
      </div>
      <button
        v-for="tile in statusTiles"
        :key="tile.key"
        type="button"
        class="stat-tile stat-tile--toggle"
        :data-test="`stmt-flt-${tile.key}`"
        :aria-pressed="statusOn[tile.key]"
        @click="toggleStatus(tile.key)"
      >
        <div class="stat-tile__label">
          <span class="stat-dot" :class="`stat-dot--${tile.key}`" />
          {{ tile.label }}
        </div>
        <div class="stat-tile__value">
          {{ tile.count }}<small> 人</small>
        </div>
      </button>
      <div class="summary-side">
        本月應收 <strong class="num-cell">{{ formatCurrency(scopeDue) }}</strong>
        <br />
        已收 <strong class="num-cell">{{ formatCurrency(scopePaid) }}</strong>
      </div>
    </div>

    <!-- 批次列 -->
    <div v-if="canWrite" class="stmt-actions">
      <el-button
        type="primary"
        data-test="stmt-batch-pay"
        :disabled="checkedIds.size === 0"
        @click="openBatchPay"
      >
        批次收款{{ checkedIds.size ? `（${checkedIds.size} 人）` : '' }}
      </el-button>
      <span class="stmt-actions__hint" data-test="stmt-batch-hint">
        <template v-if="checkedIds.size">
          已選 {{ checkedIds.size }} 人，未收合計
          <strong>{{ formatCurrency(checkedOutstanding) }}</strong>
        </template>
        <template v-else>勾選學生後可一次登記多人整筆繳費</template>
      </span>
    </div>

    <!-- 載入/錯誤/內容 -->
    <el-skeleton v-if="loading && !statement" :rows="5" animated />
    <div v-else-if="loadError" class="stmt-state" data-test="stmt-error" role="alert">
      <p>載入月繳總表失敗</p>
      <el-button size="small" data-test="stmt-retry" @click="fetchStatement">重試</el-button>
    </div>
    <div v-else-if="students.length === 0" class="stmt-state" data-test="stmt-empty">
      <p>{{ monthLabel }}尚無費用單——啟用費用範本後，系統將於每日自動產生</p>
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
            <th v-for="b in visibleBuckets" :key="b.key" class="num-col">{{ b.label }}</th>
            <th class="num-col">應繳合計</th>
            <th class="num-col">未收</th>
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
              <td>
                <el-tag :type="statusTagType(stu.status)" size="small">
                  {{ statusLabel(stu.status) }}
                </el-tag>
              </td>
              <td v-if="canWrite">
                <el-button
                  v-if="stu.status !== 'paid'"
                  link
                  type="primary"
                  size="small"
                  data-test="stmt-pay"
                  @click="openPayFor(stu)"
                >
                  收款
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
            <td :colspan="2 + visibleBuckets.length">合計（目前篩選 {{ visibleStudents.length }} 人）</td>
            <td class="num-cell">{{ formatCurrency(visibleDue) }}</td>
            <td class="num-cell outstanding-pos">{{ formatCurrency(visibleOutstanding) }}</td>
            <td :colspan="canWrite ? 2 : 1" />
          </tr>
        </tfoot>
      </table>
    </div>

    <BatchPayDialog v-model="payDialogVisible" :records="payRecords" @paid="onPaid" />
  </section>
</template>

<script setup lang="ts">
/**
 * 月繳總表（帳單工作區「彙總繳費表」檢視，2026-08 改版）。
 *
 * 一次撈整月 per-student 聚合（GET /fees/monthly-statement），
 * 班級 chips／狀態快篩／姓名搜尋全部前端即時切換（園所規模單月 ≤ 數百人）。
 * 收款走 BatchPayDialog（繳清全額語意）；部分繳費／退款導向逐筆明細
 * （emit open-list 由帳單工作區切換模式）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { getFeeMonthlyStatement } from '@/api/fees'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import BatchPayDialog from '@/components/fees/BatchPayDialog.vue'

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
onMounted(fetchStatement)

defineExpose({ refresh: fetchStatement })

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

function toggleClassroom(name: string | null) {
  selectedClassroom.value = selectedClassroom.value === name ? null : name
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

const visibleStudents = computed(() =>
  scopeStudents.value.filter((s) => statusOn.value[s.status] ?? true),
)

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
  }> = [
    {
      name: '',
      label: '全部班級',
      gradeName: '',
      oweCount: students.value.filter((s) => s.status !== 'paid').length,
    },
  ]
  props.classrooms.forEach((c) => {
    const name = c.name ?? ''
    if (!name || seen.has(name)) return
    seen.add(name)
    chips.push({
      name,
      label: name,
      gradeName: c.grade_name ?? '',
      oweCount: oweBy.get(name) ?? 0,
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

const totalColumns = computed(
  () => 5 + visibleBuckets.value.length + (canWrite.value ? 2 : 0),
)

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

function openPayFor(stu: StatementStudent) {
  payRecords.value = outstandingRecordsOf(stu)
  payDialogVisible.value = true
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
.stmt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.month-nav {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.month-label {
  padding: 0 var(--space-2);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stmt-search {
  max-width: 220px;
}

/* 班級 chips */
.class-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.class-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  border-radius: var(--radius-full, 999px);
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.13s, background 0.13s, color 0.13s;
}

.class-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.class-chip[aria-pressed='true'] {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.class-chip__grade {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.class-chip__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full, 999px);
  background: var(--el-color-danger-light-9, #fef2f2);
  color: var(--color-danger-darker, #b91c1c);
  border: 1px solid var(--el-color-danger-light-7, #fecaca);
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.class-chip__count--clear {
  background: var(--el-color-success-light-9, #f0fdf4);
  color: var(--color-success-darker, #15803d);
  border-color: var(--el-color-success-light-7, #bbf7d0);
}

/* 統計 + 狀態快篩 */
.summary-strip {
  display: flex;
  align-items: stretch;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.stat-tile {
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--radius-md, 8px);
  padding: 8px 16px;
  min-width: 112px;
  background: var(--el-bg-color);
  text-align: left;
}

.stat-tile__label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-tile__value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.stat-tile__value small {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.stat-tile--main {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}

.stat-tile--main .stat-tile__label,
.stat-tile--main .stat-tile__value {
  color: var(--el-color-primary);
}

.stat-tile--toggle {
  cursor: pointer;
  transition: border-color 0.13s, opacity 0.13s, box-shadow 0.13s;
}

.stat-tile--toggle:hover {
  border-color: var(--el-color-primary);
}

.stat-tile--toggle[aria-pressed='true'] {
  border-color: var(--el-color-primary);
  box-shadow: inset 0 0 0 1px var(--el-color-primary);
}

.stat-tile--toggle[aria-pressed='false'] {
  opacity: 0.55;
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.stat-dot--unpaid {
  background: var(--el-color-danger);
}

.stat-dot--partial {
  background: var(--el-color-warning);
}

.stat-dot--paid {
  background: var(--el-color-success);
}

.summary-side {
  margin-left: auto;
  align-self: center;
  text-align: right;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

/* 批次列 */
.stmt-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.stmt-actions__hint {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
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
  .stmt-search {
    max-width: 100%;
    width: 100%;
  }

  .summary-side {
    margin-left: 0;
    text-align: left;
    width: 100%;
  }
}
</style>
