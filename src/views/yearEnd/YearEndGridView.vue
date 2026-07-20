<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getYearEndGrid, buildSettlements, manualPatchSettlement, listYearEndCycles } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { SIGN_STATUS_LABEL, SIGN_STATUS_TAG, SIGN_STATUS_ORDER } from '@/constants/appraisalYearEnd'
import api from '@/api/index'

// Derive row type from the typed API wrapper — no hand-written `any`.
type GridRow = Awaited<ReturnType<typeof getYearEndGrid>>['data'][number]

// listYearEndCycles() 無單筆 cycle-by-id 端點，沿用 YearEndDetailView.vue 的
// listYearEndCycles().find() 慣例；只取 grid 進頁 auto-build 判斷需要的最小欄位集。
interface YearEndCycleLite {
  id: number
  status: string
}

// F-2：總表金額統一顯示為整數元（僅顯示層四捨五入，row.* 原始資料值不動、
// 送出/核對仍用原始精度）。「主結算」「合計」帶兩位小數與「考核上」「紅利上」
// 等整數欄並列時視覺突兀，也讓欄寬更容易不夠而在小數點附近換行。
// GridRowOut 的金額欄位（payable_amount / total_amount / special_bonuses[key]）
// 是後端 Decimal 序列化的字串，先 Number() 轉換再四捨五入。null/'' 直接交給
// money() 走既有「—」fallback（Number(null)===0 / Number('')===0 會誤判成
// 有效值，故先排除）。
const moneyInt = (val: unknown) => {
  if (val == null || val === '') return money(val)
  const n = Number(val)
  return Number.isFinite(n) ? money(Math.round(n)) : money(val)
}

const SPECIAL_BONUS_LABELS: Record<string, string> = {
  APPRAISAL_HALF_BONUS_FIRST: '考核上',
  APPRAISAL_HALF_BONUS_SECOND: '考核下',
  SEMESTER_DIVIDEND_FIRST: '紅利上',
  SEMESTER_DIVIDEND_SECOND: '紅利下',
  AFTER_CLASS_AWARD: '才藝鼓勵',
  TEACHING_EXTRA: '教課獎勵',
  EXCESS_ENROLLMENT: '超額',
  FESTIVAL_DIFF: '節慶差額',
  CUSTOM: '其他',
}

// Task 12④：狀態 tag/標籤改用單一來源常數（刪本地 STATUS_LABELS/STATUS_TAG_TYPE
// 雙重定義——Task 1 已建立 @/constants/appraisalYearEnd 的 SIGN_STATUS_LABEL/
// SIGN_STATUS_TAG，本檔原本各自維護一份，內容雖一致但屬未收斂的重複定義）。

const route = useRoute()
const cycleId = Number(route.params.id)

const rows = ref<GridRow[]>([])
const loading = ref(false)

const canWrite = computed(() => hasPermission('YEAR_END_WRITE'))

// 進頁自動 build（Task 9）：cycle 狀態（判斷是否為封存 CLOSED）+ 最後一次觸發試算的
// 本地時間戳。後端 BuildResultOut 無 timestamp，這裡只記「有嘗試過」，不代表一定成功
// ——失敗走靜默降級（見 initGrid），手動「↻ 重新試算」按鈕維持現狀不受影響。
const cycleStatus = ref<string | null>(null)
const lastBuiltAt = ref<Date | null>(null)

// Task 12②③：build 結果摘要（成功，取代「只彈一次 ElMessage」的常駐頁頂摘要列）與
// 失敗降級提示（進頁自動試算失敗時不再完全靜默，改顯示 stale banner）。
interface BuildSummary {
  built: number
  skipped_finalized: number
  unmatched_count: number
  fallback_classes: number
  warnings: string[]
}
const buildResult = ref<BuildSummary | null>(null)
const buildFailed = ref(false)

// ---- 重新試算 dialog ----
const buildDialogVisible = ref(false)

// ---- 手改 dialog ----
const editVisible = ref(false)
const editingRow = ref<GridRow | null>(null)
const editForm = reactive({
  deduction_disciplinary: null as number | null,
  excess_amount: null as number | null,
  hire_months_override: null as number | null,
  remark: null as string | null,
})

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

const baseUrl = computed(() => api.defaults.baseURL || '/api')

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

// Task 12③：stale banner 描述——曾成功試算過就顯示最後成功時間，否則給明確的
// 「從未成功過」文案（lastBuiltAt 只在成功時寫入，見 initGrid/onBuild）。
const buildFailedDescription = computed(() =>
  lastBuiltAt.value
    ? `最後成功試算時間 ${formatTime(lastBuiltAt.value)}`
    : '尚無成功試算紀錄，目前顯示既有結算資料'
)

// Task 12①：原「展開」按鈕 push 到不存在的 /year_end/cycles/:id/settlements/:id
// （本輪最嚴重的 404 硬傷）。改列內 expand（el-table-column type="expand"）就地
// 展開，這裡把主結算全部欄位（含動態獎金欄，沿用 bonusColumns 既有定義）攤平成
// label/value pairs 給 el-descriptions 用。
// Task 8③：金額改用 moneyInt（與主列一致，見 F-2 註解），原本用 formatCurrency
// 顯示原始精度會與同一筆金額的主列（已四捨五入）不一致，造成使用者誤以為兩者
// 是不同數字；展開列與主列本就同源同筆資料，理應顯示同一個數字。
interface ExpandField {
  label: string
  value: string
}

function expandFields(row: GridRow): ExpandField[] {
  const fields: ExpandField[] = [
    { label: '主結算', value: moneyInt(row.payable_amount) },
  ]
  for (const col of bonusColumns.value) {
    fields.push({ label: col.label, value: moneyInt(row.special_bonuses[col.key] ?? 0) })
  }
  fields.push({ label: '合計', value: moneyInt(row.total_amount) })
  fields.push({ label: '狀態', value: (SIGN_STATUS_LABEL as Record<string, string>)[row.status] ?? row.status })
  fields.push({ label: '備註', value: row.remark || '—' })
  return fields
}

// Task 12②③共用：build 成功的副作用（記錄摘要 + 清 stale flag + 記時間戳）。
// initGrid 的自動試算與 onBuild 的手動試算共用同一套「成功後怎麼辦」語意。
function applyBuildSuccess(data: BuildSummary) {
  buildResult.value = data
  buildFailed.value = false
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

// 進頁自動 build（Task 9）：**fail-closed** — 只在正向確認為 OPEN 狀態
// 且可寫時才自動試算，再讀。
// 後端 build-settlements 現在對 LOCKED cycle 一律拒絕（cycle_guard，年終批次2 G2
// 週期鎖定），故僅 OPEN 才自動重算；一次網路抖動讓 listYearEndCycles 失敗
// （.catch → []）或 cycleId 找不到時 cycleStatus 退為 null，若誤判為可重算會對
// 已鎖定/封存 cycle 發出注定失敗的 build 請求。故狀態未知（null）/LOCKED/CLOSED
// 一律跳過只 loadGrid。
async function initGrid() {
  const cycles = await listYearEndCycles()
    .then((res) => res.data as YearEndCycleLite[])
    .catch(() => [] as YearEndCycleLite[])
  const cycle = cycles.find((c) => c.id === cycleId)
  cycleStatus.value = cycle?.status ?? null
  if (canWrite.value && cycleStatus.value === 'OPEN') {
    try {
      const res = await buildSettlements(cycleId, { included_resigned_employee_ids: [] })
      // 成功後才記時間戳（+ 摘要 + 清 stale flag）：語意是「最後成功試算」而非「嘗試」。
      applyBuildSuccess(res.data)
    } catch {
      // Task 12③：進頁自動試算失敗不再完全靜默——仍不彈 dialog/ElMessage、仍照常
      // loadGrid 沿用既有結算資料（不打斷閱讀），但改用頁頂 stale banner 讓使用者
      // 知道目前看到的是上次試算資料而非「一切正常」的假象。手動「↻ 重新試算」按鈕
      // 維持現狀可兜底重試（觸發條件不變，只改失敗時的回饋方式）。
      buildFailed.value = true
    }
  }
  await loadGrid()
}

async function onBuild() {
  try {
    const res = await buildSettlements(cycleId, { included_resigned_employee_ids: [] })
    const { built, skipped_finalized, unmatched_count, fallback_classes, warnings } = res.data
    // Task 12②：手動「↻ 重新試算」的成功結果也套用同一套「常駐摘要列」語意
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

function openEdit(row: GridRow) {
  editingRow.value = row
  editForm.deduction_disciplinary = null
  editForm.excess_amount = null
  editForm.hire_months_override = null
  editForm.remark = row.remark ?? null
  editVisible.value = true
}

async function submitEdit() {
  if (!editingRow.value) return
  const payload: {
    deduction_disciplinary?: number
    excess_amount?: number
    hire_months_override?: number
    remark?: string
  } = {}
  if (editForm.deduction_disciplinary !== null) {
    payload.deduction_disciplinary = editForm.deduction_disciplinary
  }
  if (editForm.excess_amount !== null) {
    payload.excess_amount = editForm.excess_amount
  }
  if (editForm.hire_months_override !== null) {
    payload.hire_months_override = editForm.hire_months_override
  }
  if (editForm.remark !== null) {
    payload.remark = editForm.remark
  }
  try {
    await manualPatchSettlement(editingRow.value.settlement_id, payload)
    await loadGrid()
    ElMessage.success('已更新')
    editVisible.value = false
  } catch (e) {
    ElMessage.error(
      apiError(e, '更新失敗：僅草稿狀態可手動調整；已簽核者請先到「結算明細」將該筆退回草稿')
    )
  }
}

defineExpose({
  rows, loading, bonusColumns, canWrite,
  loadGrid, onBuild, openEdit, submitEdit,
  buildDialogVisible, editVisible, editingRow, editForm,
  cycleStatus, lastBuiltAt, initGrid,
  expandFields, buildResult, buildFailed, buildSummaryText, buildFailedDescription,
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
          v-if="canWrite"
          type="primary"
          data-test="build-button"
          @click="buildDialogVisible = true"
        >
          ↻ 重新試算
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
         （呼應 initGrid 的 fail-closed 語意：LOCKED/CLOSED 不再自動 build）。 -->
    <el-alert
      v-if="cycleStatus && cycleStatus !== 'OPEN'"
      type="info" :closable="false" show-icon
      :title="`週期${cycleStatus === 'LOCKED' ? '已鎖定' : '已封存'}：本頁為最後一次試算結果，開啟頁面不會重新試算。`"
      class="grid-alert"
      data-test="non-open-banner"
    />

    <!-- Task 12③：進頁自動試算失敗 stale banner（原本完全靜默降級，見 initGrid） -->
    <el-alert
      v-if="buildFailed"
      type="warning"
      closable
      title="自動試算失敗，目前顯示上次試算資料"
      :description="buildFailedDescription"
      data-test="build-failed-banner"
      class="grid-alert"
      @close="buildFailed = false"
    />

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

    <!-- Grid table -->
    <el-table
      v-loading="loading"
      :data="rows"
      border
      stripe
      max-height="640"
      data-test="grid-table"
    >
      <!-- Task 12①：修 404——原「展開」按鈕 push 到不存在的 /settlements/:id 路由，
           改列內 expand 就地展開，內容見 expandFields()。
           fixed="left" 必要（審查修繕）：Element Plus 欄位排序（watcher.mjs）會把所有
           fixed:left 欄放最前、不保留模板宣告順序，未 fixed 的 expand 欄會被重排到姓名欄
           （fixed="left"）之後；且本表欄寬總和 ~1767px 必觸發橫向捲動，未 fixed 的
           expand 欄捲動後會滾出視窗，使用者失去展開把手。 -->
      <el-table-column type="expand" width="40" fixed="left" data-test="expand-column">
        <template #default="{ row }">
          <el-descriptions :column="3" size="small" border class="grid-expand">
            <el-descriptions-item
              v-for="col in expandFields(row)"
              :key="col.label"
              :label="col.label"
            >{{ col.value }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </el-table-column>

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

      <!-- 動態獎金欄 -->
      <el-table-column
        v-for="col in bonusColumns"
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
          <el-button
            v-if="row.status === 'DRAFT' && canWrite"
            size="small"
            data-test="edit-button"
            @click="openEdit(row)"
          >
            手改
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

    <!-- 手改 dialog -->
    <el-dialog
      v-model="editVisible"
      :title="`手動調整 — ${editingRow?.employee_name ?? ''}`"
      width="420px"
      data-test="edit-dialog"
    >
      <el-form label-width="130px" label-position="right">
        <el-form-item label="獎懲扣項（≤0）">
          <el-input-number
            v-model="editForm.deduction_disciplinary"
            :max="0"
            :step="100"
            controls-position="right"
            style="width: 200px"
            placeholder="留空=不覆寫"
            :value-on-clear="null"
            data-test="input-deduction"
          />
        </el-form-item>
        <el-form-item label="超額獎金（≥0）">
          <el-input-number
            v-model="editForm.excess_amount"
            :min="0"
            :step="100"
            controls-position="right"
            style="width: 200px"
            placeholder="留空=不覆寫"
            :value-on-clear="null"
            data-test="input-excess"
          />
        </el-form-item>
        <el-form-item label="到職月數覆寫">
          <el-input-number
            v-model="editForm.hire_months_override"
            :min="0"
            :max="12"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 200px"
            placeholder="留空=不覆寫"
            :value-on-clear="null"
            data-test="input-hire-months"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input
            v-model="editForm.remark"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="留空=清除備註"
            data-test="input-remark"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" data-test="edit-submit-button" @click="submitEdit">確認更新</el-button>
      </template>
    </el-dialog>
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
