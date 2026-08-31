<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { getSalaryMonthlyOverview } from '@/api/salary'
import { hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { money } from '@/utils/format'
import SalaryMonthlyEmployeeDetail from './SalaryMonthlyEmployeeDetail.vue'
import {
  filterEmployeeRows,
  columnsForPreset,
  statusTagsForRow,
  type ColumnKey,
  type ColumnPreset,
  type OverviewOut,
} from './salaryMonthlyOverview'

const props = defineProps<{ year: number; month: number }>()
const emit = defineEmits<{ 'scope-change': [scope: string] }>()

const router = useRouter()
const overview = ref<OverviewOut | null>(null)
const loading = ref(false)
const errorText = ref<string | null>(null)

// 年月快速切換 race guard：epoch 比對＋AbortController，晚到的舊請求一律捨棄
let fetchEpoch = 0
let abortCtrl: AbortController | null = null

const fetchOverview = async () => {
  const epoch = ++fetchEpoch
  abortCtrl?.abort()
  const ctrl = new AbortController()
  abortCtrl = ctrl
  loading.value = true
  errorText.value = null
  try {
    const res = await getSalaryMonthlyOverview(
      { year: props.year, month: props.month },
      ctrl.signal,
    )
    if (epoch !== fetchEpoch) return
    overview.value = res.data
    emit('scope-change', res.data.scope)
  } catch (e) {
    if (epoch !== fetchEpoch) return
    // API 失敗必須顯示可重試 alert，不可偽裝成空資料
    overview.value = null
    errorText.value = friendlyError('載入薪資月總覽失敗', e)
  } finally {
    if (epoch === fetchEpoch) loading.value = false
  }
}

watch(() => [props.year, props.month], fetchOverview)
onMounted(fetchOverview)
onBeforeUnmount(() => {
  fetchEpoch += 1
  abortCtrl?.abort()
})

const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))
const isEmpty = computed(
  () => !loading.value && !errorText.value && overview.value !== null && overview.value.total === 0,
)

// ── 篩選列 ──────────────────────────────────────────────
const searchText = ref('')
const typeFilter = ref('all')
const statusFilter = ref('all')
const abnormalOnly = ref(false)

const filteredRows = computed(() =>
  filterEmployeeRows(overview.value?.employees ?? [], {
    search: searchText.value,
    type: typeFilter.value,
    status: statusFilter.value,
    abnormalOnly: abnormalOnly.value,
  }),
)

// ── 欄位 preset ────────────────────────────────────────
const columnPreset = ref<ColumnPreset>('summary')
const visibleColumns = computed(() => new Set<ColumnKey>(columnsForPreset(columnPreset.value)))
const showCol = (key: ColumnKey) => visibleColumns.value.has(key)

const summary = computed(() => overview.value?.summary ?? null)
const failedChecks = computed(() => (overview.value?.checks ?? []).filter(c => !c.ok))
const nonZeroCategories = computed(() =>
  (overview.value?.transfer_categories ?? []).filter(c => c.amount !== 0),
)

const TYPE_LABELS: Record<string, string> = {
  regular: '正職',
  hourly: '時薪／才藝老師',
}
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t

const gotoSettle = () => {
  router.push('/salary/settle')
}
</script>

<template>
  <div class="mo-panel">
    <!-- 載入中：skeleton -->
    <el-skeleton v-if="loading" :rows="8" animated data-testid="overview-skeleton" />

    <!-- 失敗：可重試 alert（不可偽裝成空資料） -->
    <el-alert
      v-else-if="errorText"
      type="error"
      :closable="false"
      :title="errorText"
      data-testid="overview-error"
    >
      <el-button size="small" data-testid="overview-retry" @click="fetchOverview">重試</el-button>
    </el-alert>

    <!-- 無資料 -->
    <el-empty v-else-if="isEmpty" description="此月份尚無薪資紀錄">
      <el-button v-if="canWriteSalary" type="primary" data-testid="goto-settle" @click="gotoSettle">
        前往薪資結算
      </el-button>
    </el-empty>

    <template v-else-if="overview && summary">
      <!-- 對帳警示：任一 reconciliation delta 非 0 -->
      <el-alert
        v-if="overview.checks_status !== 'ok'"
        type="error"
        :closable="false"
        title="薪資總覽對帳不平衡，數字可能有誤，請先向系統管理員確認再使用"
        class="mo-check-alert"
        data-testid="reconciliation-alert"
      >
        <ul class="mo-check-list">
          <li v-for="c in failedChecks" :key="c.key">
            {{ c.label }}：期望 {{ money(c.expected) }}、實際 {{ money(c.actual) }}（差額 {{ money(c.delta) }}）
          </li>
        </ul>
      </el-alert>

      <!-- 本月摘要帶 -->
      <section class="mo-band" aria-label="本月摘要">
        <div class="mo-cell">
          <span class="mo-label">計薪人數</span>
          <span class="mo-value" data-testid="summary-employee-count">{{ summary.employee_count }} 人</span>
          <span class="mo-sub">正職 {{ summary.regular_count }}・時薪／才藝 {{ summary.hourly_count }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">總應發</span>
          <span class="mo-value">{{ money(summary.total_gross_salary) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">員工代扣</span>
          <span class="mo-value">{{ money(summary.total_salary_deduction) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">主薪轉</span>
          <span class="mo-value">{{ money(summary.total_base_transfer_amount) }}</span>
          <span class="mo-sub">含未休假折現 {{ money(summary.total_unused_leave_payout) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">薪資紀錄獨立轉帳</span>
          <span class="mo-value">{{ money(summary.total_salary_separate_transfer) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">表外獎金</span>
          <span class="mo-value">{{ money(summary.total_extra_bonus_amount) }}</span>
        </div>
        <div class="mo-cell mo-cell-primary">
          <span class="mo-label">本月現金給付</span>
          <span class="mo-value" data-testid="summary-cash-payout">{{ money(summary.total_salary_cash_payout) }}</span>
        </div>
      </section>

      <!-- 雇主負擔帶 -->
      <section class="mo-band mo-band-secondary" aria-label="雇主負擔與人事成本">
        <div class="mo-cell">
          <span class="mo-label">雇主勞保</span>
          <span class="mo-value">{{ money(summary.total_labor_insurance_employer) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">雇主健保</span>
          <span class="mo-value">{{ money(summary.total_health_insurance_employer) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">雇主勞退</span>
          <span class="mo-value">{{ money(summary.total_pension_employer) }}</span>
        </div>
        <div class="mo-cell">
          <span class="mo-label">雇主負擔合計</span>
          <span class="mo-value">{{ money(summary.total_employer_burden) }}</span>
        </div>
        <div class="mo-cell mo-cell-primary">
          <span class="mo-label">完整人事成本</span>
          <span class="mo-value" data-testid="summary-employer-cost">{{ money(summary.total_employer_cost) }}</span>
          <span class="mo-sub">薪資面口徑；不含年終 E 化撥款與舊制勞退提撥</span>
        </div>
      </section>

      <!-- 發放構成（非零分類） -->
      <section v-if="nonZeroCategories.length" class="mo-composition" aria-label="發放構成">
        <span v-for="c in nonZeroCategories" :key="c.key" class="mo-comp-item">
          {{ c.label }} <strong>{{ money(c.amount) }}</strong>
        </span>
      </section>

      <!-- 狀態摘要（僅異常時提示） -->
      <el-alert
        v-if="summary.unfinalized_count || summary.needs_recalc_count"
        type="warning"
        :closable="false"
        class="mo-status-alert"
        :title="`本月有 ${summary.unfinalized_count} 筆未封存、${summary.needs_recalc_count} 筆待重算${summary.manual_adjust_count ? `、${summary.manual_adjust_count} 筆含人工調整` : ''}`"
      />

      <!-- 篩選列 -->
      <div class="mo-filters" role="search">
        <el-input
          v-model="searchText"
          placeholder="搜尋姓名／工號"
          clearable
          style="width: 200px"
          aria-label="搜尋員工姓名或工號"
        />
        <el-select v-model="typeFilter" style="width: 160px" aria-label="員工類型篩選">
          <el-option value="all" label="全部類型" />
          <el-option value="regular" label="正職" />
          <el-option value="hourly" label="時薪／才藝老師" />
        </el-select>
        <el-select v-model="statusFilter" style="width: 140px" aria-label="狀態篩選">
          <el-option value="all" label="全部狀態" />
          <el-option value="finalized" label="已封存" />
          <el-option value="unfinalized" label="未封存" />
          <el-option value="needs_recalc" label="待重算" />
          <el-option value="manual_adjust" label="人工調整" />
        </el-select>
        <el-switch v-model="abnormalOnly" active-text="只看異常" aria-label="只看異常" />
        <el-select v-model="columnPreset" style="width: 120px" aria-label="欄位組合" class="mo-preset">
          <el-option value="summary" label="欄位：摘要" />
          <el-option value="income" label="欄位：收入" />
          <el-option value="deduction" label="欄位：扣款" />
          <el-option value="cost" label="欄位：成本" />
          <el-option value="all" label="欄位：全部" />
        </el-select>
      </div>

      <div class="mo-table-wrap">
        <el-table :data="filteredRows" border stripe style="width: 100%">
          <el-table-column type="expand">
            <template #default="scope">
              <SalaryMonthlyEmployeeDetail :row="scope.row" />
            </template>
          </el-table-column>
          <el-table-column v-if="showCol('employee_code')" prop="employee_code" label="工號" width="90" />
          <el-table-column v-if="showCol('employee_name')" prop="employee_name" label="姓名" width="110" fixed="left" />
          <el-table-column v-if="showCol('job_title')" prop="job_title" label="職稱" width="110" show-overflow-tooltip />
          <el-table-column v-if="showCol('employee_type')" label="類型" width="130">
            <template #default="scope">{{ typeLabel(scope.row.employee_type) }}</template>
          </el-table-column>
          <el-table-column v-if="showCol('gross_salary')" label="應發" width="110" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.gross_salary) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('total_deduction')" label="代扣" width="100" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.total_deduction) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('net_salary')" label="淨薪" width="110" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.net_salary) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('unused_leave_payout')" label="未休假折現" width="110" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.unused_leave_payout) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('base_transfer_amount')" label="主薪轉" width="110" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.base_transfer_amount) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('salary_separate_transfer')" label="薪資獨立轉帳" width="120" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.salary_separate_transfer) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('extra_bonus_amount')" label="表外獎金" width="105" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.extra_bonus_amount) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('employer_burden')" label="雇主負擔" width="105" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.employer_burden) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('employer_cost')" label="完整人事成本" width="120" align="right">
            <template #default="scope"><span class="mo-num">{{ money(scope.row.employer_cost) }}</span></template>
          </el-table-column>
          <el-table-column v-if="showCol('salary_cash_payout')" label="現金給付合計" width="120" align="right" fixed="right">
            <template #default="scope"><strong class="mo-num">{{ money(scope.row.salary_cash_payout) }}</strong></template>
          </el-table-column>
          <el-table-column v-if="showCol('status')" label="狀態" width="150" fixed="right">
            <template #default="scope">
              <el-tag
                v-for="tag in statusTagsForRow(scope.row)"
                :key="tag.label"
                :type="tag.type"
                size="small"
                class="mo-status-tag"
              >
                {{ tag.label }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mo-panel { display: grid; gap: var(--space-4, 12px); }
.mo-check-alert { margin-bottom: 0; }
.mo-check-list { margin: 4px 0 0; padding-left: 18px; }

.mo-band {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.mo-band-secondary { background: var(--el-fill-color-lighter); }
.mo-cell {
  flex: 1 1 130px;
  min-width: 120px;
  padding: 10px 14px;
  display: grid;
  gap: 2px;
  border-right: 1px solid var(--el-border-color-lighter);
}
.mo-cell:last-child { border-right: none; }
.mo-label { font-size: 12px; color: var(--el-text-color-secondary); }
.mo-value {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.mo-sub { font-size: 11px; color: var(--el-text-color-secondary); text-align: right; }
.mo-cell-primary .mo-value { color: var(--el-color-primary); }

.mo-composition {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 0 2px;
}
.mo-comp-item strong { font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); }

.mo-status-alert { margin: 0; }

.mo-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.mo-preset { margin-left: auto; }

.mo-table-wrap { overflow-x: auto; }
.mo-num { font-variant-numeric: tabular-nums; }
.mo-status-tag + .mo-status-tag { margin-left: 4px; }
</style>
