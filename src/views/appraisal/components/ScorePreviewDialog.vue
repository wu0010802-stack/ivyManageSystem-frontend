<script setup lang="ts">
/**
 * ScorePreviewDialog — 分數同步（合併預覽 + 同步）
 *
 * Task A4：把原本分離的「預覽分數」（唯讀 26 欄矩陣，`score_preview`）與
 * 「同步分數」（`sync_score_items` dry-run → 確認寫入）合併為單一 dialog。
 *   - `previewAppraisalScore(cycleId)` → 每位參與者 × 24 個 ScoreItemCode 的 delta
 *     （加上員工欄與合計欄共 26 欄），表格顯示；紅色 = current_db_value 與 delta 不同。
 *     此端點僅需 `APPRAISAL_READ`、不檢查 cycle 狀態，開啟即**永遠**載入。
 *   - `syncAppraisalScoreItems(cycleId, { dryRun: true })` → 同步差異摘要
 *     （deleted_count / inserted_count / skipped_manual_count）。此端點後端一律要求
 *     `APPRAISAL_EVENT_WRITE` 且 cycle 非 OPEN 直接 400——**只有** `canWrite &&
 *     cycleStatus === 'OPEN'` 時才呼叫，否則顯示中性唯讀訊息（不可誤判為錯誤）。
 * 底部「確認寫入」與同步差異摘要 banner 同樣只在 `canWrite && cycleStatus === 'OPEN'`
 * 時 render；呼叫 `syncAppraisalScoreItems(cycleId, { dryRun: false })` 實際寫入，
 * 成功後 emit `synced` 讓 parent refresh。
 *
 * Task A5：26 欄矩陣加欄位開關 chips（比照批次 2b-1 `yearEnd/gridColumns.ts` +
 * `YearEndGridView.vue` pattern，見 `scorePreviewColumns.ts`）。預設只顯示「有異動的
 * 欄」（`computeChangedColumns`），使用者可經 chips 增減，覆寫存 localStorage
 * （`loadVisibleScoreColOverride` 回傳 `null` 代表未曾覆寫過，才落回異動欄預設；一旦
 * 使用者點過 chip，即使結果變成空集合也視為「已覆寫」，不再套用異動欄預設）。員工欄與
 * 合計欄不受此開關控制、恆顯示。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { previewAppraisalScore, syncAppraisalScoreItems } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { ITEM_CODE_LABELS, ITEM_CODES_ORDER } from '@/views/appraisal/scoreItemLabels'
import {
  loadVisibleScoreColOverride,
  saveVisibleScoreColOverride,
  computeChangedColumns,
  type ScorePreviewParticipant,
} from '@/views/appraisal/scorePreviewColumns'

interface ScoreItem { item_code?: string; delta?: number | string | null; current_db_value?: number | string | null; raw_value?: unknown; note?: string }
interface PreviewParticipant { participant_id?: number; employee_name?: string; items?: ScoreItem[] }
interface PreviewData { participants?: PreviewParticipant[] }
interface SyncResultData {
  deleted_count?: number
  inserted_count?: number
  skipped_manual_count?: number
  items?: unknown[]
}

const props = withDefaults(
  defineProps<{
    visible?: boolean
    cycleId?: number | null
    canWrite?: boolean
    hasNonParticipant?: boolean
    cycleStatus?: 'OPEN' | 'LOCKED' | 'CLOSED'
  }>(),
  { visible: false, cycleId: null, canWrite: false, hasNonParticipant: false },
)
const emit = defineEmits<{
  'update:visible': [value: boolean]
  synced: []
}>()

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const loading = ref(false)
const previewError = ref(false)
const data = ref<PreviewData | null>(null)
const showDiffOnly = ref(false)
const sortMode = ref('total')

const syncLoading = ref(false)
const syncError = ref(false)
const syncDry = ref<SyncResultData | null>(null)
const writing = ref(false)

// canSync：只有有寫入權限「且」cycle 正在 OPEN 才可打 sync 端點（後端 sync_score_items
// 一律要求 APPRAISAL_EVENT_WRITE，且 cycle 非 OPEN 直接 400）。score_preview 端點僅需
// APPRAISAL_READ、不檢查 cycle 狀態，因此唯讀矩陣不受此限制。
const canSync = computed(() => props.canWrite && props.cycleStatus === 'OPEN')

// Task A5：26 欄矩陣的欄位開關。載入 preview 後（見 onOpen → applyVisibleColsDefault）
// 才會有實質內容；初始空集合只是佔位，避免 dialog 尚未載入資料時就出現一閃而過的空表。
const visibleCols = ref<Set<string>>(new Set())

function toggleCol(code: string) {
  const next = new Set(visibleCols.value)
  if (next.has(code)) {
    next.delete(code)
  } else {
    next.add(code)
  }
  visibleCols.value = next
  saveVisibleScoreColOverride(next)
}

// 26 欄矩陣實際渲染的欄：ITEM_CODES_ORDER 交集 visibleCols，比照
// `YearEndGridView.vue` 的 `visibleBonusColumns` 既有寫法（先算好過濾後的陣列再單純
// v-for），刻意不在 el-table-column 上同時寫 v-for + v-if——Vue 3 起同一元素上
// v-if 優先權高於 v-for，會讀不到 v-for 迴圈變數，是已知反樣式。
const visibleItemCodes = computed(() =>
  ITEM_CODES_ORDER.filter((code) => visibleCols.value.has(code)),
)

// 載入 26 欄矩陣後套用欄位開關預設：使用者曾覆寫過（loadVisibleScoreColOverride
// 非 null，即使覆寫結果是空集合也算）就沿用覆寫；否則預設只顯示「有異動的欄」
// （computeChangedColumns），避免 26 欄一次全展開造成橫向捲動。
function applyVisibleColsDefault() {
  const override = loadVisibleScoreColOverride()
  if (override) {
    visibleCols.value = override
    return
  }
  const participants: ScorePreviewParticipant[] = (data.value?.participants ?? []).map((p) => ({
    participant_id: p.participant_id ?? 0,
    employee_name: p.employee_name ?? '',
    items: (p.items ?? []).map((it) => ({
      item_code: it.item_code ?? '',
      delta: Number(it.delta ?? 0),
      current_db_value: Number(it.current_db_value ?? 0),
    })),
  }))
  visibleCols.value = computeChangedColumns(participants)
}

async function loadPreview() {
  if (!props.cycleId) return
  loading.value = true
  previewError.value = false
  data.value = null
  try {
    const r = await previewAppraisalScore(props.cycleId)
    data.value = r.data as PreviewData
  } catch (e) {
    previewError.value = true
    ElMessage.error(apiError(e, '預覽分數失敗'))
  } finally {
    loading.value = false
  }
}

async function loadSyncDryRun() {
  if (!props.cycleId) return
  syncLoading.value = true
  syncError.value = false
  syncDry.value = null
  try {
    const r = await syncAppraisalScoreItems(props.cycleId, { dryRun: true })
    syncDry.value = r.data as SyncResultData
  } catch (e) {
    syncError.value = true
    syncDry.value = null
    ElMessage.error(apiError(e, '同步差異預覽失敗'))
  } finally {
    syncLoading.value = false
  }
}

async function onOpen() {
  if (!props.cycleId) return
  // 唯讀矩陣永遠載入（任何有 APPRAISAL_READ 的人都能看）；sync dry-run 只有
  // canSync（有寫入權限且 cycle 為 OPEN）才打，避免只有 READ 權限或 cycle
  // 非 OPEN 的使用者一開 dialog 就撞後端 403/400。
  const tasks: Promise<void>[] = [loadPreview()]
  if (canSync.value) {
    tasks.push(loadSyncDryRun())
  } else {
    // 明確清空，避免切換 cycle/canWrite 後殘留上一次的同步差異或錯誤狀態
    syncDry.value = null
    syncError.value = false
  }
  await Promise.all(tasks)
  applyVisibleColsDefault()
}

watch(
  () => [props.visible, props.cycleId],
  ([v]) => { if (v) onOpen() },
  { immediate: true },
)

function itemByCode(participant: PreviewParticipant, code: string) {
  return participant.items?.find((i) => i.item_code === code)
}

function hasDiff(item: ScoreItem | undefined) {
  if (!item) return false
  if (item.current_db_value == null) return false
  return Number(item.current_db_value) !== Number(item.delta)
}

function participantTotal(p: PreviewParticipant) {
  let sum = 0
  for (const it of p?.items ?? []) {
    const n = Number(it.delta)
    if (Number.isFinite(n)) sum += n
  }
  return sum
}

function fmtNum(n: number) {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 100) / 100)
}

const filteredParticipants = computed(() => {
  const list = data.value?.participants ?? []
  const filtered = showDiffOnly.value
    ? list.filter((p) => p.items?.some(hasDiff))
    : [...list]
  if (sortMode.value === 'name') {
    return filtered.sort((a, b) =>
      (a.employee_name || '').localeCompare(b.employee_name || '', 'zh-Hant'),
    )
  }
  return filtered.sort(
    (a, b) => Math.abs(participantTotal(b)) - Math.abs(participantTotal(a)),
  )
})

// 失敗降級不 fail-open：同步差異摘要載入失敗或尚未就緒時，即使 hasNonParticipant
// 為 false 也不可讓「確認寫入」可點——沒有可信的 dry-run 差異就不該直接寫入。
const confirmDisabled = computed(() => props.hasNonParticipant || !syncDry.value)

async function confirmSync() {
  if (!props.cycleId) return
  try {
    await ElMessageBox.confirm(
      '確認把預覽的分數同步寫入？此動作會覆寫自動計算欄位。',
      '確認同步分數',
      { type: 'warning' },
    )
  } catch {
    return
  }
  writing.value = true
  try {
    const r = await syncAppraisalScoreItems(props.cycleId, { dryRun: false })
    const d = r.data as SyncResultData
    ElMessage.success(
      `同步完成：新增 ${d.inserted_count ?? 0} 筆、移除 ${d.deleted_count ?? 0} 筆、保留手動 ${d.skipped_manual_count ?? 0} 筆`,
    )
    emit('synced')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(apiError(e, '同步寫入失敗'))
  } finally {
    writing.value = false
  }
}

function tooltipLines(row: PreviewParticipant, code: string) {
  const it = itemByCode(row, code)
  if (!it) return []
  const lines: string[] = []
  if (it.raw_value != null && it.raw_value !== '') {
    lines.push(`原始值：${it.raw_value}`)
  }
  if (it.current_db_value != null) {
    lines.push(`目前系統值：${it.current_db_value}`)
  }
  if (it.note) {
    lines.push(`備註：${it.note}`)
  }
  return lines
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="分數同步"
    width="90%"
    data-test="score-preview-dialog"
  >
    <div v-loading="loading || syncLoading">
      <el-alert
        v-if="previewError"
        type="error"
        :closable="false"
        class="preview-alert"
        data-test="preview-error-alert"
      >
        分數計算矩陣載入失敗，請重新開啟本視窗再試一次。
      </el-alert>
      <el-alert v-else type="warning" :closable="false" class="preview-alert">
        此為 dry-run 預覽，<strong>尚未寫入資料庫</strong>。紅色標示 = 與目前系統分數不同；
        下方為本次同步將產生的異動摘要，確認無誤後可點右下角「確認寫入」。
      </el-alert>

      <el-alert
        v-if="syncError"
        type="error"
        :closable="false"
        class="sync-alert"
        data-test="sync-diff-error-alert"
      >
        同步差異摘要載入失敗，暫不可確認寫入，請重新開啟本視窗再試一次。
      </el-alert>
      <el-alert
        v-else-if="canSync && syncDry"
        type="info"
        :closable="false"
        class="sync-alert"
        data-test="sync-diff-banner"
      >
        本次同步將寫入 {{ syncDry.inserted_count ?? 0 }} 筆、移除 {{ syncDry.deleted_count ?? 0 }} 筆、
        保留手動 {{ syncDry.skipped_manual_count ?? 0 }} 筆
      </el-alert>
      <el-alert
        v-else-if="!canSync"
        type="info"
        :closable="false"
        class="sync-alert"
        data-test="sync-diff-skipped-note"
      >
        無寫入權限或此週期非進行中，僅顯示唯讀分數矩陣
      </el-alert>

      <div class="preview-toolbar">
        <el-switch
          v-model="showDiffOnly"
          active-text="只看有變動"
          data-test="filter-diff-only"
        />
        <el-radio-group v-model="sortMode" size="small" data-test="sort-mode">
          <el-radio-button label="total">依總變動排序</el-radio-button>
          <el-radio-button label="name">依員工姓名</el-radio-button>
        </el-radio-group>
        <span class="preview-count" data-test="participant-count">
          顯示 {{ filteredParticipants.length }} / {{ data?.participants?.length ?? 0 }} 人
        </span>
      </div>

      <!-- Task A5：26 欄開關 chips——預設只顯示有異動的欄（applyVisibleColsDefault），
           使用者可點 chip 增減，覆寫存 localStorage（scorePreviewColumns.ts 單一來源）。
           比照 YearEndGridView 獎金欄開關 chips 樣式。 -->
      <div v-if="data" class="score-col-chips" data-test="score-col-chips">
        <span class="chips-label">顯示分數欄：</span>
        <el-tag
          v-for="code in ITEM_CODES_ORDER"
          :key="code"
          class="score-col-chip"
          :data-test="`score-col-chip-${code}`"
          :type="visibleCols.has(code) ? 'primary' : 'info'"
          :effect="visibleCols.has(code) ? 'dark' : 'plain'"
          @click="toggleCol(code)"
        >{{ (ITEM_CODE_LABELS as Record<string, string>)[code] || code }}</el-tag>
      </div>

      <el-table
        v-if="data"
        :data="filteredParticipants"
        max-height="500"
        stripe
        class="preview-table"
        data-test="preview-table"
      >
        <el-table-column label="員工" prop="employee_name" width="100" fixed />
        <el-table-column
          v-for="code in visibleItemCodes"
          :key="code"
          :label="(ITEM_CODE_LABELS as Record<string, string>)[code] || code"
          :min-width="110"
        >
          <template #default="{ row }">
            <el-tooltip
              placement="top"
              :disabled="tooltipLines(row, code).length === 0"
            >
              <template #content>
                <div
                  v-for="line in tooltipLines(row, code)"
                  :key="line"
                  :data-test="`tip-${row.participant_id}-${code}`"
                >
                  {{ line }}
                </div>
              </template>
              <span
                :class="{ diff: hasDiff(itemByCode(row, code)) }"
                :data-test="`delta-${row.participant_id}-${code}`"
              >
                {{ itemByCode(row, code)?.delta ?? '—' }}
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="合計" :min-width="90" fixed="right">
          <template #default="{ row }">
            <span
              :class="{ diff: Math.abs(participantTotal(row)) > 1e-9 }"
              :data-test="`total-${row.participant_id}`"
            >
              {{ fmtNum(participantTotal(row)) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <template #footer>
      <el-button data-test="close-btn" @click="dialogVisible = false">關閉</el-button>
      <el-tooltip content="請先把所有教師加入考核再同步" :disabled="!hasNonParticipant">
        <span>
          <el-button
            v-if="canSync"
            data-test="confirm-sync-btn"
            type="primary"
            :disabled="confirmDisabled"
            :loading="writing"
            @click="confirmSync"
          >
            確認寫入
          </el-button>
        </span>
      </el-tooltip>
    </template>
  </el-dialog>
</template>

<style scoped>
.preview-alert {
  margin-bottom: var(--space-3);
}

.sync-alert {
  margin-bottom: var(--space-3);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.preview-count {
  color: var(--el-text-color-secondary);
  font-size: var(--text-sm);
  margin-left: auto;
}

.score-col-chips {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

.chips-label {
  color: var(--el-text-color-secondary);
  font-size: var(--text-sm);
}

.score-col-chip {
  cursor: pointer;
  user-select: none;
}

.diff {
  color: var(--el-color-danger);
  font-weight: 600;
}

.preview-table {
  width: 100%;
}
</style>
