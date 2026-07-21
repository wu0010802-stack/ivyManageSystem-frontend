<script setup lang="ts">
/**
 * ScorePreviewDialog — 分數同步（合併預覽 + 同步）
 *
 * Task A4：把原本分離的「預覽分數」（唯讀 26 欄矩陣，`score_preview`）與
 * 「同步分數」（`sync_score_items` dry-run → 確認寫入）合併為單一 dialog。
 * 開啟即並行載入兩者：
 *   - `previewAppraisalScore(cycleId)` → 每位參與者 × 14 個 ScoreItemCode 的 delta，
 *     表格顯示；紅色 = current_db_value 與 delta 不同。
 *   - `syncAppraisalScoreItems(cycleId, { dryRun: true })` → 同步差異摘要
 *     （deleted_count / inserted_count / skipped_manual_count）。
 * 底部「確認寫入」（僅 canWrite 才顯示）呼叫 `syncAppraisalScoreItems(cycleId, { dryRun: false })`
 * 實際寫入，成功後 emit `synced` 讓 parent refresh。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { previewAppraisalScore, syncAppraisalScoreItems } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { ITEM_CODE_LABELS, ITEM_CODES_ORDER } from '@/views/appraisal/scoreItemLabels'

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

async function loadPreview() {
  if (!props.cycleId) return
  loading.value = true
  previewError.value = false
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
  await Promise.all([loadPreview(), loadSyncDryRun()])
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
        v-else-if="syncDry"
        type="info"
        :closable="false"
        class="sync-alert"
        data-test="sync-diff-banner"
      >
        本次同步將寫入 {{ syncDry.inserted_count ?? 0 }} 筆、移除 {{ syncDry.deleted_count ?? 0 }} 筆、
        保留手動 {{ syncDry.skipped_manual_count ?? 0 }} 筆
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
          v-for="code in ITEM_CODES_ORDER"
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
            v-if="canWrite"
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

.diff {
  color: var(--el-color-danger);
  font-weight: 600;
}

.preview-table {
  width: 100%;
}
</style>
