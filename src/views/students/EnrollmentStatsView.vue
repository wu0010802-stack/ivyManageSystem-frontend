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
const loading = ref(false)
const stats = ref<EnrollmentStats | null>(null)
const termOptions = ref<TermOption[]>([])

/**
 * 異動帳的查詢區間，跟著頁首的學年學期走。使用者仍可在下方面板內縮小範圍，
 * 那個改動會回寫這裡，讓對帳橫幅與明細看的是同一個結束日。
 */
const dateRange = ref<[string, string]>(
  getTermDateRange(termStore.school_year, termStore.semester),
)
/** 「重新整理」的訊號，遞增即通知下方面板重抓。 */
const refreshToken = ref(0)
const reconcileResult = ref<ReconcileResult | null>(null)

const banner = computed(() =>
  reconcileResult.value ? describeReconcile(reconcileResult.value) : null,
)

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
// Summary cards
// ---------------------------------------------------------------------------
const summaryCards = computed(() => {
  const s = stats.value?.summary
  const total = s?.total ?? 0
  const male = s?.male ?? 0
  const female = s?.female ?? 0
  const cls = s?.class_count ?? 0
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—')
  const avg = cls > 0 ? Math.round(total / cls) : null
  return [
    {
      key: 'total',
      label: '在籍總人數',
      value: s ? total : '—',
      sub: cls > 0 ? `分布於 ${cls} 個班級` : '尚無班級資料',
    },
    {
      key: 'male',
      label: '男生',
      value: s ? male : '—',
      sub: s ? `占全園 ${pct(male)}` : '—',
    },
    {
      key: 'female',
      label: '女生',
      value: s ? female : '—',
      sub: s ? `占全園 ${pct(female)}` : '—',
    },
    {
      key: 'class',
      label: '班級數',
      value: s ? cls : '—',
      sub: avg != null ? `平均 ${avg} 人 / 班` : '—',
    },
  ]
})

const ratioPct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '0%')

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
      total: grade.total,
    })
  }
  rows.push({
    type: 'grand_total',
    grade_name: '全園總計',
    class_name: '',
    male: stats.value.summary.male,
    female: stats.value.summary.female,
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
      <span v-if="stats.summary?.total != null" class="meta-sep">|</span>
      <span v-if="stats.summary?.total != null">在籍 {{ stats.summary.total }} 人</span>
    </div>

    <!--
      對帳橫幅：實際名冊（現值）與帳上累加（憑證）的比對，是本頁上下兩段的接點。
      置頂，因為「這頁的數字可不可信」要先講。
    -->
    <el-alert
      v-if="banner"
      data-testid="reconcile-banner"
      :title="banner.text"
      :type="banner.level === 'ok' ? 'success' : banner.level === 'info' ? 'info' : 'warning'"
      :closable="banner.level === 'ok'"
      show-icon
      class="reconcile-banner"
    />

    <!-- 現值：此刻各班多少人 -->
    <el-row :gutter="16" class="summary-cards">
      <el-col :xs="12" :sm="6" v-for="card in summaryCards" :key="card.key">
        <el-card class="summary-card" shadow="never">
          <template v-if="loading && stats == null">
            <el-skeleton :rows="2" animated />
          </template>
          <template v-else>
            <div class="card-label">{{ card.label }}</div>
            <div class="card-value">{{ card.value }}</div>
            <div class="card-sub">{{ card.sub }}</div>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="card-header-row">
          <span class="card-header-title">各班在籍人數表</span>
          <span v-if="stats" class="card-header-meta">
            {{ coerceRocYear(stats.school_year) }} 學年度 · {{ stats.semester_label }}
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
        <el-table-column label="年級" prop="grade_name" width="120" align="center" />
        <el-table-column label="班級" prop="class_name" width="110" align="center" />
        <el-table-column label="男生" prop="male" width="90" align="center" />
        <el-table-column label="女生" prop="female" width="90" align="center" />
        <el-table-column label="合計" prop="total" width="90" align="center">
          <template #default="{ row }">
            <span class="num-total">{{ row.total }}</span>
          </template>
        </el-table-column>
        <el-table-column label="男女比例" min-width="180">
          <template #default="{ row }">
            <div v-if="row.total > 0" class="ratio-bar">
              <div class="ratio-track">
                <div class="ratio-male" :style="{ width: ratioPct(row.male, row.total) }" />
                <div class="ratio-female" :style="{ width: ratioPct(row.female, row.total) }" />
              </div>
              <div class="ratio-text">
                {{ ratioPct(row.male, row.total) }} / {{ ratioPct(row.female, row.total) }}
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
    </el-card>

    <!-- 帳：人數怎麼變成上面那樣（趨勢圖 + 逐筆明細） -->
    <section class="ledger-section">
      <h3 class="section-title">人數異動</h3>
      <p class="section-hint">
        逐筆自動記錄，不需人工登錄。預設看本學期，可在下方縮小日期範圍。
      </p>
      <EnrollmentLedgerPanel
        v-model:date-range="dateRange"
        :refresh-token="refreshToken"
      />
    </section>
  </div>
</template>

<style scoped>
.enrollment-stats-view {
  padding: var(--space-5, 20px);
}

.page-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: var(--space-5, 20px);
}

.meta-sep {
  color: #dcdfe6;
}

/* ===== Summary Cards ===== */
.summary-cards {
  margin-bottom: var(--space-4, 16px);
}

.summary-card :deep(.el-card__body) {
  padding: 16px 18px;
}

.card-label {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.card-value {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

.card-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ===== Card ===== */
.table-card {
  margin-top: var(--space-4, 16px);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-header-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ===== Stats Table ===== */
.num-total {
  font-weight: 600;
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
  background: #f56c6c;
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

:deep(.row-subtotal) td {
  background-color: #fafafa !important;
  font-weight: 600;
}

:deep(.row-grand-total) td {
  background-color: #f5f7fa !important;
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
