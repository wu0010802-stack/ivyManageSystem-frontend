<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { listAppraisalCycles, getGradeDistribution } from '@/api/appraisal'
import { GRADE_LABEL, GRADE_TAG, ROLE_GROUP_LABEL } from '@/constants/appraisalYearEnd'
import { formatCurrency } from '@/utils/currency'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

// UX 批次 D：等第校準（唯讀）。坊間 calibration 常配強制分布/排名曲線；本園 ~30 人
// 規模刻意只做「柔性警示」：分布對比、比例變動提示、大幅變動與低等第名單、
// 分數×獎金交叉，不擋任何簽核動作。資料來源 GET /appraisal/cycles/{id}/grade_distribution
// （後端只出事實，閾值在前端、標「暫依慣例待業主」）。
type Distribution = Awaited<ReturnType<typeof getGradeDistribution>>['data']
type CalibrationRow = Distribution['rows'][number]

interface CycleLite {
  id: number
  academic_year: number
  semester: string
  status: string
}

// 柔性警示閾值（暫依慣例・待業主確認）：
// - 等第比例與上期差 > 15 個百分點才提示
// - 分數變動 |Δ| ≥ 10 分列入需注意名單
const RATIO_DIFF_WARN = 0.15
const SCORE_DELTA_WARN = 10

const cycles = ref<CycleLite[]>([])
const selectedCycleId = ref<number | null>(null)
const data = ref<Distribution | null>(null)
const loading = ref(false)
const loadError = ref(false)

function cycleLabel(c: { academic_year: number; semester: string }): string {
  return `${c.academic_year}${c.semester === 'FIRST' ? '上' : '下'}`
}

// 週期新→舊排序（學年 desc，同學年下學期較新）
function sortCyclesDesc(list: CycleLite[]): CycleLite[] {
  return [...list].sort((a, b) =>
    a.academic_year !== b.academic_year
      ? b.academic_year - a.academic_year
      : (b.semester === 'SECOND' ? 1 : 0) - (a.semester === 'SECOND' ? 1 : 0)
  )
}

async function loadDistribution() {
  if (selectedCycleId.value == null) return
  loading.value = true
  loadError.value = false
  try {
    const res = await getGradeDistribution(selectedCycleId.value)
    data.value = res.data
  } catch {
    // 批次 A① 原則：失敗必須可見可重試，不靜默
    loadError.value = true
    data.value = null
  } finally {
    loading.value = false
  }
}

async function reload() {
  await loadDistribution()
}

async function init() {
  try {
    const res = await listAppraisalCycles()
    cycles.value = sortCyclesDesc(res.data as CycleLite[])
    selectedCycleId.value = cycles.value[0]?.id ?? null
  } catch {
    loadError.value = true
    return
  }
  await loadDistribution()
}

onMounted(init)
watch(selectedCycleId, (v, old) => {
  if (v != null && old != null && v !== old) loadDistribution()
})

// ── 分布對比（本期 vs 上期，含 0 計數桶，順序固定優等→丁等）──────────────
interface BucketPair {
  grade: string
  label: string
  curCount: number
  curRatio: number
  prevCount: number | null
  prevRatio: number | null
}

const bucketPairs = computed<BucketPair[]>(() => {
  const d = data.value
  if (!d) return []
  const prevBy = new Map(
    (d.previous?.buckets ?? []).map((b) => [b.grade, b])
  )
  return d.current.buckets.map((b) => {
    const prev = prevBy.get(b.grade)
    return {
      grade: b.grade,
      label: GRADE_LABEL[b.grade] ?? b.grade,
      curCount: b.count,
      curRatio: Number(b.ratio),
      prevCount: prev ? prev.count : null,
      prevRatio: prev ? Number(prev.ratio) : null,
    }
  })
})

// 柔性警示：任一等第比例與上期差逾閾值（兩期皆 0 者不提示）
const ratioWarnings = computed<string[]>(() => {
  const d = data.value
  if (!d || !d.previous) return []
  const out: string[] = []
  for (const pair of bucketPairs.value) {
    const prev = pair.prevRatio ?? 0
    const diff = pair.curRatio - prev
    if (Math.abs(diff) > RATIO_DIFF_WARN && (pair.curCount > 0 || prev > 0)) {
      out.push(
        `本期「${pair.label}」比例較上期${diff > 0 ? '增加' : '減少'} ${Math.round(Math.abs(diff) * 100)} 個百分點`
      )
    }
  }
  return out
})

// 需注意名單：大幅變動（|Δ|≥10）或本期落在丙/丁等
const attentionRows = computed<CalibrationRow[]>(() => {
  const d = data.value
  if (!d) return []
  return d.rows.filter(
    (r) =>
      (r.score_delta != null && Math.abs(Number(r.score_delta)) >= SCORE_DELTA_WARN)
      || r.grade === 'WARN'
      || r.grade === 'FAIL'
  )
})

function deltaText(r: CalibrationRow): string {
  if (r.score_delta == null) return '—（無上期）'
  const n = Number(r.score_delta)
  return `${n > 0 ? '+' : ''}${n}`
}

function prevText(r: CalibrationRow): string {
  if (r.prev_total_score == null) return '—'
  const gradeText = r.prev_grade ? (GRADE_LABEL[r.prev_grade] ?? r.prev_grade) : ''
  return `${Number(r.prev_total_score)} 分（${gradeText}）`
}

const pct = (ratio: number) => Math.round(ratio * 1000) / 10

defineExpose({
  cycles, selectedCycleId, data, loading, loadError,
  bucketPairs, ratioWarnings, attentionRows, reload, cycleLabel,
})
</script>

<template>
  <div class="calibration-view">
    <PageHeader title="等第校準">
      <template #actions>
        <el-select
          v-model="selectedCycleId"
          style="width: 160px"
          data-test="cycle-select"
        >
          <el-option
            v-for="c in cycles"
            :key="c.id"
            :label="cycleLabel(c)"
            :value="c.id"
          />
        </el-select>
      </template>
    </PageHeader>

    <p class="calibration-note">
      本頁為唯讀校準輔助：對照上期分布、標示大幅變動與低等第名單，不影響任何簽核。
      警示閾值（比例差 15 個百分點／分數變動 10 分）暫依慣例、待業主確認；本園不採強制等第分配。
    </p>

    <el-alert
      v-if="loadError"
      type="error" :closable="false" show-icon
      title="等第分布載入失敗"
      data-test="calibration-load-error"
      class="calibration-alert"
    >
      <el-button size="small" data-test="calibration-retry" @click="reload">重試</el-button>
    </el-alert>

    <template v-else-if="data">
      <EmptyState
        v-if="data.current.total_count === 0"
        title="本週期尚無考核總結"
        description="請先於「當期總覽」完成同步分數與總結計算，再回來檢視分布。"
      />

      <template v-else>
        <!-- 柔性警示 -->
        <el-alert
          v-for="w in ratioWarnings"
          :key="w"
          type="warning" :closable="false" show-icon
          :title="w"
          data-test="ratio-warning"
          class="calibration-alert"
        />

        <!-- 分布對比 -->
        <section class="dist-section" data-test="distribution-section">
          <h3 class="section-title">
            等第分布：本期 {{ cycleLabel(data.current) }}（{{ data.current.total_count }} 人）
            <span v-if="data.previous" class="section-sub">
              vs 上期 {{ cycleLabel(data.previous) }}（{{ data.previous.total_count }} 人）
            </span>
            <span v-else class="section-sub">（無上期週期可比較）</span>
          </h3>
          <div v-for="pair in bucketPairs" :key="pair.grade" class="dist-row">
            <span class="dist-label">
              <el-tag :type="GRADE_TAG[pair.grade] || 'info'" size="small">{{ pair.label }}</el-tag>
            </span>
            <div class="dist-bars">
              <el-progress
                :percentage="pct(pair.curRatio)"
                :stroke-width="14"
                :format="() => `${pair.curCount} 人（${pct(pair.curRatio)}%）`"
              />
              <div v-if="pair.prevRatio != null" class="dist-prev">
                上期 {{ pair.prevCount }} 人（{{ pct(pair.prevRatio) }}%）
              </div>
            </div>
          </div>
        </section>

        <!-- 需注意名單 -->
        <section class="attention-section">
          <h3 class="section-title">需注意名單（{{ attentionRows.length }}）</h3>
          <p class="section-hint">大幅變動（|Δ| ≥ 10 分）或本期丙/丁等；供簽核前逐一確認評分依據。</p>
          <el-table :data="attentionRows" border data-test="attention-table">
            <template #empty><EmptyState title="無需注意項目" /></template>
            <el-table-column label="員工" width="110">
              <template #default="{ row }">{{ row.employee_name }}</template>
            </el-table-column>
            <el-table-column label="角色" width="100">
              <template #default="{ row }">{{ ROLE_GROUP_LABEL[row.role_group] ?? row.role_group }}</template>
            </el-table-column>
            <el-table-column label="上期">
              <template #default="{ row }">{{ prevText(row) }}</template>
            </el-table-column>
            <el-table-column label="本期">
              <template #default="{ row }">
                {{ Number(row.total_score) }} 分
                <el-tag :type="GRADE_TAG[row.grade] || 'info'" size="small">{{ GRADE_LABEL[row.grade] ?? row.grade }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="變動" width="110">
              <template #default="{ row }">{{ deltaText(row) }}</template>
            </el-table-column>
            <el-table-column label="考核獎金" align="right" width="110">
              <template #default="{ row }">{{ formatCurrency(row.bonus_amount) }}</template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 全員交叉檢視 -->
        <section class="roster-section">
          <h3 class="section-title">全員分數 × 獎金（{{ data.rows.length }} 人）</h3>
          <el-table v-loading="loading" :data="data.rows" border stripe max-height="480" data-test="roster-table">
            <el-table-column label="員工" width="110">
              <template #default="{ row }">{{ row.employee_name }}</template>
            </el-table-column>
            <el-table-column label="角色" width="100">
              <template #default="{ row }">{{ ROLE_GROUP_LABEL[row.role_group] ?? row.role_group }}</template>
            </el-table-column>
            <el-table-column label="上期">
              <template #default="{ row }">{{ prevText(row) }}</template>
            </el-table-column>
            <el-table-column label="本期分數" width="100" align="right">
              <template #default="{ row }">{{ Number(row.total_score) }}</template>
            </el-table-column>
            <el-table-column label="等第" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="GRADE_TAG[row.grade] || 'info'" size="small">{{ GRADE_LABEL[row.grade] ?? row.grade }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="變動" width="110">
              <template #default="{ row }">{{ deltaText(row) }}</template>
            </el-table-column>
            <el-table-column label="考核獎金" align="right" width="110">
              <template #default="{ row }">{{ formatCurrency(row.bonus_amount) }}</template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.calibration-view { padding: var(--space-4); }
.calibration-note { color: var(--text-secondary); font-size: 13px; margin: 0 0 var(--space-3); }
.calibration-alert { margin-bottom: var(--space-2); }
.section-title { font-size: 15px; margin: 0 0 var(--space-2); }
.section-sub { font-weight: 400; font-size: 13px; color: var(--text-secondary); margin-left: var(--space-2); }
.section-hint { color: var(--text-secondary); font-size: 12px; margin: 0 0 var(--space-2); }
.dist-section { margin-bottom: var(--space-5); }
.dist-row { display: flex; align-items: center; gap: var(--space-3); padding: 4px 0; }
.dist-label { flex: 0 0 64px; }
.dist-bars { flex: 1; min-width: 0; }
.dist-bars :deep(.el-progress__text) { font-size: 12px !important; min-width: 110px; }
.dist-prev { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.attention-section { margin-bottom: var(--space-5); }
</style>
