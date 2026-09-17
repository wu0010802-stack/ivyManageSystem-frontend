<script setup lang="ts">
/**
 * 在籍統計：現值（此刻各班多少人）與異動帳（人數怎麼變成這樣）同一頁。
 *
 * 2026-09-07 整合前是兩個頁籤，代價是同一個總人數報兩次、頁首的學年學期只作用於
 * 其中一個頁籤、而唯一有時間軸的趨勢圖反而藏在第二頁。整合後：
 * - **學年學期是全頁唯一主控制項**，切換時同時換掉現值與帳的查詢區間。
 * - **對帳橫幅置頂**，是現值與帳兩者的接點（帳上累加 vs 實際名冊）。
 * - **一份數字只畫一次**：各班男女與年級占比在表格裡逐格都有，原本的堆疊長條圖
 *   與甜甜圈圖是同一份資料的第三次呈現，已移除；只留帳推導出的趨勢圖。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import {
  getEnrollmentStats,
  getEnrollmentOptions,
  getLedgerReconcile,
} from '@/api/studentEnrollment'
import { coerceRocYear, getTermDateRange } from '@/utils/academic'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useIsMobile } from '@/composables/useIsMobile'
import { apiError } from '@/utils/error'
import { describeReconcile, type ReconcileResult } from '@/utils/enrollmentLedger'
import PageHeader from '@/components/common/PageHeader.vue'
import EnrollmentLedgerPanel from './EnrollmentLedgerPanel.vue'

interface TermOption { school_year: number; semester: number; label: string }
interface GradeClassStat { class_name: string; male: number; female: number; total: number }
interface GradeStat { grade_name: string; male: number; female: number; total: number; classes: GradeClassStat[] }
interface EnrollmentSummary { total: number; male: number; female: number; class_count: number }
interface EnrollmentStats {
  school_year: number; semester: number; semester_label: string
  summary: EnrollmentSummary; by_grade: GradeStat[]
}

const termStore = useAcademicTermStore()
const { isMobile } = useIsMobile()
const loading = ref(false)
const stats = ref<EnrollmentStats | null>(null)
const termOptions = ref<TermOption[]>([])
/** 下方異動帳面板的元件實例，供對帳橫幅按鈕呼叫其 setSourceFilter。 */
const ledgerPanelRef = ref<InstanceType<typeof EnrollmentLedgerPanel> | null>(null)
/** 「人數異動」整段的容器，對帳按鈕點擊後捲到這裡讓人看見篩選結果。 */
const ledgerSectionRef = ref<HTMLElement | null>(null)

/**
 * 異動帳的查詢區間，跟著頁首的學年學期走。使用者仍可在下方面板內縮小範圍，
 * 那個改動會回寫這裡，讓對帳橫幅與明細看的是同一個結束日。
 */
const dateRange = ref<[string, string]>(
  getTermDateRange(termStore.school_year, termStore.semester),
)
/** 每次學期切換都重算，供面板「回到本學期」按鈕還原用。 */
const defaultDateRange = computed<[string, string]>(() =>
  getTermDateRange(termStore.school_year, termStore.semester),
)
/** 「重新整理」的訊號，遞增即通知下方面板重抓。 */
const refreshToken = ref(0)
const reconcileResult = ref<ReconcileResult | null>(null)

const banner = computed(() =>
  reconcileResult.value ? describeReconcile(reconcileResult.value) : null,
)
/** 相符（ok）只在狀態列露出小 pill；不符／尚未起帳才升成整條警示（見下方 template）。 */
const showBannerAlert = computed(() => !!banner.value && banner.value.level !== 'ok')

/**
 * 對帳橫幅「查看未經系統的 N 筆」按鈕（2026-09-17）：舊版文案承諾「點此查看」
 * 卻沒綁任何 click，是死文字。這裡把來源篩選切到 db_trigger 並捲到明細，
 * 讓「有異常」與「異常在哪」中間有一步真的路可以走。
 */
const viewUnknownRows = () => {
  ledgerPanelRef.value?.setSourceFilter('db_trigger')
  ledgerSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const selectedTerm = computed({
  get: () => `${termStore.school_year}-${termStore.semester}`,
  set: (val: string) => {
    const [sy, sem] = val.split('-').map(Number)
    termStore.setTerm(sy, sem)
  },
})

const termParams = () => ({
  school_year: termStore.school_year,
  semester: termStore.semester,
})

const fetchOptions = async () => {
  try {
    const res = await getEnrollmentOptions()
    termOptions.value = res.data as TermOption[]
  } catch (e) {
    ElMessage.error(apiError(e, '載入學年選項失敗'))
  }
}

const fetchStats = async () => {
  loading.value = true
  try {
    const res = await getEnrollmentStats(termParams())
    stats.value = res.data as EnrollmentStats
  } catch (e) {
    ElMessage.error(apiError(e, '載入在籍統計失敗'))
  } finally {
    loading.value = false
  }
}

/** 對帳：帳上累加 vs 實際名冊。以區間結束日為準，與下方明細同一個日子。 */
const fetchReconcile = async () => {
  try {
    const res = await getLedgerReconcile({ date: dateRange.value[1] })
    reconcileResult.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入在籍對帳失敗'))
  }
}

watch(selectedTerm, () => {
  stats.value = null
  // 學年學期是全頁唯一主控制項：現值與帳的區間一起換，不讓兩邊各講各的學期。
  dateRange.value = getTermDateRange(termStore.school_year, termStore.semester)
  fetchStats()
  // 對帳交給下面的 dateRange watch，避免換學期時重複打同一支端點。
})

// 區間結束日換了（換學期，或使用者在面板內縮小範圍）就重新對帳，
// 否則橫幅講的日子會與下方明細對不起來。
watch(() => dateRange.value[1], fetchReconcile)

/** 頁首「重新整理」：現值、對帳、帳三邊一起刷，不是只刷一半。 */
const refreshAll = () => {
  fetchStats()
  fetchReconcile()
  refreshToken.value += 1
}

onMounted(async () => {
  // 效能（2026-08-21）：fetchStats 讀 termStore.school_year/semester、不依賴
  // fetchOptions 回傳的 termOptions，零交集，改平行發送。
  await Promise.all([fetchOptions(), fetchStats(), fetchReconcile()])
})

// ---------------------------------------------------------------------------
// 狀態列（2026-09-17 取代原本四張同型 KPI 卡）
// ---------------------------------------------------------------------------
/**
 * 性別「未填」（2026-09-17）：total − male − female 舊版被當不存在，staging
 * 197 人有 196 人未填卻顯示「男生 1 占全園 1%」、比例條幾乎全空又沒有任何提示。
 * `Math.max(0, …)` 是防呆——後端理論上不會給出 male+female > total，但顯示層
 * 不該因為一筆髒資料就冒出負數。
 */
const unknownGenderOf = (total: number, male: number, female: number) =>
  Math.max(0, total - male - female)

const statusSummary = computed(() => {
  const s = stats.value?.summary
  const total = s?.total ?? 0
  const male = s?.male ?? 0
  const female = s?.female ?? 0
  const unknown = s ? unknownGenderOf(total, male, female) : 0
  const filled = male + female
  const cls = s?.class_count ?? 0
  const pct = (n: number) => (filled > 0 ? `${Math.round((n / filled) * 100)}%` : '—')
  const avg = cls > 0 ? Math.round(total / cls) : null
  return {
    total,
    hasData: !!s,
    male,
    female,
    unknown,
    filled,
    malePct: pct(male),
    femalePct: pct(female),
    classCount: cls,
    classAvgLabel: avg != null ? `平均 ${avg} 人 / 班` : '—',
  }
})

/** 百分比分母改成「已填性別者」而非總人數——未填不該被靜默算進男／女的占比。 */
const ratioPct = (n: number, denom: number) => (denom > 0 ? `${Math.round((n / denom) * 100)}%` : '0%')

// ---------------------------------------------------------------------------
// 表格資料（展開 + 年級小計 + 全園總計）
// ---------------------------------------------------------------------------
const tableData = computed(() => {
  if (!stats.value?.by_grade) return []
  const rows = []
  for (const grade of stats.value.by_grade) {
    for (const cls of grade.classes) {
      rows.push({
        type: 'class',
        grade_name: grade.grade_name,
        class_name: cls.class_name,
        male: cls.male,
        female: cls.female,
        unknown: unknownGenderOf(cls.total, cls.male, cls.female),
        total: cls.total,
        _gradeClassCount: grade.classes.length,
      })
    }
    rows.push({
      type: 'subtotal',
      grade_name: `${grade.grade_name}小計`,
      class_name: '',
      male: grade.male,
      female: grade.female,
      unknown: unknownGenderOf(grade.total, grade.male, grade.female),
      total: grade.total,
    })
  }
  rows.push({
    type: 'grand_total',
    grade_name: '全園總計',
    class_name: '',
    male: stats.value.summary.male,
    female: stats.value.summary.female,
    unknown: unknownGenderOf(
      stats.value.summary.total,
      stats.value.summary.male,
      stats.value.summary.female,
    ),
    total: stats.value.summary.total,
  })
  return rows
})

const spanMethod = ({ row, rowIndex, columnIndex }: { row: Record<string, unknown>; rowIndex: number; columnIndex: number }) => {
  if (row.type === 'subtotal' || row.type === 'grand_total') {
    if (columnIndex === 0) return { rowspan: 1, colspan: 2 }
    if (columnIndex === 1) return { rowspan: 0, colspan: 0 }
    return undefined
  }
  if (columnIndex !== 0) return undefined
  if (row.type === 'class') {
    const gradeRows = tableData.value.filter(
      (r) => r.type === 'class' && r.grade_name === row.grade_name
    )
    const firstIdx = tableData.value.indexOf(gradeRows[0])
    if (rowIndex === firstIdx) {
      return { rowspan: row._gradeClassCount as number, colspan: 1 }
    } else {
      return { rowspan: 0, colspan: 0 }
    }
  }
  return undefined
}

const rowClassName = ({ row }: { row: Record<string, unknown> }) => {
  if (row.type === 'subtotal') return 'row-subtotal'
  if (row.type === 'grand_total') return 'row-grand-total'
  return ''
}

</script>

<template>
  <div class="enrollment-stats-view">
    <PageHeader title="在籍統計">
      <template #actions>
        <el-select
          v-model="selectedTerm"
          placeholder="選擇學年學期"
          style="width: 200px"
        >
          <el-option
            v-for="opt in termOptions"
            :key="`${opt.school_year}-${opt.semester}`"
            :label="opt.label"
            :value="`${opt.school_year}-${opt.semester}`"
          />
        </el-select>
        <el-button
          data-testid="refresh-btn"
          :icon="RefreshRight"
          :loading="loading"
          @click="refreshAll"
        >
          重新整理
        </el-button>
      </template>
    </PageHeader>

    <div v-if="stats" class="page-meta">
      <span>{{ coerceRocYear(stats.school_year) }} 學年度 · {{ stats.semester_label }}</span>
    </div>

    <!--
      對帳橫幅：實際名冊（現值）與帳上累加（憑證）的比對，是本頁上下兩段的接點。
      2026-09-17 起相符（ok）只在下方狀態列露出小 pill，不再常駐一整條置頂警示；
      不符／尚未起帳仍是全寬警示，因為那才是「這頁的數字可不可信」要先講的時刻。
    -->
    <el-alert
      v-if="showBannerAlert"
      data-testid="reconcile-banner"
      :title="banner!.text"
      :type="banner!.level === 'info' ? 'info' : 'warning'"
      :closable="false"
      show-icon
      class="reconcile-banner"
    >
      <template v-if="banner!.action" #default>
        <el-button
          data-testid="reconcile-action-btn"
          size="small"
          type="warning"
          plain
          @click="viewUnknownRows"
        >
          {{ banner!.action.label }}
        </el-button>
      </template>
    </el-alert>

    <!-- 現值：此刻各班多少人，2026-09-17 起收成一條狀態列（原四張同型 KPI 卡）。 -->
    <el-card class="status-strip" shadow="never">
      <el-skeleton v-if="loading && stats == null" :rows="1" animated />
      <div v-else class="status-strip-row">
        <div class="status-group status-group--hero">
          <div class="status-label">在籍總人數</div>
          <div class="status-value">{{ statusSummary.hasData ? statusSummary.total : '—' }}</div>
        </div>
        <div class="status-group">
          <div class="status-label">
            性別
            <span v-if="statusSummary.hasData" class="status-label-meta">
              （已填 {{ statusSummary.filled }} 人）
            </span>
          </div>
          <div class="status-row-inline">
            <span class="gender-dot gender-dot--male" />男 {{ statusSummary.male }}
            <span class="gender-dot gender-dot--female" />女 {{ statusSummary.female }}
            <span v-if="statusSummary.unknown > 0" class="gender-dot gender-dot--unknown" />
            <span v-if="statusSummary.unknown > 0">未填 {{ statusSummary.unknown }}</span>
          </div>
        </div>
        <div class="status-group">
          <div class="status-label">班級</div>
          <div class="status-row-inline">
            <span>{{ statusSummary.classCount }} 班</span>
            <span class="status-sep">·</span>
            <span>{{ statusSummary.classAvgLabel }}</span>
          </div>
        </div>
        <div class="status-group">
          <div class="status-label">帳目狀態</div>
          <div v-if="banner" class="status-row-inline">
            <span
              data-testid="reconcile-pill"
              class="status-pill"
              :class="`status-pill--${banner.level}`"
            >
              <span class="status-pill-dot" />
              {{ banner.level === 'ok' ? '帳目相符' : banner.level === 'info' ? '尚未起帳' : '對帳不符' }}
            </span>
            <span class="status-sep">·</span>
            <span class="status-meta">截至 {{ dateRange[1] }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="card-header-row">
          <span class="card-header-title">各班在籍人數表</span>
          <span class="card-header-legend">
            <span class="gender-dot gender-dot--male" />男
            <span class="gender-dot gender-dot--female" />女
            <span class="gender-dot gender-dot--unknown" />未填
          </span>
        </div>
      </template>
      <el-skeleton v-if="loading && !tableData.length" :rows="6" animated />
      <el-table
        v-else-if="tableData.length"
        :data="tableData"
        border
        stripe
        style="width: 100%"
        :span-method="spanMethod"
        :row-class-name="rowClassName"
        class="enrollment-table"
      >
        <el-table-column label="年級" prop="grade_name" :width="isMobile ? 60 : 120" align="center" />
        <el-table-column label="班級" prop="class_name" :width="isMobile ? 80 : 110" align="center" />
        <el-table-column label="男生" prop="male" :width="isMobile ? 54 : 80" align="right" />
        <el-table-column label="女生" prop="female" :width="isMobile ? 54 : 80" align="right" />
        <el-table-column label="未填" prop="unknown" :width="isMobile ? 54 : 80" align="right">
          <template #default="{ row }">
            <span v-if="row.unknown > 0" class="num-unknown">{{ row.unknown }}</span>
            <span v-else class="ratio-empty">0</span>
          </template>
        </el-table-column>
        <el-table-column label="合計" prop="total" :width="isMobile ? 66 : 90" align="right">
          <template #default="{ row }">
            <span class="num-total">{{ row.total }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!isMobile" label="男女比例" min-width="180">
          <template #default="{ row }">
            <span v-if="row.total > 0 && row.male + row.female === 0" class="ratio-empty">
              性別未填
            </span>
            <div v-else-if="row.total > 0" class="ratio-bar">
              <div class="ratio-track">
                <div class="ratio-male" :style="{ width: ratioPct(row.male, row.male + row.female) }" />
                <div class="ratio-female" :style="{ width: ratioPct(row.female, row.male + row.female) }" />
              </div>
              <div class="ratio-text">
                {{ ratioPct(row.male, row.male + row.female) }} / {{ ratioPct(row.female, row.male + row.female) }}
              </div>
            </div>
            <span v-else class="ratio-empty">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-else-if="!loading"
        description="此學期尚無在籍資料"
        :image-size="80"
      />
      <p v-if="tableData.length" class="table-footnote">
        百分比以已填性別者為分母，未填不計入男／女占比。
      </p>
    </el-card>

    <!-- 帳：人數怎麼變成上面那樣（趨勢圖 + 逐筆明細） -->
    <section ref="ledgerSectionRef" class="ledger-section">
      <h3 class="section-title">人數異動</h3>
      <p class="section-hint">
        逐筆自動記錄，不需人工登錄。第一筆入學、離園或轉班發生時自動起算，
        上線之前的歷史不回填。預設看本學期，可在下方縮小日期範圍。
      </p>
      <EnrollmentLedgerPanel
        ref="ledgerPanelRef"
        v-model:date-range="dateRange"
        :refresh-token="refreshToken"
        :default-range="defaultDateRange"
      />
    </section>
  </div>
</template>

<style scoped>
.enrollment-stats-view {
  padding: var(--space-5, 20px);
  /* 女生比例色（plum）：刻意不沿用全站 danger 紅——下方明細表的「退學/減少」
     也用 danger 紅，兩者同色會讓「女生」與「人數變少」混淆。 */
  --enroll-female: #b5427a;
  --enroll-female-soft: #f6e6ee;
}

.page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: var(--space-4, 16px);
}

/* ===== 狀態列（2026-09-17 取代原四張同型 KPI 卡） ===== */
.status-strip {
  margin-bottom: var(--space-4, 16px);
}

.status-strip :deep(.el-card__body) {
  padding: 14px 18px;
}

.status-strip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px 32px;
}

.status-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.status-group--hero {
  min-width: 90px;
}

.status-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.status-label-meta {
  color: var(--text-tertiary);
}

.status-value {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.status-row-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  flex-wrap: wrap;
}

.status-sep {
  color: var(--text-tertiary);
}

.status-meta {
  color: var(--text-tertiary);
  font-size: 13px;
}

.gender-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 2px;
}

.gender-dot--male {
  background: var(--color-info);
}

.gender-dot--female {
  background: var(--enroll-female);
}

.gender-dot--unknown {
  background: var(--neutral-300);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 13px;
}

.status-pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-pill--ok {
  background: var(--color-success-lighter, #f0f9eb);
  color: var(--color-success, #67c23a);
}
.status-pill--ok .status-pill-dot { background: var(--color-success, #67c23a); }

.status-pill--info {
  background: var(--neutral-100);
  color: var(--text-secondary);
}
.status-pill--info .status-pill-dot { background: var(--neutral-300); }

.status-pill--warning {
  background: var(--color-warning-lighter, #fdf6ec);
  color: var(--color-warning, #e6a23c);
}
.status-pill--warning .status-pill-dot { background: var(--color-warning, #e6a23c); }

/* ===== Card ===== */
.table-card {
  margin-top: var(--space-4, 16px);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-header-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.card-header-legend .gender-dot {
  margin-left: 10px;
}
.card-header-legend .gender-dot:first-child {
  margin-left: 0;
}

/* ===== Stats Table ===== */
.num-total {
  font-weight: 600;
}

/* 手機收欄（2026-09-17）：拿掉男女比例欄（原本佔表格 53% 寬）後，剩餘 6 欄
   配合 template 內 isMobile 縮窄的欄寬（見下）大多數情況已不必橫向捲動；
   縮小 cell padding 換出一點空間給數字，不強行擠到會讓文字折行的地步——
   折行比小幅橫向捲動更傷可讀性。卡片 padding 一起收窄，避免兩側留白吃掉
   本就緊繃的表格寬度。 */
@media (--to-sm) {
  .enrollment-table :deep(.el-table__cell) {
    padding: 8px 2px;
  }
  /* el-table 的儲存格內還有一層 .cell，左右各吃掉 12px padding——只縮外層
     td 沒用，數字欄照樣被這層內距擠到折行（實測 39px 的 td 只剩 15px 可用）。 */
  .enrollment-table :deep(.el-table .cell) {
    padding: 0 4px;
  }
  .table-card :deep(.el-card__body) {
    padding: 12px;
  }
}

.num-unknown {
  color: var(--text-secondary);
}

.ratio-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.ratio-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  background: var(--neutral-100);
}

/* 雙段比例條（男/女相鄰兩段）無法以單一 scaleX 表達，width transition 會觸發
   layout 動畫故直接移除動效；資料換頁時比例條瞬間切換即可。 */
.ratio-male {
  background: var(--color-info);
}

.ratio-female {
  background: var(--enroll-female);
}

.ratio-text {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  min-width: 80px;
  text-align: right;
}

.ratio-empty {
  color: var(--neutral-300);
}

.table-footnote {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

:deep(.row-subtotal) td {
  background-color: var(--neutral-50) !important;
  font-weight: 600;
}

:deep(.row-grand-total) td {
  background-color: var(--neutral-100) !important;
  font-weight: 700;
  color: var(--text-primary);
}

/* ===== 人數異動（下半段） ===== */
.ledger-section {
  margin-top: var(--space-6, 24px);
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-hint {
  margin: 4px 0 var(--space-4, 16px);
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 對帳橫幅與其下的卡片之間留一格，避免警示色貼著摘要卡。 */
.reconcile-banner {
  margin-bottom: var(--space-4, 16px);
}
</style>
