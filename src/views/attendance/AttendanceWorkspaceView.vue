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

    <!-- 行動三段流程：名冊／異常 → 明細。tab 受控，選取後自動推進到明細，
         否則使用者在名冊點了人卻停在原頁，看不出發生了什麼。 -->
    <el-tabs v-else v-model="mobileTab" class="workspace-tabs">
      <el-tab-pane label="名冊" name="roster">
        <div class="col-roster">
          <RosterColumn
            :roster="ws.roster.value"
            :selected-employee-id="selectedEmployeeId"
            :loading="ws.loading.value"
            @select="onRosterSelect"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane :label="anomalyTabLabel" name="anomaly">
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
      <el-tab-pane label="明細" name="detail">
        <div class="col-detail">
          <el-button
            class="mobile-detail-back"
            data-test="mobile-detail-back"
            text
            :icon="ArrowLeft"
            @click="backFromDetail"
          >
            {{ detailMode === 'resolve' ? '回異常佇列' : '回名冊' }}
          </el-button>
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
import { ArrowLeft } from '@element-plus/icons-vue'
import { useAttendanceWorkspace } from '@/composables/useAttendanceWorkspace'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'
import { useIsMobile } from '@/composables/useIsMobile'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { downloadFile } from '@/utils/download'
import { getRecords } from '@/api/attendance'
import type { ApiResponse } from '@/api/_generated/typed'
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'
import RosterColumn from '@/components/attendance/RosterColumn.vue'
import AnomalyQueueColumn from '@/components/attendance/AnomalyQueueColumn.vue'
import DetailColumn from '@/components/attendance/DetailColumn.vue'
import ImportPreviewDialog from '@/components/attendance/ImportPreviewDialog.vue'

// ── getRecords 回傳列（OpenAPI 契約型別）────────────────────────────────────
type RecordRow = ApiResponse<'/attendance/records', 'get'>[number]

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

// ── 手機三段流程 ────────────────────────────────────────────────────────────
// 桌機三欄同時可見，不需要這個狀態；手機一次只看得到一段，故需記錄目前在哪一段。
type MobileTab = 'roster' | 'anomaly' | 'detail'
const mobileTab = ref<MobileTab>('roster')

// 異常分頁標籤帶待處理筆數，讓使用者不必切過去才知道有沒有事情要處理
const anomalyTabLabel = computed(() => {
  const n = ws.anomalyQueue.value.length
  return n > 0 ? `異常（${n}）` : '異常'
})

// 返回鍵回到「來的那一段」：resolve 模式來自異常佇列，month 模式來自名冊
function backFromDetail(): void {
  mobileTab.value = detailMode.value === 'resolve' ? 'anomaly' : 'roster'
}

// ── 員工月記錄快取 ───────────────────────────────────────────────────────────
// key = employee_id，val = 該員工在當月的記錄陣列
const recordsCache = ref<Map<number, RecordRow[]>>(new Map())

// ── derived: 當前異常日卡 ──────────────────────────────────────────────────
const currentAnomaly = computed<AnomalyDayCard | null>(
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
      recordsCache.value = new Map(recordsCache.value).set(empId, res.data ?? [])
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
    // 日卡合計（遮罩 null 不列入）；處理動作套用整天，扣款也以整天合計呈現
    estimated_deduction:
      a?.items.reduce((sum, i) => sum + (i.estimated_deduction ?? 0), 0) ?? 0,
  }
})

// ── 事件 handlers ─────────────────────────────────────────────────────────

function onRosterSelect(id: number): void {
  selectedEmployeeId.value = id
  detailMode.value = 'month'
  if (isMobile.value) mobileTab.value = 'detail'
}

function onAnomalySelect(idx: number): void {
  selectedAnomalyIndex.value = idx
  selectedEmployeeId.value = null // 走 anomaly.employee_number → roster 對照
  detailMode.value = 'resolve'
  if (isMobile.value) mobileTab.value = 'detail'
}

function clampSelectedIndex(): void {
  if (selectedAnomalyIndex.value >= ws.anomalyQueue.value.length) {
    selectedAnomalyIndex.value = Math.max(0, ws.anomalyQueue.value.length - 1)
  }
}

// 明細快取失效（P1-4）：resolve/import/upsert/delete 後打卡事實已變，
// 不失效會讓 ResolveCard/EmployeeMonthPanel 讀到舊資料。清空後立即補抓
// 當前員工，其餘員工待選取時 cache-miss 重載。
async function invalidateRecordsCache(): Promise<void> {
  recordsCache.value = new Map()
  const empId = currentEmployeeId.value
  if (empId == null) return
  const seq = ++recSeq
  try {
    const res = await getRecords({ year: query.year, month: query.month, employee_id: empId })
    if (seq !== recSeq) return
    recordsCache.value = new Map(recordsCache.value).set(empId, res.data ?? [])
  } catch (err) {
    notify(err, 'AttendanceWorkspaceView.reloadRecords', null, { prefix: '載入打卡記錄失敗' })
  }
}

function onFilterChange(): void {
  // 狀態/類型篩選由 AnomalyQueueColumn 本地過濾（真的生效）；此處 refresh
  // 拉最新資料，並 clamp index 防列表縮短後選取超界
  void ws.refresh().then(clampSelectedIndex)
}

async function onResolved(): Promise<void> {
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  // clamp：解決最後一筆後 index 不超界
  clampSelectedIndex()
}

function onNavigate(delta: number): void {
  const max = Math.max(0, ws.anomalyQueue.value.length - 1)
  selectedAnomalyIndex.value = Math.min(Math.max(0, selectedAnomalyIndex.value + delta), max)
}

async function onImported(): Promise<void> {
  await Promise.all([ws.refresh(), invalidateRecordsCache()])
  clampSelectedIndex()
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

/* 返回鍵是手機明細頁的主要退路，觸控目標對齊 44px 並靠左貼齊內容 */
.mobile-detail-back {
  min-height: var(--touch-target-min);
  margin-bottom: var(--space-2);
  padding-left: 0;
}

@media (--to-sm) {
  .attendance-workspace {
    padding: var(--space-3);
  }
  /* 三段標籤在窄機平均分配寬度，避免「異常（12）」把「明細」擠出視窗 */
  .workspace-tabs :deep(.el-tabs__nav) {
    display: flex;
    width: 100%;
  }
  .workspace-tabs :deep(.el-tabs__item) {
    flex: 1 1 0;
    justify-content: center;
    min-height: var(--touch-target-min);
    padding: 0 var(--space-2);
  }
}
</style>
