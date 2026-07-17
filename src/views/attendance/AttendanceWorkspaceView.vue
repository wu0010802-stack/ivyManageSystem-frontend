<template>
  <div class="attendance-workspace">
    <WorkspaceHeader
      :year="query.year"
      :month="query.month"
      :kpis="kpis"
      @update:year="(v) => { query.year = v }"
      @update:month="(v) => { query.month = v }"
      @import="importOpen = true"
      @export="onExport"
    />

    <!-- 桌機三欄 -->
    <div v-if="isDesktop" class="workspace-cols">
      <div class="col-roster">
        <RosterColumn
          :roster="ws.roster.value"
          :selected-employee-id="selectedEmployeeId"
          :loading="ws.loading.value"
          @select="onRosterSelect"
        />
      </div>
      <div class="col-anomaly">
        <AnomalyQueueColumn
          :items="ws.anomalyQueue.value"
          :selected-index="selectedAnomalyIndex"
          :loading="ws.loading.value"
          @select="onAnomalySelect"
          @filter-change="onFilterChange"
        />
      </div>
      <div class="col-detail">
        <DetailColumn
          :mode="detailMode"
          :anomaly="currentAnomaly"
          :anomaly-index="selectedAnomalyIndex"
          :anomaly-total="ws.anomalyQueue.value.length"
          :context="context"
          :employee-id="currentEmployeeId"
          :year="query.year"
          :month="query.month"
          @resolved="onResolved"
          @navigate="onNavigate"
          @switch-mode="(m: 'resolve' | 'month') => { detailMode = m }"
        />
      </div>
    </div>

    <!-- 行動三 tab -->
    <el-tabs v-else class="workspace-tabs">
      <el-tab-pane label="名冊">
        <div class="col-roster">
          <RosterColumn
            :roster="ws.roster.value"
            :selected-employee-id="selectedEmployeeId"
            :loading="ws.loading.value"
            @select="onRosterSelect"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="異常">
        <div class="col-anomaly">
          <AnomalyQueueColumn
            :items="ws.anomalyQueue.value"
            :selected-index="selectedAnomalyIndex"
            :loading="ws.loading.value"
            @select="onAnomalySelect"
            @filter-change="onFilterChange"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="明細">
        <div class="col-detail">
          <DetailColumn
            :mode="detailMode"
            :anomaly="currentAnomaly"
            :anomaly-index="selectedAnomalyIndex"
            :anomaly-total="ws.anomalyQueue.value.length"
            :context="context"
            :employee-id="currentEmployeeId"
            :year="query.year"
            :month="query.month"
            @resolved="onResolved"
            @navigate="onNavigate"
            @switch-mode="(m: 'resolve' | 'month') => { detailMode = m }"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 匯入 dialog -->
    <ImportPreviewDialog
      v-model="importOpen"
      :year="query.year"
      :month="query.month"
      @imported="onImported"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, toRef, onMounted, provide, computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'
import type { AnomalyItem } from '@/composables/useAttendanceWorkspace'
import { useIsMobile } from '@/composables/useIsMobile'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { downloadFile } from '@/utils/download'
import { getRecords } from '@/api/attendance'
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'
import RosterColumn from '@/components/attendance/RosterColumn.vue'
import AnomalyQueueColumn from '@/components/attendance/AnomalyQueueColumn.vue'
import DetailColumn from '@/components/attendance/DetailColumn.vue'
import ImportPreviewDialog from '@/components/attendance/ImportPreviewDialog.vue'

// ── 最小 interface for getRecords 回傳列 ──────────────────────────────────────
interface RecordRow {
  date: string
  punch_in: string | null
  punch_out: string | null
  status: string | null
}

// ── 查詢狀態 ────────────────────────────────────────────────────────────────
const now = new Date()
const query = reactive({ year: now.getFullYear(), month: now.getMonth() + 1 })

// ── workspace composable ───────────────────────────────────────────────────
const ws = useAttendanceWorkspace(toRef(query, 'year'), toRef(query, 'month'))
const kpis = computed(() => ws.kpis.value)

// ── 錯誤通知 ────────────────────────────────────────────────────────────────
const { notify } = useErrorNotify()

// ── 響應式版面 ──────────────────────────────────────────────────────────────
const { isMobile } = useIsMobile()
const isDesktop = computed(() => !isMobile.value)

// ── UI 狀態機 ────────────────────────────────────────────────────────────────
const selectedEmployeeId = ref<number | null>(null)
const selectedAnomalyIndex = ref(0)
const detailMode = ref<'resolve' | 'month'>('resolve')
const importOpen = ref(false)

// ── 員工月記錄快取 ───────────────────────────────────────────────────────────
// key = employee_id，val = 該員工在當月的記錄陣列
const recordsCache = ref<Map<number, RecordRow[]>>(new Map())

// ── derived: 當前異常筆 ────────────────────────────────────────────────────
const currentAnomaly = computed<AnomalyItem | null>(
  () => ws.anomalyQueue.value[selectedAnomalyIndex.value] ?? null,
)

// ── derived: 當前員工 DB 主鍵 ─────────────────────────────────────────────
// RosterColumn 點選時 selectedEmployeeId 已有值；
// 從 AnomalyQueue 選取時 selectedEmployeeId=null，用 anomaly.employee_number 對照名冊
const currentEmployeeId = computed<number | null>(() => {
  if (selectedEmployeeId.value != null) return selectedEmployeeId.value
  const a = currentAnomaly.value
  if (!a) return null
  return ws.roster.value.find((r) => r.employee_number === a.employee_number)?.employee_id ?? null
})

// ── 監聽 [currentEmployeeId, year, month]：換月先清快取再載入 ──────────────
// 合併為單一 watch 避免換月時 Watch1（載入）先跑命中舊快取、Watch2（清快取）後跑的競態。
// 邏輯：若 year 或 month 有變化，先清快取；再針對當前 empId 執行 cache-miss 載入。
// request-sequence guard（recSeq）：換月/換員工時，舊一次 in-flight 的 getRecords 回應
// 可能在較新一次之後才 resolve；若無守衛會用舊月資料回填快取覆寫最新月，造成顯示與快取不一致。
// 每次觸發遞增 recSeq 並在 await 後比對，過期回應直接丟棄。
let recSeq = 0
watch(
  [currentEmployeeId, () => query.year, () => query.month] as const,
  async ([empId, y, m], [, oldY, oldM]) => {
    const seq = ++recSeq
    // 換月或換年 → 清快取（確保不命中舊月資料）
    if (y !== oldY || m !== oldM) {
      recordsCache.value = new Map()
    }
    if (empId == null) return
    if (recordsCache.value.has(empId)) return
    try {
      const res = await getRecords({ year: y, month: m, employee_id: empId })
      // 較新一次 watch 觸發已使本次回應過期 → 丟棄，避免舊月 in-flight 回填快取
      if (seq !== recSeq) return
      const rows = (res.data ?? []) as RecordRow[]
      recordsCache.value = new Map(recordsCache.value).set(empId, rows)
    } catch (err) {
      notify(err, 'AttendanceWorkspaceView.loadRecords', null, { prefix: '載入打卡記錄失敗' })
    }
  },
  { immediate: false },
)

// ── context：從快取找當日記錄 ─────────────────────────────────────────────
const context = computed(() => {
  const a = currentAnomaly.value
  const empId = currentEmployeeId.value
  const rec =
    a != null && empId != null
      ? (recordsCache.value.get(empId) ?? []).find((r) => r.date === a.date) ?? null
      : null
  return {
    punch_in: rec?.punch_in ?? null,
    punch_out: rec?.punch_out ?? null,
    has_leave: typeof rec?.status === 'string' && rec.status.includes('leave'),
    estimated_deduction: a?.estimated_deduction ?? 0,
  }
})

// ── 事件 handlers ─────────────────────────────────────────────────────────

function onRosterSelect(id: number): void {
  selectedEmployeeId.value = id
  detailMode.value = 'month'
}

function onAnomalySelect(idx: number): void {
  selectedAnomalyIndex.value = idx
  selectedEmployeeId.value = null // 走 anomaly.employee_number → roster 對照
  detailMode.value = 'resolve'
}

function onFilterChange(): void {
  // status 篩選完整支援列為 follow-up（目前 AnomalyQueueColumn 本地只篩 type）；
  // 此處觸發 refresh 讓佇列重新拉取最新資料
  ws.refresh()
}

async function onResolved(): Promise<void> {
  await ws.refresh()
  // clamp：解決最後一筆後 index 不超界
  if (selectedAnomalyIndex.value >= ws.anomalyQueue.value.length) {
    selectedAnomalyIndex.value = Math.max(0, ws.anomalyQueue.value.length - 1)
  }
}

function onNavigate(delta: number): void {
  const max = Math.max(0, ws.anomalyQueue.value.length - 1)
  selectedAnomalyIndex.value = Math.min(Math.max(0, selectedAnomalyIndex.value + delta), max)
}

async function onImported(): Promise<void> {
  await ws.refresh()
  ElMessage.success('匯入完成')
}

async function onExport(): Promise<void> {
  await downloadFile(
    `/exports/attendance?year=${query.year}&month=${query.month}`,
    `考勤月報_${query.year}_${String(query.month).padStart(2, '0')}.xlsx`,
  )
}

// ── 初始載入 ────────────────────────────────────────────────────────────────
onMounted(() => ws.refresh())

provide('attendanceWs', ws)
</script>

<style scoped>
.attendance-workspace {
  padding: var(--space-4);
}

.workspace-cols {
  display: grid;
  grid-template-columns: 240px 280px 1fr;
  gap: var(--space-3);
  align-items: start;
}

.col-roster,
.col-anomaly,
.col-detail {
  min-height: 200px;
}

.workspace-tabs {
  margin-top: var(--space-3);
}
</style>
