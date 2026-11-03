<template>
  <div class="step-review">
    <section class="review-panel" aria-label="覆核名冊">
      <div class="review-toolbar">
        <div class="review-chips" role="group" aria-label="篩選名冊">
          <button
            v-for="c in chips"
            :key="c.key"
            type="button"
            class="review-chip"
            :class="[`review-chip--${c.tone}`, { 'is-active': activeFilter === c.key }]"
            :aria-pressed="activeFilter === c.key"
            @click="activeFilter = c.key"
          >
            {{ c.label }}<span class="review-chip__count">{{ c.count }}</span>
          </button>
        </div>
        <div class="review-toolbar__actions">
          <el-input
            v-model="reviewSearch"
            class="review-search"
            placeholder="搜尋姓名／編號／班級"
            aria-label="搜尋姓名、編號或班級"
            :prefix-icon="Search"
            clearable
          />
          <el-popover placement="bottom-end" :width="300" trigger="click">
            <template #reference>
              <el-button>需注意門檻</el-button>
            </template>
            <div class="threshold-form">
              <label class="threshold-form__label" for="review-heavy-pct">單項扣款 ≥ 底薪</label>
              <div class="threshold-form__row">
                <el-input-number
                  id="review-heavy-pct"
                  v-model="heavyPctInput"
                  :min="1"
                  :max="100"
                  :step="1"
                  controls-position="right"
                />
                <span>%</span>
              </div>
              <p class="threshold-form__hint">標「扣款偏高」用。只存在這台電腦。</p>
              <el-button type="primary" @click="applyThresholds">套用</el-button>
            </div>
          </el-popover>
          <el-button
            v-if="canWriteSalary"
            :disabled="selectedAdjustRows.length === 0"
            @click="batchAdjustVisible = true"
          >批次調整（{{ selectedAdjustRows.length }}）</el-button>
        </div>
      </div>

      <div v-if="zeroColumns.length > 0" class="review-collapsed">
        <span v-if="!showAllColumns">本月全為 0、已收合：{{ zeroColumnLabels }}</span>
        <span v-else>已展開本月全為 0 的 {{ zeroColumns.length }} 欄</span>
        <el-button link type="primary" @click="showAllColumns = !showAllColumns">
          {{ showAllColumns ? '收合這些欄' : `展開這 ${zeroColumns.length} 欄` }}
        </el-button>
      </div>

      <el-table
        v-if="settlement.records.value.length > 0"
        :data="visibleRecords"
        border
        row-key="id"
        :max-height="tableMaxHeight"
        style="width: 100%"
        v-loading="settlement.loading.value"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" :selectable="isRowSelectable" width="40" fixed="left" />
        <el-table-column type="expand" width="36" fixed="left">
          <template #default="{ row }">
            <div class="review-detail">
              <div
                v-for="r in reasonsFor(row)"
                :key="reasonKey(r)"
                class="review-cause"
                :class="`review-cause--${REASON_META[r.type].tone}`"
              >
                <p class="review-cause__text">{{ causeLong(r) }}</p>
                <div class="review-cause__actions">
                  <router-link
                    v-if="r.type === 'inactive'"
                    class="review-action"
                    :to="`/employees/${row.employee_id}`"
                  >到員工資料補離職日</router-link>
                  <el-button
                    v-if="r.type === 'heavy' && BREAKDOWN_FIELDS.has(r.field)"
                    size="small"
                    @click="openFieldBreakdown(row, r.field)"
                  >看{{ r.label }}逐日明細</el-button>
                  <router-link
                    v-if="r.type === 'heavy' || r.type === 'zero'"
                    class="review-action"
                    :to="attendanceLink(row)"
                  >到出勤核對處理</router-link>
                </div>
              </div>
              <p v-if="row.remark" class="review-remark">編輯紀錄：{{ row.remark }}</p>
              <SalaryBreakdown :row="row" :year="q.year" :month="q.month" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="姓名" width="112" fixed="left">
          <template #default="scope">
            <div class="name-cell">
              <span class="name-cell__name">{{ scope.row.employee_name }}</span>
              <span v-if="scope.row.job_title" class="name-cell__sub">{{ scope.row.job_title }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="需注意" min-width="190">
          <template #default="scope">
            <div class="attn-cell">
              <div class="attn-cell__tags">
                <el-tag v-if="scope.row.is_finalized" size="small" type="success">已封存</el-tag>
                <el-tag
                  v-for="r in reasonsFor(scope.row)"
                  :key="reasonKey(r)"
                  size="small"
                  :type="REASON_META[r.type].tone"
                >{{ REASON_META[r.type].label }}</el-tag>
              </div>
              <span v-if="reasonsFor(scope.row).length" class="attn-cell__cause">
                {{ causeShort(reasonsFor(scope.row)[0]) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="班級人數" align="center">
          <el-table-column label="班級" width="128">
            <template #default="scope">
              <div v-if="primaryHeadcount(scope.row)" class="class-cell">
                <span>{{ primaryHeadcount(scope.row)!.classroomName }}</span>
                <span class="class-cell__sub">{{ classSubLabel(scope.row) }}</span>
              </div>
              <span v-else class="is-muted">不帶班</span>
            </template>
          </el-table-column>
          <el-table-column label="在籍／目標" width="112" align="right" class-name="num-cell">
            <template #default="scope">
              <span v-if="primaryHeadcount(scope.row)">
                {{ primaryHeadcount(scope.row)!.enrollment }} / {{ primaryHeadcount(scope.row)!.target || '—' }}
              </span>
              <span v-else class="is-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="差距" width="72" align="right" class-name="num-cell">
            <template #default="scope">
              <span :class="gapClass(scope.row)">{{ gapText(headcountGap(primaryHeadcount(scope.row))) }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column
          v-for="g in activeGroups"
          :key="g"
          :label="GROUP_LABEL[g]"
          align="center"
        >
          <el-table-column
            v-for="col in columnSplit.visible[g]"
            :key="col.key"
            :width="colWidth(col)"
            align="right"
            :class-name="col.total ? 'num-cell is-total' : 'num-cell'"
          >
            <template #header>
              <el-tooltip v-if="col.tooltip" :content="col.tooltip" placement="top">
                <span>{{ col.label }} <el-icon :size="12"><InfoFilled /></el-icon></span>
              </el-tooltip>
              <span v-else>{{ col.label }}</span>
            </template>
            <template #default="scope">
              <button
                v-if="col.breakdown && scope.row.id"
                type="button"
                class="amount-link"
                :class="{ 'is-zero': cellValue(scope.row, col) === 0 }"
                :aria-label="`${scope.row.employee_name}的${col.label}明細：${amountText(cellValue(scope.row, col))}`"
                @click="openFieldBreakdown(scope.row, col.key)"
              >{{ amountText(cellValue(scope.row, col)) }}</button>
              <span v-else :class="{ 'is-zero': cellValue(scope.row, col) === 0 }">
                {{ amountText(cellValue(scope.row, col)) }}
              </span>
              <ManualOverrideIcon :row="scope.row" :field="col.key" />
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="實領" width="104" align="right" class-name="num-cell is-net" fixed="right">
          <template #default="scope">
            <strong :class="{ 'is-danger': computeBaseTransferAmount(scope.row) <= 0 }">
              {{ computeBaseTransferAmount(scope.row) === 0 ? '0' : amountText(computeBaseTransferAmount(scope.row)) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column v-if="showTotalTakeHome" width="112" align="right" class-name="num-cell is-net" fixed="right">
          <template #header>
            <el-tooltip content="實領 + 節慶獎金 + 超額獎金（獎金為獨立轉帳）" placement="top">
              <span>含獎金實領 <el-icon :size="12"><InfoFilled /></el-icon></span>
            </el-tooltip>
          </template>
          <template #default="scope">
            <strong>{{ amountText(computeTotalTakeHomeAmount(scope.row)) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="104" fixed="right">
          <template #default="scope">
            <el-tooltip :content="scope.row.is_finalized ? '已封存，不可調整' : ''" :disabled="!scope.row.is_finalized" placement="top">
              <span>
                <el-button
                  v-if="canWriteSalary"
                  type="primary"
                  size="small"
                  link
                  :disabled="scope.row.is_finalized"
                  @click="openAdjust(scope.row)"
                >調整</el-button>
              </span>
            </el-tooltip>
            <el-button type="primary" size="small" link @click="exportPdf(scope.row)">PDF</el-button>
          </template>
        </el-table-column>
      </el-table>

      <EmptyState
        v-else-if="settlement.currentLoadFailed.value"
        title="本月薪資載入失敗"
        description="請重新整理；不要在看不到名冊的情況下定案"
      >
        <el-button type="primary" @click="settlement.refresh()">重新整理</el-button>
      </EmptyState>
      <EmptyState
        v-else-if="!settlement.loading.value"
        title="本月尚未計算薪資"
        description="請先回到「計算」步驟執行計算"
      />
    </section>

    <div class="review-actionbar">
      <p class="review-actionbar__summary">
        <template v-if="settlement.anomalies.value.size === 0">沒有需注意的人。</template>
        <template v-else>
          需注意 <strong>{{ settlement.anomalies.value.size }}</strong> 位<template v-if="severeSummary">，其中 <strong class="is-danger">{{ severeSummary }}</strong></template>，建議先處理再定案。
        </template>
      </p>
      <div class="review-actionbar__buttons">
        <el-button @click="$emit('prev')">← 回到計算</el-button>
        <el-button type="primary" :disabled="settlement.records.value.length === 0" @click="$emit('next')">
          確認無誤，進入定案
        </el-button>
      </div>
    </div>

    <!-- 列內調整側滑 -->
    <AdjustDrawer v-model="adjustVisible" :row="adjustingRow" @saved="settlement.refresh()" />

    <!-- 批次調整 dialog -->
    <BatchAdjustDialog
      v-model="batchAdjustVisible"
      :count="selectedAdjustRows.length"
      :loading="batchApplying"
      @confirm="applyBatchAdjust"
    />

    <!-- 欄位明細 dialog（自原 SalaryView 搬移） -->
    <el-dialog v-model="showFieldBreakdownDialog" :title="fieldBreakdownTitle" width="960px">
      <div v-loading="fieldBreakdownLoading">
        <template v-if="fieldBreakdown">
          <el-descriptions :column="2" border class="breakdown-meta">
            <el-descriptions-item label="姓名">{{ fieldBreakdown.employee?.employee_name }}</el-descriptions-item>
            <el-descriptions-item label="員工編號">{{ fieldBreakdown.employee?.employee_code }}</el-descriptions-item>
            <el-descriptions-item label="職稱">{{ fieldBreakdown.employee?.job_title || '-' }}</el-descriptions-item>
            <el-descriptions-item label="月份">{{ fieldBreakdown.employee?.year }} 年 {{ fieldBreakdown.employee?.month }} 月</el-descriptions-item>
          </el-descriptions>
          <el-table :data="fieldBreakdown.rows" border max-height="480" stripe class="field-breakdown-table">
            <el-table-column
              v-for="column in fieldBreakdown.columns"
              :key="column.key"
              :prop="column.key"
              :label="column.label"
              min-width="120"
            >
              <template #default="scope">
                {{ renderFieldBreakdownValue(scope.row, column) }}
              </template>
            </el-table-column>
          </el-table>
          <el-alert v-if="fieldBreakdown.note" :title="fieldBreakdown.note" type="info" :closable="false" class="breakdown-alert" />
        </template>
      </div>
      <template #footer>
        <div class="breakdown-footer" v-if="fieldBreakdown">
          明細合計：<strong>{{ money(fieldBreakdown.summary?.amount || 0) }}</strong>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, h, defineComponent, type PropType } from 'vue'
import { ElMessage, ElTooltip, ElIcon } from 'element-plus'
import { InfoFilled, Edit, Search } from '@element-plus/icons-vue'
import { useWindowSize } from '@vueuse/core'
import { getSalaryFieldBreakdown, manualAdjustSalary } from '@/api/salary'
import SalaryBreakdown from '../SalaryBreakdown.vue'
import AdjustDrawer from './AdjustDrawer.vue'
import BatchAdjustDialog from './BatchAdjustDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { hasPermission } from '@/utils/auth'
import { money, pad2 } from '@/utils/format'
import { formatAmount } from '@/utils/currency'
import {
    computeBaseTransferAmount,
    computeTotalTakeHomeAmount,
} from '@/utils/salaryAmounts'
import { downloadFile } from '@/utils/download'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { useClientTableFilter } from '@/composables/useClientTableFilter'
import {
    getThresholds,
    setThresholds,
    type SalarySettlement,
    type SettlementRecord,
    type AnomalyReason,
    type AnomalyType,
} from '@/composables/useSalarySettlement'
import {
    MONEY_COLUMNS,
    GROUP_LABEL,
    cellValue,
    isOverridden,
    OVERRIDE_FIELD_LABELS,
    splitColumns,
    hasSeparateBonus,
    type ColGroup,
} from './reviewColumns'
import {
    headcountsOf,
    primaryHeadcount,
    headcountGap,
    gapText,
    ROLE_LABEL,
} from './reviewHeadcount'

defineEmits<{ (e: 'next'): void; (e: 'prev'): void }>()

const settlement = inject<SalarySettlement>('settlement')!
const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const { notify } = useErrorNotify()
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))

// ---- 人工調整標記（共用小元件） ----
const ManualOverrideIcon = defineComponent({
    props: {
        row: { type: Object as PropType<SettlementRecord>, required: true },
        field: { type: String, required: true },
    },
    setup(props) {
        return () => {
            if (!props.row || !isOverridden(props.row, props.field)) return null
            return h(
                ElTooltip,
                { content: '此欄位已人工調整，重算時將保留此值', placement: 'top' },
                { default: () => h(ElIcon, { class: 'manual-override-icon', size: 11 }, { default: () => h(Edit) }) },
            )
        }
    },
})

// ---- 金額顯示：表內不帶 NT$（表頭已標「元」），0 一律「—」 ----
const amountText = (v: number): string => (v === 0 ? '—' : formatAmount(v))

const BREAKDOWN_FIELDS = new Set(MONEY_COLUMNS.filter((c) => c.breakdown).map((c) => c.key))

// ---- 需注意 ----
const REASON_META: Record<AnomalyType, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
    inactive: { label: '已停用仍在名冊', tone: 'danger' },
    zero: { label: '實領 ≤ 0', tone: 'danger' },
    heavy: { label: '扣款偏高', tone: 'warning' },
    manual: { label: '手動調整', tone: 'info' },
}
const reasonsFor = (row: SettlementRecord): AnomalyReason[] =>
    settlement.anomalies.value.get(row.employee_id) ?? []
const reasonKey = (r: AnomalyReason): string => (r.type === 'heavy' ? `heavy-${r.field}` : r.type)
const pctText = (p: number) => `${Math.round(p * 100)}%`
const fieldsText = (fields: string[]) => fields.map((f) => OVERRIDE_FIELD_LABELS[f] ?? f).join('、')

const causeShort = (r: AnomalyReason): string => {
    switch (r.type) {
        case 'inactive':
            return r.resignDate ? `離職日 ${r.resignDate}` : '已停用，但離職日空白'
        case 'zero':
            return `本月實領 ${formatAmount(r.amount)} 元`
        case 'heavy':
            return `${r.label} ${formatAmount(r.amount)}（本月底薪 ${pctText(r.pct)}）`
        case 'manual':
            return fieldsText(r.fields)
    }
}
const causeLong = (r: AnomalyReason): string => {
    switch (r.type) {
        case 'inactive':
            return r.resignDate
                ? `離職日是 ${r.resignDate}，早於本月，卻仍在本月名冊。請確認是否該發本月薪資。`
                : '員工資料是「停用」，但離職日空白，系統仍照常算了本月薪資。請確認本月是否仍在職，並補上離職日。'
        case 'zero':
            return `本月實領 ${money(r.amount)}。常見原因：整月留停、沒有出勤紀錄、底薪或時薪設定錯誤，或保費追溯補收大於應發。請確認後再定案。`
        case 'heavy':
            return `${r.label} ${money(r.amount)}，占本月底薪 ${pctText(r.pct)}。如果是漏打卡或假單還沒核准，先到出勤核對處理，再回來重算。`
        case 'manual':
            return `已手動調整：${fieldsText(r.fields)}。重算時會保留這些值。`
    }
}
const attendanceLink = (row: SettlementRecord) => ({
    path: '/attendance',
    query: { date: `${q.year}-${pad2(q.month)}-01`, emp: String(row.employee_id) },
})

// ---- 篩選 chip ----
type FilterKey = 'all' | 'attention' | 'below' | AnomalyType
type ChipTone = 'neutral' | 'danger' | 'warning' | 'info'
const activeFilter = ref<FilterKey>('all')

const typeCount = (t: AnomalyType): number => {
    let n = 0
    for (const reasons of settlement.anomalies.value.values()) if (reasons.some((r) => r.type === t)) n++
    return n
}
const isBelowTarget = (row: SettlementRecord): boolean => {
    const gap = headcountGap(primaryHeadcount(row))
    return gap !== null && gap < 0
}
const chips = computed(() => {
    const list: { key: FilterKey; label: string; count: number; tone: ChipTone }[] = [
        { key: 'all', label: '全部', count: settlement.records.value.length, tone: 'neutral' },
        { key: 'attention', label: '需注意', count: settlement.anomalies.value.size, tone: 'neutral' },
    ]
    for (const t of ['inactive', 'zero', 'heavy', 'manual'] as AnomalyType[]) {
        const count = typeCount(t)
        if (count > 0) list.push({ key: t, label: REASON_META[t].label, count, tone: REASON_META[t].tone })
    }
    const below = settlement.records.value.filter(isBelowTarget).length
    if (below > 0) list.push({ key: 'below', label: '所帶班級未達目標', count: below, tone: 'neutral' })
    return list
})

const filteredRecords = computed(() => {
    const sorted = settlement.sortedRecords.value
    const f = activeFilter.value
    if (f === 'all') return sorted
    if (f === 'attention') return sorted.filter((r) => settlement.anomalies.value.has(r.employee_id))
    if (f === 'below') return sorted.filter(isBelowTarget)
    return sorted.filter((r) => reasonsFor(r).some((x) => x.type === f))
})
const { searchQuery: reviewSearch, filtered: visibleRecords } = useClientTableFilter<SettlementRecord>({
    source: () => filteredRecords.value,
    searchFields: (r) => [
        r.employee_name,
        String(r.employee_id),
        String(r.employee_code ?? ''),
        ...headcountsOf(r).map((h) => h.classroomName),
    ],
})

const severeSummary = computed(() => {
    const parts: string[] = []
    const inactive = typeCount('inactive')
    const zero = typeCount('zero')
    if (inactive) parts.push(`${inactive} 位已停用仍在名冊`)
    if (zero) parts.push(`${zero} 位實領 ≤ 0`)
    return parts.join('、')
})

// ---- 欄位：本月全為 0 的收合 ----
const showAllColumns = ref(false)
const columnSplit = computed(() => splitColumns(settlement.records.value, showAllColumns.value))
const zeroColumns = computed(() => splitColumns(settlement.records.value, false).hidden)
const zeroColumnLabels = computed(() => zeroColumns.value.map((c) => c.label).join('、'))
const activeGroups = computed(() =>
    (['add', 'ded', 'separate'] as ColGroup[]).filter((g) => columnSplit.value.visible[g].length > 0),
)
const showTotalTakeHome = computed(() => hasSeparateBonus(settlement.records.value))

// ---- 班級人數 ----
const classSubLabel = (row: SettlementRecord): string => {
    const list = headcountsOf(row)
    const first = list[0]
    if (!first) return ''
    const parts = [first.gradeName, first.role === 'head_teacher' ? '' : ROLE_LABEL[first.role]].filter(Boolean)
    const label = parts.join(' · ')
    return list.length > 1 ? `${label} +${list.length - 1} 班` : label
}
const gapClass = (row: SettlementRecord): string => {
    const gap = headcountGap(primaryHeadcount(row))
    if (gap === null) return 'is-muted'
    if (gap < 0) return 'gap-below'
    if (gap > 0) return 'gap-above'
    return ''
}

// 欄寬：依欄名字數給足空間，表頭不被截成「園務會…」；合計欄固定 100
const colWidth = (col: { label: string; total?: boolean }): number =>
    col.total ? 100 : Math.max(84, col.label.length * 16 + 36)

// ---- 表格高度：表頭固定、外層不再雙捲 ----
const { height: windowHeight } = useWindowSize()
const tableMaxHeight = computed(() => Math.max(360, windowHeight.value - 340))

// ---- 需注意門檻（per 裝置，localStorage） ----
const heavyPctInput = ref(Math.round(getThresholds().heavyPct * 100))
const applyThresholds = () => {
    // 清空 / NaN / <=0 一律擋下：否則會存成 0%，所有扣款被標「偏高」
    const pct = Number(heavyPctInput.value)
    if (heavyPctInput.value == null || !Number.isFinite(pct) || pct <= 0) {
        ElMessage.warning('請輸入大於 0 的百分比')
        return
    }
    const t = { heavyPct: pct / 100 }
    setThresholds(t)
    settlement.thresholds.value = t
    ElMessage.success('需注意門檻已更新（只在這台電腦生效）')
}

// ---- 列內調整 ----
const adjustVisible = ref(false)
const adjustingRow = ref<SettlementRecord | null>(null)
const openAdjust = (row: SettlementRecord) => {
    adjustingRow.value = row
    adjustVisible.value = true
}

// ---- 批次調整 ----
const batchAdjustVisible = ref(false)
const batchApplying = ref(false)
const selectedAdjustRows = ref<SettlementRecord[]>([])
const isRowSelectable = (row: SettlementRecord) => !row.is_finalized
const onSelectionChange = (rows: SettlementRecord[]) => {
    selectedAdjustRows.value = rows
}
const applyBatchAdjust = async ({ field, value, reason }: { field: string; value: number; reason: string }) => {
    const rows = selectedAdjustRows.value
    if (rows.length === 0 || batchApplying.value) return
    batchApplying.value = true
    try {
        const payload = { [field]: value, adjustment_reason: reason } as Parameters<typeof manualAdjustSalary>[1]
        const results = await Promise.allSettled(
            rows.map((r) => manualAdjustSalary(r.id, payload, r.version ?? undefined)),
        )
        const failed = results
            .map((res, i) => ({ res, row: rows[i] }))
            .filter((x) => x.res.status === 'rejected')
            .map((x) => {
                const e = (x.res as PromiseRejectedResult).reason as { response?: { data?: { detail?: string } } }
                return { name: x.row.employee_name, reason: e?.response?.data?.detail || '失敗' }
            })
        const succeeded = rows.length - failed.length
        if (failed.length === 0) {
            ElMessage.success(`已套用 ${succeeded} 筆`)
        } else {
            ElMessage.warning(
                `完成：成功 ${succeeded} 筆，失敗 ${failed.length} 筆（${failed.map((f) => `${f.name}: ${f.reason}`).join('；')}）`,
            )
        }
        batchAdjustVisible.value = false
        selectedAdjustRows.value = []
        settlement.refresh()
    } finally {
        batchApplying.value = false
    }
}

// ---- 單人 PDF ----
const exportPdf = (row: SettlementRecord) => {
    if (!row.id) {
        ElMessage.warning('請先計算薪資後再匯出')
        return
    }
    downloadFile(`/salaries/${row.id}/export?format=pdf`, `薪資單_${row.employee_name}.pdf`)
}

// ---- 欄位明細 dialog（自原 SalaryView 搬移） ----
interface FieldBreakdown {
    employee?: { employee_name?: string; employee_code?: string; job_title?: string; year?: number; month?: number }
    title?: string
    rows?: Record<string, unknown>[]
    columns?: { key: string; label?: string; [key: string]: unknown }[]
    note?: string
    summary?: Record<string, unknown>
}
const showFieldBreakdownDialog = ref(false)
const fieldBreakdownLoading = ref(false)
const fieldBreakdown = ref<FieldBreakdown | null>(null)
const MONEY_KEYS = new Set(['bonusBase', 'result', 'perPerson', 'pay', 'deduction', 'dailySalary', 'ruleAmount', 'penalty', 'accrual'])

// 請求序號守衛：舊回應不得蓋新回應，loading 只在最新請求結束時關閉
let fieldBreakdownSeq = 0
const openFieldBreakdown = async (row: SettlementRecord, field: string) => {
    if (!row.id) {
        ElMessage.warning('請先計算薪資後再查看明細')
        return
    }
    const seq = ++fieldBreakdownSeq
    fieldBreakdownLoading.value = true
    try {
        const response = await getSalaryFieldBreakdown(row.id, field)
        if (seq !== fieldBreakdownSeq) return
        fieldBreakdown.value = response.data as FieldBreakdown
        showFieldBreakdownDialog.value = true
    } catch (error) {
        if (seq !== fieldBreakdownSeq) return
        notify(error, 'StepReview.fieldBreakdown', null, { prefix: '載入欄位明細失敗' })
    } finally {
        if (seq === fieldBreakdownSeq) fieldBreakdownLoading.value = false
    }
}
const fieldBreakdownTitle = computed(() => {
    const employee = fieldBreakdown.value?.employee
    if (!employee || !fieldBreakdown.value?.title) return '薪資明細'
    return `${fieldBreakdown.value.title}｜${employee.employee_name}｜${employee.year} 年 ${employee.month} 月`
})
const renderFieldBreakdownValue = (row: Record<string, unknown>, column: { key: string }) => {
    const value = row?.[column.key]
    if (value === null || value === undefined || value === '') return '-'
    if (MONEY_KEYS.has(column.key)) return money(value)
    if (column.key === 'value' && typeof value === 'number') return money(value)
    return value
}
</script>

<style scoped>
.step-review {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.review-panel {
  background: var(--surface-color);
  border: var(--card-border);
  border-radius: var(--card-radius);
  overflow: hidden;
}

.review-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.review-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.review-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.review-chip__count {
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.review-chip--danger {
  border-color: var(--color-danger-soft);
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
}

.review-chip--warning {
  border-color: var(--color-warning-soft);
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}

.review-chip--info {
  border-color: var(--color-info-soft);
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}

.review-chip.is-active {
  border-color: var(--brand-primary-strong, var(--el-color-primary));
  background: var(--brand-primary-strong, var(--el-color-primary));
  color: var(--el-color-white);
}

.review-chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.review-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.review-search {
  width: 200px;
}

.review-collapsed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: var(--text-xs);
}

.threshold-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.threshold-form__label {
  font-size: var(--text-sm);
  color: var(--el-text-color-regular);
}

.threshold-form__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.threshold-form__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

.name-cell,
.class-cell,
.attn-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.name-cell__name {
  font-weight: var(--font-weight-semibold);
}

.name-cell__sub,
.class-cell__sub {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

.attn-cell__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.attn-cell__cause {
  font-size: var(--text-xs);
  color: var(--el-text-color-regular);
}

.amount-link {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.amount-link:hover,
.amount-link:focus-visible {
  color: var(--brand-primary-strong, var(--el-color-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
}

.is-zero,
.is-muted {
  color: var(--el-text-color-secondary);
}

.is-danger {
  color: var(--color-danger-darker);
}

.gap-below {
  color: var(--color-warning-darker);
  font-weight: var(--font-weight-semibold);
}

.gap-above {
  color: var(--color-success-darker);
  font-weight: var(--font-weight-semibold);
}

:deep(.el-table__body .cell) {
  white-space: nowrap;
}

:deep(.el-table td.is-total),
:deep(.el-table td.is-net) {
  font-weight: var(--font-weight-semibold);
}

:deep(.el-table td.is-net) {
  background-color: var(--brand-primary-soft, var(--el-color-primary-light-9));
}

.review-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 1080px;
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-8);
}

.review-cause {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  white-space: normal;
}

.review-cause--danger {
  background: var(--color-danger-soft);
}

.review-cause--warning {
  background: var(--color-warning-soft);
}

.review-cause--info {
  background: var(--color-info-soft);
}

.review-cause__text {
  flex: 1 1 420px;
  margin: 0;
  color: var(--el-text-color-primary);
}

.review-cause__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.review-action {
  color: var(--brand-primary-strong, var(--el-color-primary));
  font-size: var(--text-sm);
}

.review-remark {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
}

.review-actionbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-color);
  border: var(--card-border);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
}

.review-actionbar__summary {
  margin: 0;
  color: var(--el-text-color-regular);
}

.review-actionbar__buttons {
  display: flex;
  gap: var(--space-2);
}

.breakdown-meta,
.breakdown-alert,
.field-breakdown-table {
  margin-bottom: var(--space-4);
}

.breakdown-footer {
  font-size: var(--text-lg);
  text-align: right;
}

:deep(.manual-override-icon) {
  margin-left: var(--space-1);
  color: var(--color-warning-darker);
  vertical-align: middle;
}
</style>
