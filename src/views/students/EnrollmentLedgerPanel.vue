<script setup lang="ts">
/**
 * 在籍異動帳（SPEC-021）。
 *
 * 取代 SPEC-017 的快照面板：主體是逐筆流水，不是定期拍照，
 * 因此**沒有任何「拍照」按鈕**——帳只由後端業務路徑自動產生。
 * 版面比照 src/views/governance/AuditLogView.vue（篩選列 → 表格 → expand）。
 *
 * 2026-09-07 起本面板是「在籍統計」頁的下半段，不再是獨立頁籤：
 * - **查詢區間由父層持有**（`v-model:date-range`），與頁首的學年學期同一個控制項；
 *   面板內的日期選擇器只用來在該學期內進一步縮小範圍。
 * - **對帳橫幅已上移到頁面層**，與現值統計共用一條，避免同一個總人數報兩次。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getEnrollmentLedger,
  getHeadcountOn,
  getLedgerTrend,
} from '@/api/studentEnrollment'
import { apiError } from '@/utils/error'
import { LineChart } from '@/composables/useChartJs'
import {
  EVENT_KIND_TAG_TYPE,
  TREND_CHART_OPTIONS,
  buildTrendChartData,
  changeSummary,
  decorateDatasets,
  deltaClass,
  formatDelta,
  type LedgerRow,
  type TrendPoint,
} from '@/utils/enrollmentLedger'

/**
 * 查詢區間。父層切學年學期時整段換掉；面板內的日期選擇器改值也會回寫父層，
 * 讓頁面層的對帳橫幅跟著同一個結束日走。
 */
const dateRange = defineModel<[string, string]>('dateRange', { required: true })

/** 父層「重新整理」的訊號。值變了就重抓，不在意值本身。 */
const props = defineProps<{ refreshToken?: number }>()

const classroomId = ref<number | undefined>(undefined)
const eventKind = ref<string | undefined>(undefined)
const source = ref<string | undefined>(undefined)
const page = ref(1)
const pageSize = ref(50)

const loading = ref(false)
const rows = ref<LedgerRow[]>([])
const total = ref(0)
const opened = ref(true)
const trendPoints = ref<TrendPoint[]>([])
const overlayClassIds = ref<number[]>([])
const classOptions = ref<{ id: number; name: string }[]>([])

const eventKindOptions = Object.keys(EVENT_KIND_TAG_TYPE)
const sourceOptions = [
  { value: 'app', label: '程式記帳' },
  { value: 'db_trigger', label: '來源不明' },
  { value: 'opening', label: '開帳' },
]

const classNameMap = computed(() =>
  Object.fromEntries(classOptions.value.map((c) => [c.id, c.name])),
)

const chartData = computed(() => {
  const d = buildTrendChartData(
    trendPoints.value,
    overlayClassIds.value,
    classNameMap.value,
  )
  return { labels: d.labels, datasets: decorateDatasets(d.datasets) }
})

const fetchLedger = async () => {
  const res = await getEnrollmentLedger({
    date_from: dateRange.value[0],
    date_to: dateRange.value[1],
    classroom_id: classroomId.value,
    event_kind: eventKind.value,
    source: source.value,
    page: page.value,
    page_size: pageSize.value,
  })
  rows.value = res.data.items
  total.value = res.data.total
  opened.value = res.data.opened
}

const fetchTrend = async () => {
  const res = await getLedgerTrend({
    date_from: dateRange.value[0],
    date_to: dateRange.value[1],
  })
  trendPoints.value = res.data.points
}

const fetchClassOptions = async () => {
  const res = await getHeadcountOn({ date: dateRange.value[1] })
  classOptions.value = res.data.classes
    .filter((c) => c.classroom_id !== null)
    .map((c) => ({ id: c.classroom_id as number, name: c.class_name ?? '未命名' }))
}

const reload = async () => {
  loading.value = true
  try {
    await Promise.all([fetchLedger(), fetchTrend(), fetchClassOptions()])
  } catch (e: unknown) {
    ElMessage.error(apiError(e, '載入在籍異動帳失敗'))
  } finally {
    loading.value = false
  }
}

onMounted(reload)
watch([dateRange, classroomId, eventKind, source], () => {
  page.value = 1
  void reload()
})
watch(page, () => void fetchLedger())
// 父層按下「重新整理」。deep-watch 不必要，值本身無意義、變了就重抓。
watch(
  () => props.refreshToken,
  () => void reload(),
)

const tagType = (kind: string) => EVENT_KIND_TAG_TYPE[kind] ?? 'info'
/**
 * 開帳列是帳本基準，不是學生事件——後端 `ensure_opening_row` 不帶 student，
 * 兩個學生欄天生為 NULL。只有「本來有學生、後來被刪掉」的列才算孤兒列。
 * 每個租戶的第一列都是開帳列，標成「已刪除」會讓人以為資料掉了。
 */
const isOpeningRow = (row: LedgerRow) => row.source === 'opening'
const isOrphanStudent = (row: LedgerRow) =>
  row.student_id === null && !isOpeningRow(row)
const studentLabel = (row: LedgerRow) => {
  if (isOpeningRow(row)) return '—'
  return row.student_name ?? '（已刪除）'
}
const isSentinel = (row: LedgerRow) => row.source === 'db_trigger'
/** 來源不明列整列標記，讓它在一片正常紀錄中一眼可辨。 */
const rowClassName = ({ row }: { row: LedgerRow }) =>
  isSentinel(row) ? 'sentinel-row' : ''
</script>

<template>
  <div v-loading="loading" class="enrollment-ledger-panel">
    <!-- 對帳橫幅在頁面層（EnrollmentStatsView），本面板只管趨勢與逐筆明細。 -->
    <el-card shadow="never" class="chart-card">
      <template #header>
        <span class="card-header-title">在籍人數趨勢</span>
        <el-select
          v-model="overlayClassIds"
          data-testid="class-overlay-select"
          multiple
          collapse-tags
          clearable
          placeholder="疊加班級曲線"
          class="overlay-select"
        >
          <el-option
            v-for="c in classOptions"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
      </template>
      <div class="chart-wrapper">
        <component
          :is="LineChart"
          v-if="trendPoints.length"
          :data="chartData"
          :options="TREND_CHART_OPTIONS"
        />
        <el-empty
          v-else-if="!loading"
          data-testid="trend-empty"
          description="本期間沒有足以繪製趨勢的資料"
          :image-size="80"
        />
      </div>
    </el-card>

    <div class="filters">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="開始日期"
        end-placeholder="結束日期"
      />
      <el-select v-model="classroomId" clearable placeholder="全部班級" class="filter-item">
        <el-option v-for="c in classOptions" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="eventKind" clearable placeholder="全部異動類型" class="filter-item">
        <el-option v-for="k in eventKindOptions" :key="k" :label="k" :value="k" />
      </el-select>
      <el-select v-model="source" clearable placeholder="全部來源" class="filter-item">
        <el-option
          v-for="s in sourceOptions"
          :key="s.value"
          :label="s.label"
          :value="s.value"
        />
      </el-select>
    </div>

    <el-table
      :data="rows"
      :row-class-name="rowClassName"
      border
      style="width: 100%"
      class="ledger-table"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand-detail" :data-testid="`ledger-detail-${row.id}`">
            <p v-if="row.notes">備註：{{ row.notes }}</p>
            <p v-if="isOrphanStudent(row)" class="source-path">
              學生資料已刪除，本列靠冗餘欄保留姓名與學號
            </p>
            <p class="source-path">寫入來源：{{ row.source_path ?? '—' }}</p>
            <p class="source-path">紀錄時間：{{ row.created_at ?? '—' }}</p>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="日期" width="115">
        <template #default="{ row }">
          <span :data-testid="`ledger-row-${row.id}`">{{ row.event_date }}</span>
        </template>
      </el-table-column>

      <el-table-column label="學生" width="140">
        <template #default="{ row }">
          <span>{{ studentLabel(row) }}</span>
          <span v-if="row.student_display_id" class="student-no">
            {{ row.student_display_id }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="異動" width="120">
        <template #default="{ row }">
          <el-tag :type="tagType(row.event_kind)" size="small">
            {{ row.event_kind }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="異動內容" min-width="220">
        <template #default="{ row }">
          {{ changeSummary(row) }}
        </template>
      </el-table-column>

      <el-table-column label="班人數" width="90" align="right">
        <template #default="{ row }">
          <span v-if="isSentinel(row)" class="delta-unknown">?</span>
          <span v-else>{{ row.to_class_count_after ?? row.from_class_count_after ?? '—' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="全校" width="110" align="right">
        <template #default="{ row }">
          <span v-if="isSentinel(row)" class="delta-unknown">?</span>
          <template v-else>
            {{ row.school_total_after }}
            <span :class="deltaClass(row.school_delta)" class="delta-badge">
              {{ formatDelta(row.school_delta) }}
            </span>
          </template>
        </template>
      </el-table-column>

      <el-table-column label="操作者" width="110">
        <template #default="{ row }">
          <span v-if="row.actor_name">{{ row.actor_name }}</span>
          <span v-else class="muted">系統</span>
        </template>
      </el-table-column>

      <el-table-column label="原因" min-width="130">
        <template #default="{ row }">
          <span v-if="isSentinel(row)">
            <el-tag type="warning" size="small">來源不明</el-tag>
          </span>
          <span v-else>{{ row.reason ?? '—' }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <el-empty
          :description="opened ? '本期間沒有人數異動' : '本帳尚未起帳'"
          :image-size="80"
        />
      </template>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="pager"
    />
  </div>
</template>

<style scoped>
.enrollment-ledger-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chart-card :deep(.el-card__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-header-title {
  font-weight: 600;
}
.overlay-select {
  width: 260px;
}
.chart-wrapper {
  height: 260px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-item {
  width: 170px;
}
.student-no {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.delta-badge {
  margin-left: 4px;
  font-size: 12px;
}
.delta-up {
  color: var(--el-color-success);
}
.delta-down {
  color: var(--el-color-danger);
}
.delta-unknown {
  color: var(--el-color-warning);
  font-weight: 600;
}
.ledger-table :deep(.sentinel-row) {
  background-color: var(--el-color-warning-light-9);
}
.muted {
  color: var(--el-text-color-secondary);
}
.expand-detail {
  padding: 8px 16px;
  line-height: 1.8;
}
.source-path {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.pager {
  justify-content: flex-end;
}
</style>
