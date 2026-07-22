<script setup lang="ts">
/**
 * PenaltyCatalogPanel — 扣分項目目錄（16 項加減分定義）中繼資料維護
 *
 * 對應後端 GET /appraisal/catalog（既有）＋ PATCH /appraisal/catalog/{item_id}（新增）。
 * 項目集合（code / sign）由 ScoreItemCode enum 與 seed 治理，不開放新增/刪除；
 * 本面板只維護顯示用中繼資料：label / default_weight / data_source / description /
 * display_order / is_active。PATCH 採 exclude_unset 語意，前端建 payload 時只送異動欄位。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { listAppraisalCatalog, patchAppraisalCatalogItem } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import type { ApiBody, Schema } from '@/api/_generated/typed'

type CatalogItem = Schema<'CatalogOut'>
type ScoreSign = CatalogItem['sign']
type CatalogPatchPayload = ApiBody<'/appraisal/catalog/{item_id}', 'patch'>

// data_source / description 編輯狀態內一律以 string 承接（null → ''），方便 el-input
// v-model 綁定；送出 PATCH 前才在 buildDiff 正規化回 string | null。
interface CatalogEdit {
  label: string
  default_weight: number
  data_source: string
  description: string
  display_order: number
}

// P0-A 對齊 ScoringRulesPanel：目錄中繼資料編輯由後端 APPRAISAL_RULE_WRITE 守衛。
const canEdit = computed(() => hasPermission('APPRAISAL_RULE_WRITE'))

const items = ref<CatalogItem[]>([])
const loading = ref(false)
const filterMode = ref<'all' | 'active'>('all')
const savingId = ref<number | null>(null)
const edits = reactive<Record<number, CatalogEdit>>({})

const SIGN_LABELS: Record<ScoreSign, string> = {
  POSITIVE: '加分',
  NEGATIVE: '扣分',
  NEUTRAL: '中性',
}
const SIGN_TAG_TYPES: Record<ScoreSign, 'success' | 'danger' | 'info'> = {
  POSITIVE: 'success',
  NEGATIVE: 'danger',
  NEUTRAL: 'info',
}
const signLabel = (sign: ScoreSign) => SIGN_LABELS[sign] ?? sign
const signTagType = (sign: ScoreSign) => SIGN_TAG_TYPES[sign] ?? 'info'

function snapshotFromItem(item: CatalogItem): CatalogEdit {
  return {
    label: item.label,
    default_weight: Number(item.default_weight),
    data_source: item.data_source ?? '',
    description: item.description ?? '',
    display_order: item.display_order,
  }
}

/** 空字串正規化為 null（與後端 nullable string 欄位對齊）。 */
const blankToNull = (v: string): string | null => (v.trim() === '' ? null : v)

const filteredItems = computed(() =>
  filterMode.value === 'active' ? items.value.filter((i) => i.is_active) : items.value,
)

const sortedItems = computed(() =>
  [...filteredItems.value].sort((a, b) => {
    const ad = a.display_order ?? 0
    const bd = b.display_order ?? 0
    if (ad !== bd) return ad - bd
    return a.id - b.id
  }),
)

const fetchItems = async () => {
  loading.value = true
  try {
    const res = await listAppraisalCatalog()
    const data = res.data || []
    items.value = data
    for (const item of data) {
      edits[item.id] = snapshotFromItem(item)
    }
  } catch (error) {
    ElMessage.error(apiError(error, '載入扣分目錄失敗'))
  } finally {
    loading.value = false
  }
}

/** exclude_unset 語意：diff edits[id] 與目前 items 內的原值，只回傳異動欄位。 */
function buildDiff(id: number): CatalogPatchPayload {
  const item = items.value.find((i) => i.id === id)
  const edit = edits[id]
  const payload: CatalogPatchPayload = {}
  if (!item || !edit) return payload
  if (edit.label !== item.label) payload.label = edit.label
  if (edit.default_weight !== Number(item.default_weight)) payload.default_weight = edit.default_weight
  const nextSource = blankToNull(edit.data_source)
  if (nextSource !== (item.data_source ?? null)) payload.data_source = nextSource
  const nextDescription = blankToNull(edit.description)
  if (nextDescription !== (item.description ?? null)) payload.description = nextDescription
  if (edit.display_order !== item.display_order) payload.display_order = edit.display_order
  return payload
}

function isDirty(id: number): boolean {
  return Object.keys(buildDiff(id)).length > 0
}

async function saveRow(row: CatalogItem) {
  const payload = buildDiff(row.id)
  if (Object.keys(payload).length === 0) return
  savingId.value = row.id
  try {
    const res = await patchAppraisalCatalogItem(row.id, payload)
    const updated = res.data
    const idx = items.value.findIndex((i) => i.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    edits[updated.id] = snapshotFromItem(updated)
    ElMessage.success('已更新')
  } catch (error) {
    ElMessage.error(apiError(error, '更新失敗'))
  } finally {
    savingId.value = null
  }
}

function cancelRow(row: CatalogItem) {
  edits[row.id] = snapshotFromItem(row)
}

// is_active 為獨立即時切換（非併入編輯列），只送 is_active 一個欄位。
// Task B4：切換前需二次確認——el-switch 綁定為單向 `:model-value="row.is_active"`
// （非 v-model），Element Plus 內部 checked 態純由 props 推導、不會自行 optimistic
// 翻轉（見 element-plus switch.vue2.mjs：checked = computed(() => actualValue ===
// activeValue)，actualValue 只讀 props.modelValue）；取消時本函式直接 return，
// row.is_active 未變動，switch 顯示自然維持原狀，不需額外手動「復原」程式碼。
async function toggleActive(row: CatalogItem, val: boolean) {
  try {
    await ElMessageBox.confirm(
      val
        ? '確定要啟用此項目？啟用後將計入後續分數計算。'
        : '確定要停用此項目？停用後將不再計入新分數，既有歷史分數不受影響。',
      '確認變更啟用狀態',
      { confirmButtonText: '確認', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 使用者取消：不送 PATCH，switch 維持原狀
  }
  try {
    const res = await patchAppraisalCatalogItem(row.id, { is_active: val })
    const updated = res.data
    const idx = items.value.findIndex((i) => i.id === updated.id)
    if (idx >= 0) items.value[idx] = updated
    edits[updated.id] = snapshotFromItem(updated)
    ElMessage.success(val ? '已啟用' : '已停用')
  } catch (error) {
    ElMessage.error(apiError(error, '切換失敗'))
  }
}

function rowClassName({ row }: { row: CatalogItem }) {
  return row.is_active ? '' : 'row-inactive'
}

onMounted(fetchItems)
</script>

<template>
  <div class="penalty-catalog-panel">
    <div class="panel-head">
      <p class="hint" data-test="panel-hint">
        扣分項目目錄僅維護顯示用中繼資料（名稱／預設權重／資料來源／說明／排序／啟用）；
        項目集合與加減分性質由系統治理，不可新增或刪除。預設權重為顯示用預設值，
        實際計分依規則版本；停用項目仍保留歷史分數對照。
      </p>
      <div class="actions">
        <el-radio-group v-model="filterMode" data-test="filter-mode">
          <el-radio-button value="all" data-test="filter-all">全部</el-radio-button>
          <el-radio-button value="active" data-test="filter-active">僅啟用</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" :loading="loading" data-test="refresh-btn" @click="fetchItems">
          重新整理
        </el-button>
      </div>
    </div>

    <el-table
      :data="sortedItems"
      v-loading="loading"
      empty-text="無項目"
      stripe
      :row-class-name="rowClassName"
    >
      <el-table-column label="代碼" width="170">
        <template #default="{ row }">
          <span class="code-cell" :data-test="`code-${row.code}`">{{ row.code }}</span>
        </template>
      </el-table-column>

      <el-table-column label="顯示名稱" min-width="160">
        <template #default="{ row }">
          <el-input
            v-if="canEdit"
            v-model="edits[row.id].label"
            maxlength="60"
            show-word-limit
            :data-test="`label-input-${row.code}`"
          />
          <span v-else :data-test="`label-text-${row.code}`">{{ row.label }}</span>
        </template>
      </el-table-column>

      <el-table-column width="90" align="center">
        <template #header>性質</template>
        <template #default="{ row }">
          <el-tag :type="signTagType(row.sign)" :data-test="`sign-tag-${row.code}`">
            {{ signLabel(row.sign) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column width="160" align="right">
        <template #header>
          預設權重
          <span class="col-hint">顯示用；實際依規則版本</span>
        </template>
        <template #default="{ row }">
          <el-input-number
            v-if="canEdit"
            v-model="edits[row.id].default_weight"
            :min="-99"
            :max="99"
            :step="0.1"
            controls-position="right"
            :data-test="`weight-input-${row.code}`"
          />
          <span v-else :data-test="`weight-text-${row.code}`">{{ row.default_weight }}</span>
        </template>
      </el-table-column>

      <el-table-column label="資料來源" min-width="140">
        <template #default="{ row }">
          <el-input
            v-if="canEdit"
            v-model="edits[row.id].data_source"
            maxlength="60"
            :data-test="`source-input-${row.code}`"
          />
          <span v-else :data-test="`source-text-${row.code}`">{{ row.data_source || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="說明" min-width="220">
        <template #default="{ row }">
          <el-input
            v-if="canEdit"
            v-model="edits[row.id].description"
            type="textarea"
            :rows="2"
            :data-test="`description-input-${row.code}`"
          />
          <span v-else :data-test="`description-text-${row.code}`">{{ row.description || '-' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="順序" width="100" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="canEdit"
            v-model="edits[row.id].display_order"
            :min="0"
            :step="1"
            controls-position="right"
            :data-test="`order-input-${row.code}`"
          />
          <span v-else :data-test="`order-text-${row.code}`">{{ row.display_order }}</span>
        </template>
      </el-table-column>

      <el-table-column label="啟用" width="90" align="center">
        <template #default="{ row }">
          <el-switch
            v-if="canEdit"
            :model-value="row.is_active"
            :data-test="`active-switch-${row.code}`"
            @change="(val) => toggleActive(row, val as boolean)"
          />
          <el-tag
            v-else
            size="small"
            :type="row.is_active ? 'success' : 'info'"
            :data-test="`active-text-${row.code}`"
          >
            {{ row.is_active ? '啟用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column v-if="canEdit" label="動作" width="130" fixed="right">
        <template #default="{ row }">
          <template v-if="isDirty(row.id)">
            <el-button
              size="small"
              type="primary"
              :loading="savingId === row.id"
              :data-test="`save-btn-${row.code}`"
              @click="saveRow(row)"
            >
              儲存
            </el-button>
            <el-button
              size="small"
              :data-test="`cancel-btn-${row.code}`"
              @click="cancelRow(row)"
            >
              取消
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.penalty-catalog-panel {
  padding: var(--space-2) 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-4);
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  max-width: 640px;
}

.actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-shrink: 0;
}

.code-cell {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--text-sm);
}

.col-hint {
  display: block;
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

:deep(.row-inactive) {
  color: var(--text-tertiary);
  background: var(--neutral-50);
}
</style>
