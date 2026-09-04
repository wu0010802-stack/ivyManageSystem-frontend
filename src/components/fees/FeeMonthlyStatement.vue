<template>
  <section class="fee-monthly-statement" aria-label="月繳總表">
    <!-- 摘要列（2026-09-02 收斂）：待收金額＋狀態快篩＋應收/已收＋收款確認
         合併成一列。改版前這四塊各佔一列，表格被推到第五列才開始。 -->
    <div class="stmt-strip" data-test="stmt-summary">
      <div class="stmt-strip__main">
        <div class="stmt-strip__label">{{ scopeLabel }}待收</div>
        <div
          class="stmt-strip__value"
          :class="{ 'stmt-strip__value--clear': scopeOutstanding === 0 }"
        >
          {{ scopeOutstanding > 0 ? formatCurrency(scopeOutstanding) : '已收齊' }}
        </div>
        <!-- 收款進度：金額看得出還缺多少，但看不出「收到幾成」——月中追繳看的是後者 -->
        <div
          class="stmt-progress"
          role="img"
          :aria-label="`已收 ${paidPercent}%`"
          data-test="stmt-progress"
        >
          <i :style="{ width: `${paidPercent}%` }" />
        </div>
        <div class="stmt-strip__sub">
          已收 {{ paidPercent }}%・{{ scopeUnpaidCount }} 人未收齊
        </div>
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

    <!-- 班級導覽列（取代下拉）：年段 › 班級攤開，未收人數標在班名旁 -->
    <FeeClassRail
      :groups="classGroups"
      :total="students.length"
      :total-unpaid="totalUnpaidCount"
      :selected-class="selectedClassroom"
      :selected-grade="selectedGrade"
      @select="onRailSelect"
    />

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
    <div v-else class="stmt-table-area">
      <div class="stmt-table-wrap">
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
            <th class="col-code">銷帳碼</th>
            <th v-for="b in visibleBuckets" :key="b.key" class="num-col">{{ b.label }}</th>
            <th class="num-col">應繳合計</th>
            <th class="num-col">未收</th>
            <!-- SPEC-019 §8.1：分辨這筆錢是現金收的還是網銀進來的 -->
            <th class="num-col">現金已收</th>
            <th class="num-col">網銀已收</th>
            <th class="col-prepay">預繳</th>
            <th class="col-status">狀態</th>
            <th v-if="canWrite" class="col-action">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="grp in visibleGroups" :key="grp.name">
            <!-- 分組表頭：捲動時黏在表頭下，往下看永遠知道自己在哪一班 -->
            <tr
              class="stmt-group"
              :class="{ 'stmt-group--done': grp.allPaid }"
              data-test="stmt-class-group"
              :data-classroom="grp.name"
              :data-collapsed="isCollapsed(grp.name) ? '1' : '0'"
            >
              <td :colspan="totalColumns">
                <div class="group-bar">
                  <!-- 勾選框對齊表格的勾選欄，讀起來就是「這一班的全選」 -->
                  <span v-if="canWrite" class="group-check">
                    <input
                      v-if="grp.payableIds.length"
                      type="checkbox"
                      data-test="stmt-group-check"
                      :title="`全選 ${grp.label} 未收學生`"
                      :aria-label="`全選 ${grp.label} 未收學生`"
                      :checked="isGroupAllChecked(grp)"
                      @change="toggleGroupCheck(grp)"
                    />
                  </span>

                  <button
                    type="button"
                    class="group-toggle"
                    data-test="stmt-group-toggle"
                    :aria-expanded="!isCollapsed(grp.name)"
                    :aria-label="`${isCollapsed(grp.name) ? '展開' : '收合'} ${grp.label}`"
                    @click="toggleCollapse(grp.name)"
                  >
                    <el-icon
                      class="expand-caret"
                      :class="{ 'expand-caret--open': !isCollapsed(grp.name) }"
                    >
                      <ArrowRight />
                    </el-icon>
                  </button>

                  <span class="group-name">{{ grp.label }}</span>
                  <span v-if="grp.gradeLabel" class="group-grade">{{ grp.gradeLabel }}</span>
                  <span class="group-count">
                    {{ grp.total }} 人<template
                      v-if="!grp.allPaid && grp.rows.length !== grp.total"
                      >・篩選後 {{ grp.rows.length }} 人</template
                    >
                  </span>

                  <!-- 收款狀況集中右側：進度條、收齊幾人、未收金額相鄰一眼讀完；
                       已收齊的班不畫滿格進度條，直接標示 -->
                  <span v-if="grp.allPaid" class="group-status group-status--clear">
                    <el-icon aria-hidden="true"><Check /></el-icon>
                    <b>本班收齊</b>
                  </span>
                  <span v-else class="group-status">
                    <span class="group-progress">
                      <span class="stmt-progress" aria-hidden="true">
                        <i :style="{ width: `${grp.paidPercent}%` }" />
                      </span>
                      收齊 {{ grp.paidCount }}／{{ grp.total }}
                    </span>
                    <span class="group-owe">
                      未收 <b>{{ formatCurrency(grp.outstanding) }}</b>
                    </span>
                  </span>
                </div>
              </td>
            </tr>

            <!-- 只在明確選定該班時說明「為什麼是空的」；未選班時已收齊的班
                 自然只剩一條表頭線，不必每組都掛一行空狀態 -->
            <tr
              v-if="
                !isCollapsed(grp.name) && grp.rows.length === 0 && selectedClassroom === grp.name
              "
            >
              <td :colspan="totalColumns" class="stmt-state" data-test="stmt-no-match">
                {{ grp.label }} 在此篩選條件下沒有學生——試試切換狀態快篩
              </td>
            </tr>

            <template v-if="!isCollapsed(grp.name)">
          <template v-for="stu in grp.rows" :key="stu.student_id">
            <tr
              class="stmt-row"
              :class="{
                'stmt-row--paid': stu.status === 'paid',
                'stmt-row--checked': checkedIds.has(stu.student_id),
                'stmt-row--overdue': isOverdueStudent(stu),
              }"
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
                  <el-icon
                    class="expand-caret"
                    :class="{ 'expand-caret--open': expandedIds.has(stu.student_id) }"
                  >
                    <ArrowRight />
                  </el-icon>
                  <span class="student-name">{{ stu.student_name }}</span>
                </button>
              </td>
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
                    {{ formatAmount(bucketCell(stu, b.key)!.due) }}
                  </span>
                </template>
                <span v-else class="cell-empty">—</span>
              </td>
              <!-- 表格內金額不重複「NT$」前綴（幣別由分組表頭與合計列標示），
                   數字才對得齊、欄寬不被前綴吃掉 -->
              <td class="num-cell total-due">{{ formatAmount(stu.total_due) }}</td>
              <td class="num-cell" :class="stu.outstanding > 0 ? 'outstanding-pos' : 'cell-empty'">
                {{ stu.outstanding > 0 ? formatAmount(stu.outstanding) : '—' }}
              </td>
              <td
                class="num-cell"
                :class="{ 'cell-empty': paidSplit(stu).cash <= 0 }"
                data-test="stmt-cash-paid"
              >
                {{ paidSplit(stu).cash > 0 ? formatAmount(paidSplit(stu).cash) : '—' }}
              </td>
              <td
                class="num-cell"
                :class="{ 'cell-empty': paidSplit(stu).bank <= 0 }"
                data-test="stmt-bank-paid"
              >
                {{ paidSplit(stu).bank > 0 ? formatAmount(paidSplit(stu).bank) : '—' }}
              </td>
              <td class="col-prepay">
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
              <td class="col-status">
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
              <td v-if="canWrite" class="col-action">
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
                      <td class="num-cell">{{ formatAmount(it.amount_due) }}</td>
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
            </template>
          </template>
          <tr v-if="visibleGroups.length === 0">
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
            <!-- 現金已收／網銀已收／預繳／狀態（＋canWrite 的操作欄）不做合計 -->
            <td :colspan="canWrite ? 5 : 4" />
          </tr>
        </tfoot>
      </table>
      </div>
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
 *
 * 2026-09-04 表格可讀性：數字欄表頭改右對齊（原本 thead th 的 text-align:left
 * 特異度較高，表頭與數字對不上）、表頭＋分組表頭真正 sticky（外框放得下時改
 * overflow-x:clip，不再自己成為捲動容器）、儲存格金額去掉 NT$ 前綴、未收金額
 * 只在逾期時標紅、列 hover／勾選底色、caret 改 EP 圖示。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getFeeMonthlyStatement, getPrepayments } from '@/api/fees'
import { ElMessage } from 'element-plus'
import { ArrowRight, Check } from '@element-plus/icons-vue'
import { friendlyError } from '@/utils/errorMessages'
import { formatAmount, formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import BatchPayDialog from '@/components/fees/BatchPayDialog.vue'
import BillingCodeCell from '@/components/fees/BillingCodeCell.vue'
import FeeClassRail from '@/components/fees/FeeClassRail.vue'
import { buildClassGroups } from '@/components/fees/feeClassGrouping'
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
const selectedGrade = ref<string | null>(null)
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

/** 班級導覽列選取：班與年段兩層，選班時同時記住其年段（供年段標籤顯示脈絡） */
function onRailSelect(payload: { cls: string | null; grade: string | null }) {
  if (payload.cls === selectedClassroom.value && payload.grade === selectedGrade.value) return
  selectedClassroom.value = payload.cls
  selectedGrade.value = payload.grade
  checkedIds.value = new Set()
  // 明確點進某一班時展開它，否則自動收合會讓人以為班是空的
  if (payload.cls) {
    const next = new Set(collapsedClasses.value)
    next.delete(payload.cls)
    collapsedClasses.value = next
  }
}

const students = computed<StatementStudent[]>(() => statement.value?.students ?? [])

/**
 * 班級分組（導覽列用）：以整月資料計，未收人數不受狀態快篩與姓名搜尋影響
 * ——「哪一班還沒收齊」是這頁的固定問題，不該隨手上的篩選跳動。
 */
const classGroups = computed(() => buildClassGroups(students.value, props.classrooms))

/** 導覽列「全部」的計數；與各班 chip 同語意（未收齊人數），可直接相加驗算 */
const totalUnpaidCount = computed(
  () => students.value.filter((s) => s.status !== 'paid').length,
)

/** 班名 → 年段，供 scope 依年段過濾（年段本身不是月表欄位） */
const gradeOfClass = computed(() => {
  const map = new Map<string, string>()
  classGroups.value.forEach((g) => g.classes.forEach((c) => map.set(c.name, g.key)))
  return map
})

// scope＝班級／年段＋姓名（不含狀態），供統計 tiles 與費用欄位可見性
const scopeStudents = computed(() => {
  const kw = searchName.value.trim()
  return students.value.filter((s) => {
    const cls = s.classroom_name ?? ''
    if (selectedClassroom.value) {
      if (cls !== selectedClassroom.value) return false
    } else if (selectedGrade.value && gradeOfClass.value.get(cls) !== selectedGrade.value) {
      return false
    }
    return !kw || (s.student_name ?? '').includes(kw)
  })
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

/** 摘要列標題隨範圍走：選了班或年段就說出是哪一個，避免看錯成全園數字 */
const scopeLabel = computed(() => {
  const scope = selectedClassroom.value || selectedGrade.value || ''
  return scope ? `${monthLabel.value}・${scope}` : monthLabel.value
})

const scopeUnpaidCount = computed(
  () => scopeStudents.value.filter((s) => s.status !== 'paid').length,
)

const scopeDue = computed(() => scopeStudents.value.reduce((a, s) => a + s.total_due, 0))
const scopePaid = computed(() => scopeStudents.value.reduce((a, s) => a + s.total_paid, 0))
const scopeOutstanding = computed(() =>
  scopeStudents.value.reduce((a, s) => a + s.outstanding, 0),
)
const paidPercent = computed(() =>
  scopeDue.value > 0 ? Math.round((scopePaid.value / scopeDue.value) * 100) : 0,
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

// ─── 表格分組（依班級）──────────────────────────────────────────────────────
/**
 * 表格分組：班級順序沿用導覽列（年段序），每組只放**通過狀態快篩**的列。
 *
 * 範圍內有學生的班一律留一條分組表頭，即使篩選後沒有列——這正是「哪些班已收齊」
 * 的答案所在（預設篩選下已收齊的班本來就一列都不會通過，整組消失反而看不出它
 * 存在且收齊了）。表頭的統計以範圍內該班全體計，不受狀態快篩影響。
 */
const visibleGroups = computed(() => {
  const rowsBy = new Map<string, StatementStudent[]>()
  visibleStudents.value.forEach((s) => {
    const key = s.classroom_name ?? ''
    const list = rowsBy.get(key) ?? []
    list.push(s)
    rowsBy.set(key, list)
  })
  const scopeBy = new Map<string, StatementStudent[]>()
  scopeStudents.value.forEach((s) => {
    const key = s.classroom_name ?? ''
    const list = scopeBy.get(key) ?? []
    list.push(s)
    scopeBy.set(key, list)
  })

  return classGroups.value
    .flatMap((g) => g.classes)
    .filter((c) => scopeBy.has(c.name))
    .map((c) => {
      const rows = rowsBy.get(c.name) ?? []
      // 分組表頭的統計以「範圍內該班全體」計（不受狀態快篩影響），
      // 否則關掉「已繳清」時每班都會顯示「已收齊 0／N」
      const scoped = scopeBy.get(c.name) ?? []
      const paidCount = scoped.filter((s) => s.status === 'paid').length
      return {
        name: c.name,
        label: c.label,
        gradeLabel: c.gradeLabel,
        rows,
        total: scoped.length,
        paidCount,
        allPaid: scoped.length > 0 && paidCount === scoped.length,
        outstanding: scoped.reduce((a, s) => a + s.outstanding, 0),
        paidPercent: scoped.length ? Math.round((paidCount / scoped.length) * 100) : 0,
        payableIds: rows.filter((s) => s.status !== 'paid').map((s) => s.student_id),
      }
    })
})

// ─── 分組收合（手動）────────────────────────────────────────────────────────
/**
 * 收合是純手動的：處理某一班時把其他班折起來。
 *
 * 刻意不做「已收齊自動收合」——已收齊的班在預設篩選下本來就沒有列，天然只剩
 * 一條表頭；而使用者主動打開「已繳清」快篩時就是要看那些人，自動收合會正面
 * 擋住該意圖。
 */
const collapsedClasses = ref<Set<string>>(new Set())

function isCollapsed(name: string): boolean {
  return collapsedClasses.value.has(name)
}

function toggleCollapse(name: string) {
  const next = new Set(collapsedClasses.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsedClasses.value = next
}

// 換月份／換範圍時回到全展開（新一批資料的收款狀況不同）
watch([month, selectedClassroom, selectedGrade], () => {
  collapsedClasses.value = new Set()
})

type VisibleGroup = (typeof visibleGroups.value)[number]

function isGroupAllChecked(grp: VisibleGroup): boolean {
  return grp.payableIds.length > 0 && grp.payableIds.every((id) => checkedIds.value.has(id))
}

/** 按班全選：老師交來整班現金時不必逐列勾。只勾該班「可見且未繳清」的人 */
function toggleGroupCheck(grp: VisibleGroup) {
  const next = new Set(checkedIds.value)
  if (isGroupAllChecked(grp)) grp.payableIds.forEach((id) => next.delete(id))
  else grp.payableIds.forEach((id) => next.add(id))
  checkedIds.value = next
}

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

// 8 固定欄（學生/銷帳碼/應繳合計/未收/現金已收/網銀已收/預繳/狀態）
// ＋動態費用欄＋canWrite 時的勾選與操作兩欄。班級欄自 2026-09-03 起由分組表頭取代。
const totalColumns = computed(
  () => 8 + visibleBuckets.value.length + (canWrite.value ? 2 : 0),
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

.stmt-strip__value--clear {
  color: var(--color-success-darker);
}

.stmt-strip__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

/* 收款進度條：摘要列與各分組表頭共用同一個尺度語彙 */
.stmt-progress {
  display: block;
  width: 100%;
  height: 5px;
  margin: 4px 0 2px;
  border-radius: var(--radius-full, 9999px);
  background: var(--el-fill-color-dark);
  overflow: hidden;
}

.stmt-progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-success);
  transition: width var(--transition-base, 0.2s ease);
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

/* ── 表格 ──────────────────────────────────────────────────────────────────
   表頭與分組表頭都黏住：往下捲永遠知道欄位是什麼、自己在哪一班。
   黏住的前提是捲動容器＝AdminLayout 的 .el-main；外框一旦 overflow-x:auto 就
   自己變成捲動容器、sticky 只會黏在外框頂端（等於沒黏）。所以放得下整張表時
   改 clip（不成為捲動容器），只有窄容器才退回橫向捲動。
   container-type 只掛在這層 area：掛在 section 會把 el-dialog／el-drawer 的
   fixed 定位一起包進去。 */
.stmt-table-area {
  --stmt-head-h: 36px;

  container-type: inline-size;
}

.stmt-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md, 8px);
}

@container (min-width: 900px) {
  .stmt-table-wrap {
    overflow-x: clip;
  }
}

/* separate 而非 collapse：collapse 模式下 sticky 儲存格的框線不會跟著黏 */
.stmt-table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  min-width: 860px;
  font-size: 13.5px;
}

.stmt-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  box-sizing: border-box;
  height: var(--stmt-head-h);
  padding: 0 12px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-weight: 600;
  font-size: 12.5px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-light);
  white-space: nowrap;
}

.stmt-table tbody td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  vertical-align: middle;
}

/* 數字欄：表頭與儲存格同右對齊、等寬數字，整欄才對得齊
   （先前 thead th 的 text-align:left 特異度較高，表頭全靠左、數字靠右對不上） */
.stmt-table th.num-col,
.stmt-table td.num-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 欄寬：數字欄固定，多出來的寬度全給學生欄，數字彼此靠攏好比對 */
.col-check {
  width: 36px;
}

.col-student {
  min-width: 160px;
}

.col-code {
  width: 96px;
}

.stmt-table th.num-col {
  width: 104px;
}

.col-prepay {
  width: 104px;
  text-align: center;
}

/* 逾期列有兩顆標籤（未繳＋逾期）並排，不夠寬會折成兩行把列高撐高一倍 */
.col-status {
  width: 140px;
  white-space: nowrap;
}

.col-action {
  width: 72px;
  text-align: right;
}

/* 原生 checkbox 只換主色與尺寸，行為與測試不動 */
.stmt-table input[type='checkbox'] {
  width: 15px;
  height: 15px;
  margin: 0;
  vertical-align: middle;
  accent-color: var(--el-color-primary);
  cursor: pointer;
}

.stmt-table input[type='checkbox']:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── 班級分組表頭 ──────────────────────────────────────────────────────────
   選擇器要壓過 `.stmt-table tbody td` 的 padding（0,1,2），否則 td 上下各留
   8px 透明區——黏住時捲過的學生列會從那條縫透出來。背景掛在 td 本身，
   sticky 遮蔽才完整。 */
.stmt-table tbody tr.stmt-group > td {
  position: sticky;
  top: var(--stmt-head-h);
  z-index: 2;
  padding: 0;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-light);
}

.stmt-table tbody tr.stmt-group--done > td {
  background: var(--el-bg-color);
}

.group-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 38px;
  padding: 0 12px;
}

/* 與表格勾選欄同寬同位置，視覺上就是這一班的全選 */
.group-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  flex-shrink: 0;
}

.group-name {
  margin-left: var(--space-1);
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.stmt-group--done .group-name {
  color: var(--el-text-color-regular);
}

.group-grade {
  padding: 1px 6px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--radius-sm, 4px);
  background: var(--el-bg-color);
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.group-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.group-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.group-status--clear {
  gap: 4px;
  color: var(--color-success-darker);
}

.group-status--clear b {
  font-size: 12.5px;
  font-weight: 600;
}

.group-progress {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.group-progress .stmt-progress {
  width: 88px;
  margin: 0;
}

.group-owe b {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

@media (--to-sm) {
  .group-progress,
  .group-count {
    display: none;
  }
}

/* ── 學生列 ──────────────────────────────────────────────────────────────── */
/* 一列橫跨十幾欄，hover 底色讓「姓名 ↔ 右端收現金」讀在同一列上 */
.stmt-row:hover td {
  background: var(--el-fill-color-light);
}

.stmt-row--checked td {
  background: var(--el-color-primary-light-9);
}

.stmt-row--checked:hover td {
  background: var(--el-color-primary-light-8);
}

.stmt-row--paid td {
  color: var(--el-text-color-placeholder);
}

/* 展開／收合：同一顆圖示按鈕語彙，hover 有底、鍵盤焦點有環 */
.group-toggle,
.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.group-toggle:focus-visible,
.expand-btn:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.expand-caret {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm, 4px);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;
}

.group-toggle:hover .expand-caret,
.expand-btn:hover .expand-caret {
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
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
  font-weight: 600;
}

/* 未收金額用粗體而非紅字：月初全班都未繳，滿版紅字等於沒有訊號；
   紅色只留給逾期（真正要追的人），狀態標籤仍是唯一的狀態色彩來源 */
.outstanding-pos {
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.stmt-row--overdue .outstanding-pos {
  color: var(--color-danger-darker, #b91c1c);
}

.overdue-tag {
  margin-left: 4px;
}

.stmt-table tfoot td {
  background: var(--el-fill-color-lighter);
  font-weight: 700;
  padding: 9px 12px;
  border-top: 1px solid var(--el-border-color-light);
  font-variant-numeric: tabular-nums;
}

/* 展開明細（同樣要壓過 `.stmt-table tbody td`，否則左側 44px 縮排不生效） */
.stmt-table tbody tr.stmt-detail > td {
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
