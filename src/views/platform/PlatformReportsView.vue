<template>
  <div class="platform-reports">
    <PageHeader title="跨分校報表" subtitle="逐校計算後合併；合併率一律重算，不是各校平均">
      <template #filters>
        <el-select v-model="category" data-testid="report-category" class="filter-item" @change="onCategoryChange">
          <el-option v-for="c in CATEGORIES" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <el-select v-if="needsYear" v-model="year" data-testid="report-year" class="filter-item">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
        <el-select v-if="needsMonth" v-model="month" clearable placeholder="全年" data-testid="report-month" class="filter-item">
          <el-option v-for="m in 12" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
        <el-select v-if="needsSchoolYear" v-model="schoolYear" clearable placeholder="本學年" data-testid="report-school-year" class="filter-item">
          <el-option v-for="y in schoolYearOptions" :key="y" :label="`${y} 學年`" :value="y" />
        </el-select>
        <el-select v-if="needsSemester" v-model="semester" data-testid="report-semester" class="filter-item">
          <el-option :label="'第 1 學期'" :value="1" />
          <el-option :label="'第 2 學期'" :value="2" />
        </el-select>
        <el-select
          v-model="selectedTenantIds"
          multiple
          collapse-tags
          placeholder="全部分校"
          data-testid="report-tenants"
          class="filter-item filter-item--wide"
        >
          <el-option
            v-for="t in selectableSchools"
            :key="t.id"
            :label="t.display_name || t.name"
            :value="t.id"
          />
        </el-select>
        <el-button :loading="pending" data-testid="report-refresh" @click="reload">重新整理</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="errorText"
      type="error"
      :closable="false"
      data-testid="report-error"
      :title="errorText"
      class="platform-reports__alert"
    />

    <div v-if="report" class="report-meta" data-testid="report-meta">
      <span>{{ categoryLabel(report.category) }}</span>
      <span v-if="report.generated_at">產生時間：{{ report.generated_at }}</span>
      <el-tag v-if="report.cached" size="small" type="info" data-testid="report-cached">快取結果</el-tag>
    </div>

    <div v-if="totalEntries.length" class="totals" data-testid="report-totals">
      <div v-for="[key, value] in totalEntries" :key="key" class="total-card">
        <span class="total-card__label">{{ metricLabel(key) }}</span>
        <div class="total-card__value">
          <MetricValue :metric-key="key" :value="value" />
        </div>
      </div>
    </div>

    <el-alert
      v-if="failedRows.length"
      type="warning"
      :closable="false"
      data-testid="report-partial"
      :title="`${failedRows.length} 間分校取數失敗，彙總不含這些分校`"
      class="platform-reports__alert"
    >
      <ul class="failed-list">
        <li v-for="row in failedRows" :key="row.tenant_id">{{ row.name }}：{{ row.error }}</li>
      </ul>
    </el-alert>

    <el-table :data="rows" v-loading="pending" data-testid="report-table" row-key="tenant_id">
      <el-table-column label="分校" min-width="160" fixed>
        <template #default="{ row }">
          <div>{{ row.name }}</div>
          <div class="tenant-slug">{{ row.slug }}</div>
        </template>
      </el-table-column>
      <el-table-column
        v-for="key in metricKeys"
        :key="key"
        :label="metricLabel(key)"
        min-width="130"
        align="right"
      >
        <template #default="{ row }">
          <span v-if="row.error" class="muted">—</span>
          <MetricValue v-else :data-testid="`cell-${row.tenant_id}-${key}`" :metric-key="key" :value="row.data?.[key]" />
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState title="沒有資料" description="選定條件下沒有任何分校資料，或總部功能未開通。" />
      </template>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { platformCacheKey } from '@/composables/useActingTenant'
import { getErrorMessage } from '@/utils/errorHandler'
import {
  getPlatformReport,
  type PlatformReport,
  type PlatformReportCategory,
  type PlatformReportTenantRow,
} from '@/api/platform'
import { usePlatformTenants } from './usePlatformTenants'
import { collectMetricKeys, failedTenants, metricLabel } from './reportFormat'
import MetricValue from './MetricValue.vue'

const CATEGORIES: { value: PlatformReportCategory; label: string }[] = [
  { value: 'overview', label: '總覽' },
  { value: 'finance', label: '財務彙總' },
  { value: 'attendance', label: '出勤對比' },
  { value: 'salary-cost', label: '薪資成本' },
  { value: 'recruitment', label: '招生漏斗' },
  { value: 'students', label: '學生班級' },
  { value: 'hr', label: '人事' },
  { value: 'activities', label: '活動' },
]

/**
 * 報表回應的 `category` 是後端合併層加了 `platform_` 前綴、底線命名的完整值
 * （如 `platform_salary_cost`），與 `CATEGORIES`（給查詢用，連字號命名、無前綴）
 * 字面不同。查表前先正規化，查不到（未知/未來新增類別）才 fallback 顯示原始值，
 * 而不是直接把英文丟進畫面（PLT-04）。
 */
function categoryLabel(rawCategory: string | null | undefined): string {
  if (!rawCategory) return ''
  const normalized = rawCategory.replace(/^platform_/, '').replace(/_/g, '-')
  return CATEGORIES.find((c) => c.value === normalized)?.label ?? rawCategory
}

const now = new Date()
// 民國學年（後端 school_year 為 100~200 的整數）
const currentSchoolYear = now.getFullYear() - 1911
// 8 月–1 月為上學期（第 1 學期），2 月–7 月為下學期（第 2 學期）
const currentSemester = now.getMonth() + 1 >= 8 || now.getMonth() + 1 <= 1 ? 1 : 2

const category = ref<PlatformReportCategory>('overview')
const year = ref(now.getFullYear())
const month = ref<number | null>(null)
// 非空預設值：students/activities 皆屬「選填、未帶＝當前學年」的後端契約，
// 但 activities 的 school_year 與 semester 必須同時給或同時不給——若讓 schoolYear
// 預設為空、只有 semester 有值，切到活動報表會漏送 school_year 而 400。
// 給實際的當前學年當預設，確保兩者永遠同進退。
const schoolYear = ref<number | null>(currentSchoolYear)
const semester = ref<number>(currentSemester)
const selectedTenantIds = ref<number[]>([])

const yearOptions = computed(() => {
  const base = now.getFullYear()
  return [base + 1, base, base - 1, base - 2, base - 3]
})
const schoolYearOptions = computed(() => {
  const base = currentSchoolYear
  return [base + 1, base, base - 1, base - 2]
})

const needsYear = computed(() =>
  ['overview', 'finance', 'attendance', 'salary-cost', 'hr'].includes(category.value),
)
const needsMonth = computed(() => category.value === 'overview' || category.value === 'finance')
const needsSchoolYear = computed(() =>
  ['recruitment', 'students', 'activities'].includes(category.value),
)
const needsSemester = computed(() => category.value === 'activities')

const { selectableSchools } = usePlatformTenants({ schoolsOnly: true })

const queryParams = computed(() => ({
  ...(needsYear.value ? { year: year.value } : {}),
  ...(needsMonth.value && month.value ? { month: month.value } : {}),
  ...(needsSchoolYear.value && schoolYear.value ? { school_year: schoolYear.value } : {}),
  // 只在 school_year 有值時才送 semester：後端「同時給或同時不給」的約束，
  // 避免使用者清空學年選擇後只剩 semester 單獨送出觸發 400。
  ...(needsSemester.value && schoolYear.value ? { semester: semester.value } : {}),
  ...(selectedTenantIds.value.length ? { tenant_ids: [...selectedTenantIds.value].sort((a, b) => a - b) } : {}),
}))

// key 含全部查詢維度 + acting tenant（`platformCacheKey`），切分校/切條件都不會讀到上一份。
const cacheKey = computed(() =>
  platformCacheKey(`reports:${category.value}:${JSON.stringify(queryParams.value)}`),
)

const { data, error, pending, refresh } = useCachedAsync<PlatformReport | null>(
  cacheKey,
  async () => {
    const res = await getPlatformReport(category.value, queryParams.value)
    return res.data ?? null
  },
  { ttl: 5 * 60_000 },
)

const report = computed(() => data.value)
const rows = computed<PlatformReportTenantRow[]>(() => report.value?.tenants ?? [])
const metricKeys = computed(() => collectMetricKeys(rows.value))
const totalEntries = computed(() => Object.entries(report.value?.totals ?? {}))
const failedRows = computed(() => failedTenants(rows.value))
const errorText = computed(() => (error.value ? getErrorMessage(error.value, '報表載入失敗') : null))

function reload(): void {
  refresh(true).catch(() => {})
}

function onCategoryChange(): void {
  // 切報表類別時清掉不適用的期間條件，避免帶著上一個類別的月份去打不吃 month 的端點。
  if (!needsMonth.value) month.value = null
  if (!needsSchoolYear.value) schoolYear.value = null
}

// `useCachedAsync` 只在 mount 時自動抓一次（key 變更不會自動 refetch），因此條件變更
// 一律由本 watcher 觸發。`refresh(false)` 讓 TTL 內的相同條件直接命中快取、不重打。
watch(cacheKey, () => {
  // 先清畫面上的舊報表：條件已經換了，舊數字留在表格上比空白更危險
  //（使用者會以為那是新條件的結果）。命中快取時 refresh 會立刻把值補回來。
  data.value = null
  refresh(false).catch(() => {})
})
</script>

<style scoped>
.platform-reports__alert {
  margin: var(--space-3) 0;
}

.filter-item {
  min-width: 140px;
}

.filter-item--wide {
  min-width: 240px;
}

.report-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  margin-bottom: var(--space-3);
}

.totals {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.total-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
}

.total-card__label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.total-card__value {
  font-size: var(--text-xl);
  font-weight: 700;
}

.tenant-slug {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.muted {
  color: var(--text-tertiary);
}

.failed-list {
  margin: 0;
  padding-left: var(--space-5);
}
</style>
