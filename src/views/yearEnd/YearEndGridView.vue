<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getYearEndGrid, buildSettlements, manualPatchSettlement, listYearEndCycles } from '@/api/yearEnd'
import { money } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SUPERVISOR_SIGNED: '主管已簽',
  ACCOUNTING_SIGNED: '會計已簽',
  FINALIZED: '已核定',
}

type ElTagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

const STATUS_TAG_TYPE: Record<string, ElTagType> = {
  DRAFT: 'info',
  SUPERVISOR_SIGNED: 'warning',
  ACCOUNTING_SIGNED: 'primary',
  FINALIZED: 'success',
}

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const rows = ref<GridRow[]>([])
const loading = ref(false)

const canWrite = computed(() => hasPermission('YEAR_END_WRITE'))

// 進頁自動 build（Task 9）：cycle 狀態（判斷是否為封存 CLOSED）+ 最後一次觸發試算的
// 本地時間戳。後端 BuildResultOut 無 timestamp，這裡只記「有嘗試過」，不代表一定成功
// ——失敗走靜默降級（見 initGrid），手動「↻ 重新試算」按鈕維持現狀不受影響。
const cycleStatus = ref<string | null>(null)
const lastBuiltAt = ref<Date | null>(null)

// ---- 重新試算 dialog ----
const buildDialogVisible = ref(false)

// ---- 手改 dialog ----
const editVisible = ref(false)
const editingRow = ref<GridRow | null>(null)
const editForm = reactive({
  deduction_disciplinary: null as number | null,
  excess_amount: null as number | null,
  hire_months_override: null as number | null,
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

// lastBuiltAt 是本地 Date（非後端 ISO 字串，BuildResultOut 無 timestamp），近複製
// CurrentSemesterOverview.vue 的 formatTime 慣例但省去 ISO parse 這步。
function formatTime(d: Date | null) {
  if (!d) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
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
      await buildSettlements(cycleId, { included_resigned_employee_ids: [] })
      // 成功後才記時間戳：語意是「最後成功試算」而非「嘗試」。build 失敗（catch）不設。
      lastBuiltAt.value = new Date()
    } catch {
      // 靜默降級：進頁自動試算失敗不打斷閱讀，沿用既有結算資料
      // （不彈 dialog、不顯示訊息；手動「↻ 重新試算」按鈕維持現狀可兜底重試）
    }
  }
  await loadGrid()
}

async function onBuild() {
  try {
    const res = await buildSettlements(cycleId, { included_resigned_employee_ids: [] })
    const { built, skipped_finalized, unmatched_count, fallback_classes, warnings } = res.data
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
  editVisible.value = true
}

async function submitEdit() {
  if (!editingRow.value) return
  const payload: {
    deduction_disciplinary?: number
    excess_amount?: number
    hire_months_override?: number
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
  try {
    await manualPatchSettlement(editingRow.value.settlement_id, payload)
    await loadGrid()
    ElMessage.success('已更新')
    editVisible.value = false
  } catch {
    ElMessage.error('更新失敗，請確認結算單狀態')
  }
}

function openDetail(row: GridRow) {
  router.push(`/year_end/cycles/${cycleId}/settlements/${row.settlement_id}`)
}

defineExpose({
  rows, loading, bonusColumns, canWrite,
  loadGrid, onBuild, openEdit, submitEdit,
  buildDialogVisible, editVisible, editingRow, editForm,
  cycleStatus, lastBuiltAt, initGrid,
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
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/summary.xlsx`"
          target="_blank"
          class="export-link"
        >
          <el-button>總表 Excel</el-button>
        </a>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/summary.pdf`"
          target="_blank"
          class="export-link"
        >
          <el-button>總表 PDF</el-button>
        </a>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/transfer_roster.xlsx`"
          target="_blank"
          class="export-link"
        >
          <el-button>轉帳名冊 Excel</el-button>
        </a>
        <a
          :href="`${baseUrl}/year_end/cycles/${cycleId}/transfer_roster.pdf`"
          target="_blank"
          class="export-link"
        >
          <el-button>轉帳名冊 PDF</el-button>
        </a>
      </div>
    </header>

    <!-- Grid table -->
    <el-table
      v-loading="loading"
      :data="rows"
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
      <el-table-column label="主結算" width="130" align="right" class-name="money-cell">
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
      <el-table-column label="合計" width="145" align="right" class-name="money-cell">
        <template #default="{ row }">
          <strong class="total-amount">{{ moneyInt(row.total_amount) }}</strong>
        </template>
      </el-table-column>

      <!-- 狀態 -->
      <el-table-column label="狀態" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG_TYPE[row.status] || 'info'" size="small">
            {{ STATUS_LABELS[row.status] ?? row.status }}
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
          <el-button
            size="small"
            data-test="detail-button"
            @click="openDetail(row)"
          >
            展開
          </el-button>
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
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.title {
  margin: 0;
  font-size: 18px;
}
.last-built {
  color: #909399;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}
.export-link,
.slip-link {
  text-decoration: none;
}
.total-amount {
  color: #409eff;
  font-weight: 600;
}
/* F-2：金額 cell 禁止在小數點/千分位逗號附近換行成兩行（稽核核對風險）；
   欄寬不足時交給 el-table 內建橫向捲動，不擠壓內容。 */
:deep(.money-cell .cell) {
  white-space: nowrap;
}
.yellow-header {
  background: #fefce8;
  padding: 2px 4px;
  border-radius: 3px;
}
.yellow-cell {
  background: #fefce8;
  display: block;
}
.build-note {
  color: #909399;
  font-size: 13px;
  margin: 4px 0;
}
</style>
