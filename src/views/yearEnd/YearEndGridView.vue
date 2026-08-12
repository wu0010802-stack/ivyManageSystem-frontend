<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getYearEndGrid, buildSettlements, listYearEndCycles, getYearEndCycleExceptions } from '@/api/yearEnd'
import { moneyInt } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { SIGN_STATUS_LABEL, SIGN_STATUS_TAG, SIGN_STATUS_ORDER, exceptionTypeLabel } from '@/constants/appraisalYearEnd'
import api from '@/api/index'
import { BONUS_COL_KEYS, SPECIAL_BONUS_LABELS, loadVisibleBonusCols, saveVisibleBonusCols } from './gridColumns'
import GridRowDetailDrawer from './components/GridRowDetailDrawer.vue'

// Derive row type from the typed API wrapper — no hand-written `any`.
type GridRow = Awaited<ReturnType<typeof getYearEndGrid>>['data'][number]

// listYearEndCycles() 無單筆 cycle-by-id 端點，沿用 YearEndDetailView.vue 的
// listYearEndCycles().find() 慣例；只取 banner/CTA 顯示條件判斷需要的最小欄位集。
interface YearEndCycleLite {
  id: number
  status: string
}

// F-2：總表金額統一顯示為整數元（僅顯示層四捨五入，row.* 原始資料值不動、
// 送出/核對仍用原始精度）。「主結算」「合計」帶兩位小數與「考核上」「紅利上」
// 等整數欄並列時視覺突兀，也讓欄寬更容易不夠而在小數點附近換行。moneyInt 已
// 收斂至 @/utils/currency（單一來源，Task 4 起 GridRowDetailDrawer 亦共用）。

// SPECIAL_BONUS_LABELS 已收斂至 ./gridColumns（單一來源，Task 4 起
// GridRowDetailDrawer 亦共用）。

// Task 12④：狀態 tag/標籤改用單一來源常數（刪本地 STATUS_LABELS/STATUS_TAG_TYPE
// 雙重定義——Task 1 已建立 @/constants/appraisalYearEnd 的 SIGN_STATUS_LABEL/
// SIGN_STATUS_TAG，本檔原本各自維護一份，內容雖一致但屬未收斂的重複定義）。

const props = defineProps<{ cycleId: number }>()
const cycleId = props.cycleId

const rows = ref<GridRow[]>([])
const loading = ref(false)

const canWrite = computed(() => hasPermission('YEAR_END_WRITE'))

// Task 5（批次2b-1）：cycle 狀態（判斷 OPEN/LOCKED/CLOSED）+ 最後一次成功試算的
// 本地時間戳。後端 BuildResultOut 無 timestamp，這裡只記「有成功過」。進頁不再自動
// build（原 Task 9 auto-build 已移除，避免非預期的 DB 寫入/封存/覆寫）——試算改由
// 頁頂顯式「開始試算」CTA 觸發（見 onBuild）。
const cycleStatus = ref<string | null>(null)
const lastBuiltAt = ref<Date | null>(null)

// Task 12②：build 結果摘要（取代「只彈一次 ElMessage」的常駐頁頂摘要列），手動試算
// 成功後顯示。
interface BuildSummary {
  built: number
  skipped_finalized: number
  unmatched_count: number
  fallback_classes: number
  warnings: string[]
}
const buildResult = ref<BuildSummary | null>(null)

// ---- 重新試算 dialog ----
const buildDialogVisible = ref(false)

// ---- 明細抽屜（Task 4：取代舊手改 dialog，見 GridRowDetailDrawer.vue）----
const drawerVisible = ref(false)
const drawerRow = ref<GridRow | null>(null)

function openDrawer(row: GridRow) {
  drawerRow.value = row
  drawerVisible.value = true
}

// ---- Derived columns ----
const bonusColumns = computed(() => {
  // Union all special_bonuses keys across rows, ordered by SPECIAL_BONUS_LABELS key order.
  const labelKeys = Object.keys(SPECIAL_BONUS_LABELS)
  const seenKeys = new Set<string>()
  for (const row of rows.value) {
    for (const k of Object.keys(row.special_bonuses)) {
      seenKeys.add(k)
    }
  }
  // Sort by label order first, then unknowns appended.
  const ordered = labelKeys.filter((k) => seenKeys.has(k))
  for (const k of seenKeys) {
    if (!ordered.includes(k)) ordered.push(k)
  }
  return ordered.map((key) => ({ key, label: SPECIAL_BONUS_LABELS[key] ?? key }))
})

// Task 3（批次2b-1）：獎金欄開關 chips——總表原本 7 欄＋9 個常駐獎金欄 ≈1767px 必橫捲，
// 改預設全不顯示獎金欄（零橫捲摘要表），使用者勾選 chip 才插回該欄；勾選狀態存
// localStorage（單一來源見 gridColumns.ts），重整/跨頁記得住。
const visibleBonusCols = ref<Set<string>>(loadVisibleBonusCols())

function toggleBonusCol(key: string) {
  const next = new Set(visibleBonusCols.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  visibleBonusCols.value = next
  saveVisibleBonusCols(next)
}

// 主表實際渲染的獎金欄：bonusColumns（資料裡實際出現過的 key）交集使用者已勾選
// 顯示的 key（visibleBonusCols）——兩者都要滿足，未發放過的獎金種類不會因為使用者
// 誤勾而生出空欄。
const visibleBonusColumns = computed(() =>
  bonusColumns.value.filter((col) => visibleBonusCols.value.has(col.key))
)

// ── 批次 A③：需注意列過濾 ────────────────────────────────────────────────
// 行政人員實際掃視的是「哪些列需要人工確認」：合計非正數（0 元或負值多半是資料
// 缺漏/扣款吃光）、有人工備註（代表有 override）、獎懲扣款非 0（手動或懲處 deriver
// 自動產生）、未滿整年（到職月折算 <12/12，年中到離職都在這裡）。預設關閉，不改變
// 既有預設視圖；金額欄為後端 Decimal 序列化字串，缺欄防禦性視為無異常訊號。
function isAttentionRow(row: GridRow): boolean {
  const total = Number(row.total_amount)
  const disciplinary = Number(row.deduction_disciplinary ?? 0)
  const hireMonths = Number(row.hire_months ?? 12)
  return !(total > 0) || Boolean(row.remark) || disciplinary !== 0 || hireMonths < 12
}

const attentionOnly = ref(false)
const attentionCount = computed(() => rows.value.filter(isAttentionRow).length)
const displayedRows = computed(() =>
  attentionOnly.value ? rows.value.filter(isAttentionRow) : rows.value
)

// 特別獎金合計：9 個常駐獎金欄摘要成單一欄，是摘要表零橫捲的關鍵——使用者要看
// 細項才勾 chip 插回單欄，預設只看合計。金額為後端 Decimal 序列化字串，逐一
// Number() 加總；row.special_bonuses 只含實際發放的 key，未發放的欄位不存在，
// 視同 0（沿用既有 `?? 0` 慣例，見下方動態獎金欄 cell）。
function specialBonusTotal(row: GridRow): number {
  return Object.values(row.special_bonuses).reduce((sum: number, v) => sum + Number(v), 0)
}
function sortBySpecialBonusTotal(a: GridRow, b: GridRow) {
  return specialBonusTotal(a) - specialBonusTotal(b)
}

const baseUrl = computed(() => api.defaults.baseURL || '/api')

// ── 批次 B：試算就緒檢查前移 ──────────────────────────────────────────────
// 例外中心（GET /cycles/{id}/exceptions，唯讀衍生）的 blocking 訊號原本藏在另一頁，
// 行政人員按「開始試算」前看不到。就緒卡把它拉到 CTA 前，並依「是否直接讓試算
// 結果錯」分兩級：
// - gate 試算：missing_class_target／missing_head_teacher——學期紅利與超額計算
//   依賴班級目標與班導，缺列會靜默算錯（少發），未排除前 disable 試算鈕。
// - 不 gate：prereq_not_finalized 擋的是下游「考核年終發放」（generate 會被後端
//   拒絕），與本頁試算無關；qualification/unassigned_course/unmatched_registrations
//   （warning）與 performance_anomaly（info）亦僅提示。
// 載入失敗 fail-open（維持批次 B 前可試算的行為）＋可見警示與重試，比照批次 A①
// 的「降級必須可見」原則。
type ExceptionItem = Awaited<ReturnType<typeof getYearEndCycleExceptions>>['data']['items'][number]

const BUILD_GATING_TYPES = new Set(['missing_class_target', 'missing_head_teacher'])

const exceptions = ref<ExceptionItem[]>([])
const exceptionsLoadFailed = ref(false)

const blockingItems = computed(() => exceptions.value.filter((e) => e.severity === 'blocking'))
const gatingItems = computed(() => blockingItems.value.filter((e) => BUILD_GATING_TYPES.has(e.type)))
const nonGatingBlockingItems = computed(() => blockingItems.value.filter((e) => !BUILD_GATING_TYPES.has(e.type)))
const warningCount = computed(() => exceptions.value.filter((e) => e.severity === 'warning').length)
const infoCount = computed(() => exceptions.value.filter((e) => e.severity === 'info').length)
const buildGated = computed(() => gatingItems.value.length > 0)

// 就緒卡以「型別 × 筆數」摘要（逐筆明細留給例外中心），型別中文標籤走單一來源
// exceptionTypeLabel（constants/appraisalYearEnd.ts）。
function countByType(items: ExceptionItem[]): { type: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
  return [...counts.entries()].map(([type, count]) => ({ type, label: exceptionTypeLabel(type), count }))
}
const gatingSummary = computed(() => countByType(gatingItems.value))
const nonGatingBlockingSummary = computed(() => countByType(nonGatingBlockingItems.value))

async function loadExceptions() {
  try {
    const res = await getYearEndCycleExceptions(cycleId)
    exceptions.value = res.data.items
    exceptionsLoadFailed.value = false
  } catch {
    exceptionsLoadFailed.value = true
  }
}

// 排序：金額欄是後端 Decimal 序列化字串，plain sortable 會做字典序比較
// （"10000" 排到 "9000" 前），一律走 sort-method 轉數字比較。
function sortByPayable(a: GridRow, b: GridRow) {
  return Number(a.payable_amount) - Number(b.payable_amount)
}
function sortByTotal(a: GridRow, b: GridRow) {
  return Number(a.total_amount) - Number(b.total_amount)
}
function sortByStatus(a: GridRow, b: GridRow) {
  const order = SIGN_STATUS_ORDER as readonly string[]
  return order.indexOf(a.status) - order.indexOf(b.status)
}
// 動態獎金欄無固定 prop（值在 row.special_bonuses[key]），每欄各自 curry 一個比較函式。
function sortByBonusCol(key: string) {
  return (a: GridRow, b: GridRow) => Number(a.special_bonuses[key] ?? 0) - Number(b.special_bonuses[key] ?? 0)
}

// lastBuiltAt 是本地 Date（非後端 ISO 字串，BuildResultOut 無 timestamp），近複製
// CurrentSemesterOverview.vue 的 formatTime 慣例但省去 ISO parse 這步。
function formatTime(d: Date | null) {
  if (!d) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// Task 12②：build 成功摘要文案。欄位以 BuildResultOut（schema.d.ts／後端
// schemas/year_end.py:257 起）為準：built/skipped_finalized/unmatched_count/
// fallback_classes/warnings——unmatched_count/fallback_classes 為 B8 derive_report
// 彙整欄位，供前端提醒用；warnings 另有既有 gap-message 彙整（見 onBuild），
// 摘要列本身只顯示計數，不重複列 warnings 內文。
const buildSummaryText = computed(() => {
  const r = buildResult.value
  if (!r) return ''
  const parts = [
    `建立 ${r.built} 筆`,
    `跳過已核定 ${r.skipped_finalized} 筆`,
    `未匹配 ${r.unmatched_count} 筆`,
  ]
  if (r.fallback_classes > 0) parts.push(`沿用舊生率 ${r.fallback_classes} 班`)
  return `試算完成：${parts.join('、')}`
})

// Task 12②：build 成功的副作用（記錄摘要 + 記時間戳）。手動「開始試算」CTA
// （onBuild）觸發成功後套用此語意。
function applyBuildSuccess(data: BuildSummary) {
  buildResult.value = data
  lastBuiltAt.value = new Date()
}

async function loadGrid() {
  loading.value = true
  try {
    const res = await getYearEndGrid(cycleId)
    rows.value = res.data
  } catch {
    ElMessage.error('總表載入失敗')
  } finally {
    loading.value = false
  }
}

// Task 5（批次2b-1）：進頁不再自動 build（原 Task 9 auto-build 已移除）——只讀
// cycle 狀態供 banner/CTA 顯示條件判斷，再載入現有結算資料；試算一律改由使用者
// 主動點頁頂「開始試算」CTA 觸發 onBuild，避免每次進頁都對 DB 產生寫入/可能覆寫
// 既有結算的副作用。cycleId 找不到、或 listYearEndCycles 失敗（.catch → []）時
// cycleStatus 退為 null，CTA/banner 一併不顯示（fail-closed），但仍照常 loadGrid
// 沿用既有結算資料，不影響閱讀。
async function initGrid() {
  const cycles = await listYearEndCycles()
    .then((res) => res.data as YearEndCycleLite[])
    .catch(() => [] as YearEndCycleLite[])
  const cycle = cycles.find((c) => c.id === cycleId)
  cycleStatus.value = cycle?.status ?? null
  // 批次 B：就緒檢查與 grid 資料無依賴，並行載入
  await Promise.all([loadGrid(), loadExceptions()])
}

async function onBuild() {
  try {
    const res = await buildSettlements(cycleId, { included_resigned_employee_ids: [] })
    const { built, skipped_finalized, unmatched_count, fallback_classes, warnings } = res.data
    // Task 12②：手動「開始試算」的成功結果也套用同一套「常駐摘要列」語意
    // （原本只彈一次 ElMessage.success，看過就沒了；現在頁頂多一列可回顧的摘要）。
    applyBuildSuccess(res.data)
    await loadGrid()
    ElMessage.success(`已試算 ${built} 筆，略過已簽 ${skipped_finalized} 筆`)
    // 附帶提醒：資料缺口（任一 > 0 才顯示）+ 後端明細 warnings（如超額覆寫、教課獎勵
    // 缺配對班級等，年終批次2 G7/G8 新增）
    const gapParts: string[] = []
    if (unmatched_count > 0) {
      gapParts.push(`${unmatched_count} 筆才藝報名未配對班級，未計入鼓勵獎金`)
    }
    if (fallback_classes > 0) {
      gapParts.push(`${fallback_classes} 班學號未回填，沿用手填舊生率`)
    }
    if (warnings && warnings.length > 0) {
      gapParts.push(...warnings)
    }
    if (gapParts.length > 0) {
      ElMessage.warning(gapParts.join('；'))
    }
  } catch {
    ElMessage.error('試算失敗')
  } finally {
    buildDialogVisible.value = false
  }
}

defineExpose({
  rows, loading, bonusColumns, canWrite,
  loadGrid, onBuild,
  buildDialogVisible,
  cycleStatus, lastBuiltAt, initGrid,
  buildResult, buildSummaryText,
  // 批次 B：試算就緒檢查
  exceptions, exceptionsLoadFailed, loadExceptions, buildGated,
  gatingItems, gatingSummary, nonGatingBlockingSummary, warningCount, infoCount,
  // Task 3（批次2b-1）：獎金欄開關 chips 供測試直接驅動（避免透過 stub 層模擬點擊的脆弱性）。
  visibleBonusCols, toggleBonusCol, visibleBonusColumns, specialBonusTotal,
  // 批次 A③：需注意列過濾
  attentionOnly, attentionCount, displayedRows, isAttentionRow,
  // Task 4（批次2b-1）：舊手改 dialog（editVisible/editForm/editingRow/openEdit/submitEdit）
  // 已移除，改由 GridRowDetailDrawer 承接（含就地編輯）；grid 這層只保留開關抽屜狀態。
  drawerVisible, drawerRow, openDrawer,
})

onMounted(initGrid)
</script>

<template>
  <div class="year-end-grid-view">
    <!-- Top toolbar -->
    <header class="toolbar">
      <h2 class="title">年終總表（週期 {{ cycleId }}）</h2>
      <span v-if="lastBuiltAt" class="last-built" data-test="last-built-at">
        最後試算 {{ formatTime(lastBuiltAt) }}
      </span>
      <div class="actions">
        <el-button
          v-if="canWrite && cycleStatus === 'OPEN'"
          type="primary"
          :disabled="buildGated"
          data-test="build-button"
          @click="buildDialogVisible = true"
        >
          開始試算
        </el-button>
        <!-- Task 12④：匯出四鈕統一 el-button tag="a" :href 寫法（原本各自包一層 <a> 再塞
             el-button，寫法不一致；比照 YearEndDetailView.vue 既有 tag="a" 慣例）。 -->
        <el-button
          tag="a"
          :href="`${baseUrl}/year_end/cycles/${cycleId}/summary.xlsx`"
          target="_blank"
        >總表 Excel</el-button>
        <el-button
          tag="a"
          :href="`${baseUrl}/year_end/cycles/${cycleId}/summary.pdf`"
          target="_blank"
        >總表 PDF</el-button>
        <el-button
          tag="a"
          :href="`${baseUrl}/year_end/cycles/${cycleId}/transfer_roster.xlsx`"
          target="_blank"
        >轉帳名冊 Excel</el-button>
        <el-button
          tag="a"
          :href="`${baseUrl}/year_end/cycles/${cycleId}/transfer_roster.pdf`"
          target="_blank"
        >轉帳名冊 PDF</el-button>
      </div>
    </header>

    <!-- Task 8②：非 OPEN 週期提示——本頁為最後一次試算結果，開啟不會重新試算
         （Task 5 起進頁本就不再自動試算，此提示著重說明 LOCKED/CLOSED 週期連
         「開始試算」CTA 也不會顯示，只能看既有結算資料）。 -->
    <el-alert
      v-if="cycleStatus && cycleStatus !== 'OPEN'"
      type="info" :closable="false" show-icon
      :title="`週期${cycleStatus === 'LOCKED' ? '已鎖定' : '已封存'}：本頁為最後一次試算結果，開啟頁面不會重新試算。`"
      class="grid-alert"
      data-test="non-open-banner"
    />

    <!-- 批次 B：試算就緒卡——只在 OPEN 週期顯示（LOCKED/CLOSED 連試算 CTA 都沒有）。
         gate 型 blocking 未清時試算鈕 disabled，卡片說明原因並導去例外中心；
         載入失敗 fail-open＋可見警示與重試（比照批次 A① 降級必須可見）。 -->
    <div
      v-if="cycleStatus === 'OPEN'"
      class="readiness-card"
      :class="{ 'readiness-card--gated': buildGated, 'readiness-card--failed': exceptionsLoadFailed }"
      data-test="readiness-card"
    >
      <template v-if="exceptionsLoadFailed">
        <span class="readiness-card__title">⚠️ 試算就緒檢查載入失敗</span>
        <span class="readiness-card__text">無法確認是否有阻斷項；仍可試算，但結果可能包含缺漏。</span>
        <el-button size="small" data-test="readiness-retry" @click="loadExceptions">重試</el-button>
      </template>
      <template v-else-if="buildGated">
        <span class="readiness-card__title">⛔ 尚有 {{ gatingItems.length }} 項阻斷，暫無法試算</span>
        <span v-for="g in gatingSummary" :key="g.type" class="readiness-card__item">
          {{ g.label }} {{ g.count }} 筆
        </span>
        <span class="readiness-card__text">班級目標與班導缺漏會讓紅利／超額計算靜默算錯，請先排除。</span>
      </template>
      <template v-else>
        <span class="readiness-card__title" data-test="readiness-ok">✅ 無阻斷項，可開始試算</span>
        <span v-for="g in nonGatingBlockingSummary" :key="g.type" class="readiness-card__item">
          {{ g.label }} {{ g.count }} 筆（不影響試算，會擋後續發放）
        </span>
        <span v-if="warningCount > 0 || infoCount > 0" class="readiness-card__text">
          另有提醒 {{ warningCount }} 筆、資訊 {{ infoCount }} 筆。
        </span>
      </template>
      <router-link
        v-if="!exceptionsLoadFailed && exceptions.length > 0"
        to="/appraisal-year-end/exceptions"
        class="readiness-card__link"
      >前往例外中心</router-link>
    </div>

    <!-- Task 12②：build 成功摘要列（取代原本「只彈一次」的 ElMessage，常駐可回顧） -->
    <el-alert
      v-if="buildResult"
      type="info"
      closable
      :title="buildSummaryText"
      data-test="build-summary-banner"
      class="grid-alert"
      @close="buildResult = null"
    />

    <!-- Task 5（批次2b-1）：進頁不再自動試算，尚未試算過（rows 為空）時明確引導使用者
         點「開始試算」，避免誤以為系統忘記載入資料。 -->
    <el-alert
      v-if="!rows.length && canWrite && cycleStatus === 'OPEN'"
      type="info"
      :closable="false"
      show-icon
      title="尚未試算，點『開始試算』產生結算"
      data-test="empty-grid-hint"
      class="grid-alert"
    />

    <!-- Task 3（批次2b-1）：獎金欄開關 chips——原 7 欄＋9 個常駐獎金欄總寬 ~1767px 必
         橫向捲動；改預設全不顯示獎金欄（下方 6 欄零橫捲摘要），勾選 chip 才插回該欄。
         勾選狀態存 localStorage（gridColumns.ts 單一來源），重整/跨頁記得住。 -->
    <div class="bonus-col-chips" data-test="bonus-col-chips">
      <span class="chips-label">顯示獎金欄：</span>
      <el-tag
        v-for="key in BONUS_COL_KEYS"
        :key="key"
        class="bonus-col-chip"
        :data-test="`bonus-col-chip-${key}`"
        :type="visibleBonusCols.has(key) ? 'primary' : 'info'"
        :effect="visibleBonusCols.has(key) ? 'dark' : 'plain'"
        style="cursor: pointer"
        @click="toggleBonusCol(key)"
      >{{ SPECIAL_BONUS_LABELS[key] ?? key }}</el-tag>

      <!-- 批次 A③：需注意列過濾（合計≤0／有備註／獎懲扣款≠0／未滿整年） -->
      <el-checkbox
        v-model="attentionOnly"
        class="attention-filter"
        data-test="attention-filter"
      >只顯示需注意（{{ attentionCount }}）</el-checkbox>
    </div>

    <!-- Grid table：6 欄摘要（姓名/主結算/特別獎金合計/合計/狀態/操作），零橫捲。
         原「展開」欄（Task 12①修 404 用）已移除——明細改由 Task 4 GridRowDetailDrawer
         抽屜承接（抽屜自建 specialBonusItems，未沿用本檔案任何舊 expand 邏輯）。 -->
    <el-table
      v-loading="loading"
      :data="displayedRows"
      border
      stripe
      max-height="640"
      data-test="grid-table"
    >
      <!-- 固定欄：姓名 -->
      <el-table-column
        prop="employee_name"
        label="姓名"
        width="120"
        fixed="left"
      />

      <!-- 主結算 -->
      <el-table-column label="主結算" width="130" align="right" class-name="money-cell" sortable :sort-method="sortByPayable">
        <template #default="{ row }">
          {{ moneyInt(row.payable_amount) }}
        </template>
      </el-table-column>

      <!-- 動態獎金欄：只渲染使用者勾選 chip 的 key（visibleBonusColumns），
           預設空集合 → 零欄，摘要表零橫捲。 -->
      <el-table-column
        v-for="col in visibleBonusColumns"
        :key="col.key"
        :label="col.label"
        width="118"
        align="right"
        sortable
        :sort-method="sortByBonusCol(col.key)"
        :class-name="`money-cell ${col.key === 'EXCESS_ENROLLMENT' || col.key === 'CUSTOM' ? 'yellow-col' : ''}`"
      >
        <template #header>
          <span
            :class="col.key === 'EXCESS_ENROLLMENT' || col.key === 'CUSTOM' ? 'yellow-header' : ''"
          >{{ col.label }}</span>
        </template>
        <template #default="{ row }">
          <span
            :class="col.key === 'EXCESS_ENROLLMENT' || col.key === 'CUSTOM' ? 'yellow-cell' : ''"
          >
            {{ moneyInt(row.special_bonuses[col.key] ?? 0) }}
          </span>
        </template>
      </el-table-column>

      <!-- 特別獎金合計：9 個常駐獎金欄的合計摘要，chips 全不勾時仍看得到總額
           （零橫捲摘要表的關鍵，明細留給展開 chip 或 Task 4 抽屜）。 -->
      <el-table-column label="特別獎金合計" width="140" align="right" class-name="money-cell" sortable :sort-method="sortBySpecialBonusTotal">
        <template #default="{ row }">
          {{ moneyInt(specialBonusTotal(row)) }}
        </template>
      </el-table-column>

      <!-- 合計 -->
      <el-table-column label="合計" width="145" align="right" class-name="money-cell" sortable :sort-method="sortByTotal">
        <template #default="{ row }">
          <strong class="total-amount">{{ moneyInt(row.total_amount) }}</strong>
        </template>
      </el-table-column>

      <!-- 狀態 -->
      <el-table-column label="狀態" width="110" align="center" sortable :sort-method="sortByStatus">
        <template #default="{ row }">
          <el-tag :type="SIGN_STATUS_TAG[row.status] || 'info'" size="small">
            {{ (SIGN_STATUS_LABEL as Record<string, string>)[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <!-- Task 4（批次2b-1）：「手改」改「明細」——所有 status 皆可開抽屜看 breakdown，
               就地編輯區僅 DRAFT 顯示（見 GridRowDetailDrawer 內 canEdit）。 -->
          <el-button
            size="small"
            data-test="detail-drawer-button"
            @click="openDrawer(row)"
          >
            明細
          </el-button>
          <a
            :href="`${baseUrl}/year_end/cycles/${cycleId}/settlements/${row.settlement_id}/slip.pdf`"
            target="_blank"
            class="slip-link"
          >
            <el-button size="small">明細條</el-button>
          </a>
        </template>
      </el-table-column>
    </el-table>

    <!-- 重新試算 dialog -->
    <el-dialog
      v-model="buildDialogVisible"
      title="重新試算"
      width="480px"
      data-test="build-dialog"
    >
      <p>將為所有在職員工試算年終結算單（idempotent）。</p>
      <p class="build-note">注意：已完成簽核（非 DRAFT）的結算不會被覆寫。</p>
      <p class="build-note">若需納入離職員工，請聯絡系統管理員透過 API 指定 <code>included_resigned_employee_ids</code>。</p>
      <template #footer>
        <el-button @click="buildDialogVisible = false">取消</el-button>
        <el-button type="primary" data-test="build-confirm-button" @click="onBuild">確認試算</el-button>
      </template>
    </el-dialog>

    <!-- Task 4（批次2b-1）：明細抽屜（breakdown ＋ 就地編輯），取代舊手改 dialog -->
    <GridRowDetailDrawer
      v-model="drawerVisible"
      :row="drawerRow"
      :can-write="canWrite"
      :cycle-id="cycleId"
      @saved="loadGrid"
    />
  </div>
</template>

<style scoped>
.year-end-grid-view {
  padding: var(--space-4);
}
.toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.title {
  margin: 0;
  font-size: 18px;
}
.last-built {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-left: auto;
}
.slip-link {
  text-decoration: none;
}
.total-amount {
  color: var(--el-color-primary);
  font-weight: 600;
}
.grid-alert {
  margin-bottom: var(--space-3);
}
.grid-expand {
  margin: var(--space-1) 0;
}
.bonus-col-chips {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}
.chips-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.bonus-col-chip {
  user-select: none;
}
.attention-filter {
  margin-left: var(--space-3);
}
.readiness-card {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3);
  border: 1px solid var(--el-color-success-light-5, #b3e19d);
  background: var(--el-color-success-light-9, #f0f9eb);
  border-radius: var(--radius-md, 6px); font-size: 13px;
}
.readiness-card--gated {
  border-color: var(--el-color-danger-light-5, #fab6b6);
  background: var(--el-color-danger-light-9, #fef0f0);
}
.readiness-card--failed {
  border-color: var(--el-color-warning-light-5, #f3d19e);
  background: var(--el-color-warning-light-9, #fdf6ec);
}
.readiness-card__title { font-weight: 600; }
.readiness-card__item { font-weight: 600; }
.readiness-card__text { color: var(--text-secondary); }
.readiness-card__link { margin-left: auto; white-space: nowrap; }
/* F-2：金額 cell 禁止在小數點/千分位逗號附近換行成兩行（稽核核對風險）；
   欄寬不足時交給 el-table 內建橫向捲動，不擠壓內容。 */
:deep(.money-cell .cell) {
  white-space: nowrap;
}
.yellow-header {
  background: #fefce8;
  padding: 2px var(--space-1);
  border-radius: 3px;
}
.yellow-cell {
  background: #fefce8;
  display: block;
}
.build-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: var(--space-1) 0;
}
</style>
