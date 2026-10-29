<template>
  <div>
    <PageHeader
      title="轉帳名冊"
      subtitle="月薪、表外獎金、年終與考核獎金的銀行轉帳名冊集中下載；各流程內原有的下載按鈕照舊保留"
    >
      <template v-if="canExportFullSalary" #actions>
        <YearMonthPicker v-model:year="query.year" v-model:month="query.month" />
      </template>
    </PageHeader>

    <el-card v-if="canExportFullSalary" shadow="never" class="no-hover roster-card" data-test="section-monthly">
      <h4 class="roster-title">月薪轉帳名冊（xlsx，僅含已封存紀錄）</h4>
      <p class="roster-hint">依上方選的年月下載。月結流程「匯出轉帳名冊」步驟的同一份名冊。</p>
      <div class="roster-buttons">
        <el-button
          v-for="(label, type) in MONTHLY_ROSTER_LABELS"
          :key="type"
          type="primary"
          plain
          :loading="busyKey === `monthly:${type}`"
          :disabled="busyKey !== null && busyKey !== `monthly:${type}`"
          :data-test="`monthly-${type}`"
          @click="downloadMonthly(type)"
        >
          {{ label }}名冊
        </el-button>
      </div>
      <p class="roster-hint">
        勾選「不入轉帳名冊」或沒有銀行帳號的人不會出現在銀行名冊，會列在各名冊的「未列入名冊」工作表；現金發放請匯出領現名冊。
      </p>
    </el-card>

    <el-card v-if="canExportFullSalary" shadow="never" class="no-hover roster-card" data-test="section-extra">
      <h4 class="roster-title">表外獎金轉帳名冊（xlsx，歸屬所選月份）</h4>
      <p class="roster-hint">
        涵蓋自主成長契約獎勵金、舊生註冊／預繳獎金、下學期超額與才藝獎勵金等表外獎金；同員工同月多筆合併一列。
        招生獎金不在此名冊，請至招生獎金頁。
      </p>
      <div class="roster-buttons">
        <el-select
          v-model="extraCategory"
          class="roster-select"
          aria-label="表外獎金類別"
          data-test="extra-category"
        >
          <el-option label="全部類別" value="" />
          <el-option v-for="c in extraCategories" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <el-button
          type="primary"
          plain
          :loading="busyKey === 'extra'"
          :disabled="busyKey !== null && busyKey !== 'extra'"
          data-test="extra-download"
          @click="downloadExtra"
        >
          表外獎金名冊
        </el-button>
      </div>
      <p v-if="extraCategoriesFailed" class="roster-hint roster-hint--error" data-test="extra-categories-error">
        類別清單載入失敗，目前只能下載「全部類別」。
        <el-button link type="primary" @click="loadExtraCategories">重試</el-button>
      </p>
    </el-card>

    <el-card v-if="canYearEnd" shadow="never" class="no-hover roster-card" data-test="section-year-end">
      <h4 class="roster-title">年終獎金轉帳名冊</h4>
      <p class="roster-hint">名冊涵蓋整個年終週期（含考核獎金與其他年終項目）。</p>
      <div v-if="yearEndLoadFailed" class="roster-hint roster-hint--error" data-test="year-end-error">
        年終週期載入失敗。
        <el-button link type="primary" @click="loadYearEndCycles">重試</el-button>
      </div>
      <div v-else-if="!yearEndLoading && yearEndCycles.length === 0" class="roster-hint" data-test="year-end-empty">
        尚無年終週期。
      </div>
      <div v-else class="roster-buttons">
        <el-select
          v-model="yearEndCycleId"
          class="roster-select"
          aria-label="年終週期"
          :loading="yearEndLoading"
          data-test="year-end-cycle"
        >
          <el-option v-for="o in yearEndOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-button
          type="primary"
          plain
          :loading="busyKey === 'year-end:xlsx'"
          :disabled="yearEndCycleId === null || (busyKey !== null && busyKey !== 'year-end:xlsx')"
          data-test="year-end-xlsx"
          @click="downloadYearEnd('xlsx')"
        >
          年終名冊 Excel
        </el-button>
        <el-button
          type="primary"
          plain
          :loading="busyKey === 'year-end:pdf'"
          :disabled="yearEndCycleId === null || (busyKey !== null && busyKey !== 'year-end:pdf')"
          data-test="year-end-pdf"
          @click="downloadYearEnd('pdf')"
        >
          年終名冊 PDF
        </el-button>
      </div>
    </el-card>

    <el-card v-if="canAppraisal" shadow="never" class="no-hover roster-card" data-test="section-appraisal">
      <h4 class="roster-title">考核獎金轉帳名冊（xlsx）</h4>
      <p class="roster-hint">只含已核定且獎金大於 0 的員工。</p>
      <div v-if="appraisalLoadFailed" class="roster-hint roster-hint--error" data-test="appraisal-error">
        考核週期載入失敗。
        <el-button link type="primary" @click="loadAppraisalCycles">重試</el-button>
      </div>
      <div v-else-if="!appraisalLoading && appraisalCycles.length === 0" class="roster-hint" data-test="appraisal-empty">
        尚無考核週期。
      </div>
      <div v-else class="roster-buttons">
        <el-select
          v-model="appraisalCycleId"
          class="roster-select"
          aria-label="考核週期"
          :loading="appraisalLoading"
          data-test="appraisal-cycle"
        >
          <el-option v-for="o in appraisalOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-button
          type="primary"
          plain
          :loading="busyKey === 'appraisal'"
          :disabled="appraisalCycleId === null || (busyKey !== null && busyKey !== 'appraisal')"
          data-test="appraisal-download"
          @click="downloadAppraisal"
        >
          考核獎金名冊
        </el-button>
      </div>
    </el-card>

    <el-card v-if="canExportFullSalary" shadow="never" class="no-hover roster-card" data-test="section-recruitment">
      <h4 class="roster-title">招生獎金轉帳名冊</h4>
      <p class="roster-hint">
        招生獎金的名冊以招生活動為單位，在招生獎金頁的活動內查看，這裡不提供下載。
      </p>
      <el-button type="primary" plain data-test="recruitment-link" @click="router.push('/salary/recruitment-bonus')">
        前往招生獎金
      </el-button>
    </el-card>

    <el-empty v-if="!anySection" description="目前帳號沒有可下載的轉帳名冊" />
  </div>
</template>

<script setup lang="ts">
// 轉帳名冊集中頁（後台 IA 重整 W1，2026-10-29）：把散在月結匯出、年終、考核、招生獎金流程裡的
// 名冊下載收到同一處，只負責「選期別→呼叫既有下載函式」，不碰任何金額計算；
// 原入口（StepExport、年終三頁、AppraisalPayoutView、考核 CycleDetailPanel）照舊保留。
//
// 各區塊 gate 對齊後端端點：
//   月薪／表外獎金 = SALARY_READ 且全員薪資視野（同 StepExport 的 canExportFullSalary）
//   年終 = YEAR_END_READ 且全員薪資視野（後端 enforce_full_salary_view）
//   考核 = APPRAISAL_ACCOUNTING（後端會計階）
// 路由 /salary/rosters 由 manifest 的 /salary prefix（SALARY_READ）涵蓋，不新增權限規則。
// 成長契約／回流獎金沒有獨立名冊端點，它們的發放都寫進表外獎金，由「表外獎金名冊」依類別下載。
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import YearMonthPicker from '@/components/common/YearMonthPicker.vue'
import { listExtraBonusCategories } from '@/api/extraBonuses'
import { listYearEndCycles } from '@/api/yearEnd'
import { listAppraisalCycles } from '@/api/appraisal'
import type { Schema } from '@/api/_generated/typed'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { CYCLE_STATUS_LABEL } from '@/constants/appraisalYearEnd'
import { friendlyError } from '@/utils/errorMessages'
import {
  downloadTransferRoster,
  EXTRA_BONUS_TRANSFER_ROSTER_PATH,
  yearEndTransferRosterPath,
  yearEndTransferRosterPdfPath,
  appraisalTransferRosterPath,
} from '@/utils/transferRoster'

type YearEndCycle = Schema<'YearEndCycleOut'>
type AppraisalCycle = Schema<'CycleOut'>
type ExtraBonusCategory = Schema<'ExtraBonusCategoryOut'>

const router = useRouter()
const now = new Date()
const query = reactive({ year: now.getFullYear(), month: now.getMonth() + 1 })

const canExportFullSalary = computed(
  () => hasPermission(PERMISSION_NAMES.SALARY_READ) && hasFullSalaryView(),
)
const canYearEnd = computed(
  () => hasPermission(PERMISSION_NAMES.YEAR_END_READ) && hasFullSalaryView(),
)
const canAppraisal = computed(() => hasPermission(PERMISSION_NAMES.APPRAISAL_ACCOUNTING))
const anySection = computed(
  () => canExportFullSalary.value || canYearEnd.value || canAppraisal.value,
)

// 一次只允許一個下載進行（避免連點重複匯出；匯出本身慢且會寫稽核）
const busyKey = ref<string | null>(null)
async function runDownload(key: string, task: () => Promise<boolean>): Promise<void> {
  if (busyKey.value !== null) return
  busyKey.value = key
  try {
    await task()
  } finally {
    busyKey.value = null
  }
}

const monthStr = () => String(query.month).padStart(2, '0')

// ---- 月薪（5 種）：與 StepExport 的 ROSTER_TYPE_LABELS 同一組 type ----
const MONTHLY_ROSTER_LABELS = {
  base: '薪資本薪',
  festival: '節慶獎金',
  surplus: '超額獎金',
  art_teacher: '才藝老師',
  cash: '領現',
} as const
type MonthlyRosterType = keyof typeof MONTHLY_ROSTER_LABELS

function downloadMonthly(type: MonthlyRosterType): Promise<void> {
  if (!canExportFullSalary.value) return Promise.resolve()
  // 領現名冊不是銀行轉帳檔，檔名不可叫「轉帳名冊」
  const suffix = type === 'cash' ? '名冊' : '轉帳名冊'
  return runDownload(`monthly:${type}`, () =>
    downloadTransferRoster(
      `/salaries/${query.year}/${query.month}/transfer-roster`,
      `${query.year}年${monthStr()}月_${MONTHLY_ROSTER_LABELS[type]}${suffix}.xlsx`,
      { type },
    ),
  )
}

// ---- 表外獎金（含成長契約、舊生註冊／預繳等）----
const extraCategory = ref('')
const extraCategories = ref<ExtraBonusCategory[]>([])
const extraCategoriesFailed = ref(false)
// 招生獎金有自己的名冊，後端對 category=recruitment 回 400，下拉直接排除
const EXTRA_EXCLUDED_CATEGORIES = new Set(['recruitment'])

async function loadExtraCategories(): Promise<void> {
  if (!canExportFullSalary.value) return
  extraCategoriesFailed.value = false
  try {
    const res = await listExtraBonusCategories()
    extraCategories.value = (res.data ?? []).filter((c) => !EXTRA_EXCLUDED_CATEGORIES.has(c.value))
  } catch (e) {
    extraCategoriesFailed.value = true
    ElMessage.error(friendlyError('載入表外獎金類別失敗', e))
  }
}

function downloadExtra(): Promise<void> {
  if (!canExportFullSalary.value) return Promise.resolve()
  const category = extraCategory.value
  const label = extraCategories.value.find((c) => c.value === category)?.label
  const params: Record<string, unknown> = { period: `${query.year}-${monthStr()}` }
  if (category) params.category = category
  return runDownload('extra', () =>
    downloadTransferRoster(
      EXTRA_BONUS_TRANSFER_ROSTER_PATH,
      `${query.year}年${monthStr()}月_${label ?? '表外獎金'}轉帳名冊.xlsx`,
      params,
    ),
  )
}

// ---- 年終 ----
const yearEndCycles = ref<YearEndCycle[]>([])
const yearEndCycleId = ref<number | null>(null)
const yearEndLoading = ref(false)
const yearEndLoadFailed = ref(false)
const yearEndOptions = computed(() =>
  [...yearEndCycles.value]
    .sort((a, b) => b.academic_year - a.academic_year || b.id - a.id)
    .map((c) => ({
      value: c.id,
      label: `${c.academic_year} 學年（${CYCLE_STATUS_LABEL[c.status] ?? c.status}）`,
    })),
)

async function loadYearEndCycles(): Promise<void> {
  if (!canYearEnd.value) return
  yearEndLoading.value = true
  yearEndLoadFailed.value = false
  try {
    const res = await listYearEndCycles()
    yearEndCycles.value = res.data ?? []
    if (!yearEndOptions.value.some((o) => o.value === yearEndCycleId.value)) {
      yearEndCycleId.value = yearEndOptions.value[0]?.value ?? null
    }
  } catch (e) {
    yearEndLoadFailed.value = true
    ElMessage.error(friendlyError('載入年終週期失敗', e))
  } finally {
    yearEndLoading.value = false
  }
}

function downloadYearEnd(format: 'xlsx' | 'pdf'): Promise<void> {
  const cycleId = yearEndCycleId.value
  if (!canYearEnd.value || cycleId === null) return Promise.resolve()
  return runDownload(`year-end:${format}`, () =>
    format === 'xlsx'
      ? downloadTransferRoster(yearEndTransferRosterPath(cycleId), '年終轉帳名冊.xlsx')
      : downloadTransferRoster(yearEndTransferRosterPdfPath(cycleId), '年終轉帳名冊.pdf'),
  )
}

// ---- 考核獎金 ----
const appraisalCycles = ref<AppraisalCycle[]>([])
const appraisalCycleId = ref<number | null>(null)
const appraisalLoading = ref(false)
const appraisalLoadFailed = ref(false)
const appraisalOptions = computed(() =>
  [...appraisalCycles.value]
    .sort(
      (a, b) =>
        b.academic_year - a.academic_year ||
        Number(b.semester === 'SECOND') - Number(a.semester === 'SECOND') ||
        b.id - a.id,
    )
    .map((c) => ({
      value: c.id,
      label: `${c.academic_year} 學年${c.semester === 'FIRST' ? '上' : '下'}學期（${CYCLE_STATUS_LABEL[c.status] ?? c.status}）`,
    })),
)

async function loadAppraisalCycles(): Promise<void> {
  if (!canAppraisal.value) return
  appraisalLoading.value = true
  appraisalLoadFailed.value = false
  try {
    const res = await listAppraisalCycles()
    appraisalCycles.value = res.data ?? []
    if (!appraisalOptions.value.some((o) => o.value === appraisalCycleId.value)) {
      appraisalCycleId.value = appraisalOptions.value[0]?.value ?? null
    }
  } catch (e) {
    appraisalLoadFailed.value = true
    ElMessage.error(friendlyError('載入考核週期失敗', e))
  } finally {
    appraisalLoading.value = false
  }
}

function downloadAppraisal(): Promise<void> {
  const cycleId = appraisalCycleId.value
  if (!canAppraisal.value || cycleId === null) return Promise.resolve()
  return runDownload('appraisal', () =>
    downloadTransferRoster(appraisalTransferRosterPath(cycleId), '考核獎金轉帳名冊.xlsx'),
  )
}

onMounted(() => {
  void loadExtraCategories()
  void loadYearEndCycles()
  void loadAppraisalCycles()
})
</script>

<style scoped>
.roster-card {
  margin-bottom: var(--space-4);
}

.roster-title {
  margin: 0 0 var(--space-2);
}

.roster-hint {
  margin: var(--space-2) 0 var(--space-3);
  color: var(--el-text-color-secondary);
  font-size: var(--text-sm);
}

.roster-hint--error {
  color: var(--el-color-danger);
}

.roster-buttons {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  align-items: center;
}

.roster-select {
  width: 240px;
  max-width: 100%;
}
</style>
