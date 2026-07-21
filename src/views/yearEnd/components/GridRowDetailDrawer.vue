<script setup lang="ts">
import { reactive, computed, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { manualPatchSettlement, getProvenance } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { moneyInt } from '@/utils/currency'
import { SIGN_STATUS_LABEL, SIGN_STATUS_TAG } from '@/constants/appraisalYearEnd'
import { SPECIAL_BONUS_LABELS, PROVENANCE_BONUS_KEYS } from '../gridColumns'
import type { Schema } from '@/api/_generated/typed'
import type { DerivedValue } from '@/types/provenance'

export type GridRow = Schema<'GridRowOut'>

// ─────────────────────────────────────────
// Props / Emits
// ─────────────────────────────────────────

const props = defineProps<{
  modelValue: boolean
  row: GridRow | null
  canWrite: boolean
  /** 供「怎麼算的」逐項下鑽呼叫 getProvenance(key, cycleId, employeeId)。 */
  cycleId: number
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  saved: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

// DRAFT 才顯示就地編輯區；其餘狀態（已簽核/已核定）只看 breakdown。
const canEdit = computed(() => props.canWrite && props.row?.status === 'DRAFT')

// ─────────────────────────────────────────
// Breakdown（主結算 + 逐個有值的獎金 + 特別獎金合計 + 總額 + 狀態 + 備註）
// ─────────────────────────────────────────

interface BonusItem {
  key: string
  label: string
  amount: string
}

// 沿用 YearEndGridView.bonusColumns 的排序慣例：先照 SPECIAL_BONUS_LABELS
// key 順序排列已出現的 key，未知 key（理論上不會有，防禦性保留）附加在後。
const specialBonusItems = computed<BonusItem[]>(() => {
  const row = props.row
  if (!row) return []
  const present = new Set(Object.keys(row.special_bonuses))
  const labelKeys = Object.keys(SPECIAL_BONUS_LABELS)
  const ordered = labelKeys.filter((k) => present.has(k))
  for (const k of present) {
    if (!ordered.includes(k)) ordered.push(k)
  }
  return ordered.map((key) => ({
    key,
    label: SPECIAL_BONUS_LABELS[key] ?? key,
    amount: row.special_bonuses[key] ?? '0',
  }))
})

const specialBonusTotal = computed(() => {
  const row = props.row
  if (!row) return 0
  return Object.values(row.special_bonuses).reduce((sum, v) => sum + Number(v), 0)
})

const statusLabel = computed(() => {
  const row = props.row
  if (!row) return ''
  return (SIGN_STATUS_LABEL as Record<string, string>)[row.status] ?? row.status
})

const statusTagType = computed(() => {
  const row = props.row
  if (!row) return 'info'
  return SIGN_STATUS_TAG[row.status] || 'info'
})

// ─────────────────────────────────────────
// 就地編輯（語意調和：預填 row 現值、改了才送——見 task-4-brief.md「語意調和」段）
// ─────────────────────────────────────────

// 編輯中的表單值。三個金額欄用 `number | null`：null 代表「使用者未實際改動
// （或清空回去）」，diff 時一律跳過不送——與舊 dialog「留空=不覆寫」的空白起點
// 不同，這裡的 null 只在「清空輸入框」時短暫出現，不是預設狀態（預設一律預填
// 現值）。remark 為 string | null，直接對應 row.remark。
const editForm = reactive({
  deduction_disciplinary: null as number | null,
  excess_amount: null as number | null,
  hire_months_override: null as number | null,
  remark: null as string | null,
})

// 開抽屜當下的基準值（金額欄已轉 number，remark 對應 row.remark），用來判斷
// 「使用者是否實際改動」。GridRowOut 的 deduction_disciplinary/hire_months 是
// 後端 Decimal 序列化字串，開抽屜當下只轉一次 Number()——若在 submit 時才逐次
// Number(現值) 重轉，字串與 number 比較容易因型別不同而誤判成「恆為已改動」，
// 故改為開抽屜當下就固定基準值（保精度注意，見 task-4-brief.md）。
const original = reactive({
  deduction_disciplinary: 0,
  excess_amount: 0,
  hire_months_override: 0,
  remark: null as string | null,
})

function resetEditForm(row: GridRow | null) {
  if (!row) return
  // finite 守衛（防禦）：若 row 缺 deduction_disciplinary/hire_months（例如 BE
  // 尚未部署該欄、或未來回 null），`Number(undefined)` 會是 NaN——若不擋下來，
  // original/editForm 都會是 NaN，而 `NaN !== NaN` 恆為 true，會讓 submit() 的
  // diff 判斷誤以為「每次都已改動」，架空「尚未變更任何欄位」的守衛（送出 NaN
  // 雖經 JSON.stringify 變 null、後端視為未提供、無金流損壞，但 UX 是錯的：
  // 使用者完全沒動任何欄位卻彈「已更新」+ 觸發 reload）。非 finite 一律 fallback 0。
  const rawDeduction = Number(row.deduction_disciplinary)
  const rawHire = Number(row.hire_months)
  // special_bonuses 本身理論上必為物件（GridRowOut 非 optional 欄位），但 `?.`
  // 防禦性保留——與 deduction/hire 同一套「缺欄不炸」的保守假設一致。
  const rawExcess = Number(row.special_bonuses?.EXCESS_ENROLLMENT ?? 0)
  const deduction = Number.isFinite(rawDeduction) ? rawDeduction : 0
  const hire = Number.isFinite(rawHire) ? rawHire : 0
  const excess = Number.isFinite(rawExcess) ? rawExcess : 0
  const remark = row.remark ?? null

  editForm.deduction_disciplinary = deduction
  editForm.excess_amount = excess
  editForm.hire_months_override = hire
  editForm.remark = remark

  original.deduction_disciplinary = deduction
  original.excess_amount = excess
  original.hire_months_override = hire
  original.remark = remark
}

// ─────────────────────────────────────────
// 逐項下鑽「怎麼算的」（僅 7 個正向獎金 key 有 BE provenance provider，
// 見 PROVENANCE_BONUS_KEYS；FESTIVAL_DIFF/CUSTOM 不提供、按鈕不顯示）。
// ─────────────────────────────────────────

interface ProvenanceItemState {
  expanded: boolean
  loading: boolean
  data: DerivedValue | null
  error: string | null
  fetched: boolean
}

const provenanceState = reactive<Record<string, ProvenanceItemState>>({})

// 每個 key 各自序列化，防止「已切換到別列/別 key 又重新展開」時，較舊的飛行中
// 回應覆蓋較新的狀態（比照 ProvenanceDrawer.vue 的 fetchSeq，但改成 per-key，
// 因為這裡是使用者各自 lazy 觸發，不是像 ProvenanceDrawer 那樣一次批次抓全部）。
const provenanceFetchSeq: Record<string, number> = {}

function isProvenanceKey(key: string): boolean {
  return PROVENANCE_BONUS_KEYS.has(key)
}

function ensureProvenanceState(key: string): ProvenanceItemState {
  if (!provenanceState[key]) {
    provenanceState[key] = { expanded: false, loading: false, data: null, error: null, fetched: false }
  }
  return provenanceState[key]
}

async function fetchProvenance(key: string) {
  const row = props.row
  if (!row) return
  const state = ensureProvenanceState(key)
  const mySeq = (provenanceFetchSeq[key] ?? 0) + 1
  provenanceFetchSeq[key] = mySeq
  state.loading = true
  state.error = null
  try {
    const res = await getProvenance(key, props.cycleId, row.employee_id)
    if (provenanceFetchSeq[key] !== mySeq) return // 已有更新的請求（或已切換列），丟棄此回應
    state.data = res.data
    state.fetched = true
  } catch (e) {
    if (provenanceFetchSeq[key] !== mySeq) return
    state.error = apiError(e, '載入失敗')
  } finally {
    if (provenanceFetchSeq[key] === mySeq) state.loading = false
  }
}

// 展開/收合切換；只在「首次展開且尚未抓過」時才打 API（lazy + 快取，重複展開
// 不重打）。async 是為了讓測試可以 `await vm.toggleProvenance(key)`。
// 函式層 guard（不只靠模板 v-if）：非 7-key 白名單一律不動作，即使呼叫端繞過
// UI（例如直接呼叫 vm.toggleProvenance('FESTIVAL_DIFF')）也不會觸發
// getProvenance——單一 gate 來源為 isProvenanceKey/PROVENANCE_BONUS_KEYS。
async function toggleProvenance(key: string) {
  if (!isProvenanceKey(key)) return
  const state = ensureProvenanceState(key)
  state.expanded = !state.expanded
  if (state.expanded && !state.fetched && !state.loading) {
    await fetchProvenance(key)
  }
}

function resetProvenanceState() {
  for (const key of Object.keys(provenanceState)) {
    delete provenanceState[key]
  }
  // 對飛行中但尚未回應的舊請求做 seq bump，讓 fetchProvenance 的回應守衛擋下
  // 它、不再寫回（已被上面 delete 掉、與畫面脫鉤的）舊 state 物件。
  for (const key of Object.keys(provenanceFetchSeq)) {
    provenanceFetchSeq[key] = (provenanceFetchSeq[key] ?? 0) + 1
  }
}

const router = useRouter()

function goDeepLink(link: string) {
  router.push(link)
}

// 開抽屜（modelValue 由 false→true）或切換到不同 settlement 時重新預填。
// 不 watch row 整個物件（每次 loadGrid 都會是新 reference），只認 settlement_id，
// 避免同一筆資料因物件參照變化而誤重置使用者正在編輯中的值。
watch(
  [() => props.modelValue, () => props.row?.settlement_id],
  ([v, id]) => {
    if (v && id != null) {
      resetEditForm(props.row)
      resetProvenanceState()
    }
  },
  { immediate: true },
)

const saving = ref(false)

async function submit() {
  const row = props.row
  if (!row) return

  // 只把「與預填原值不同」的欄放進 payload——沒改的欄不送，後端維持既有值。
  // null（未改動或已清空）一律跳過，不送出 null 覆寫（現行 manual API 也不支援
  // 用 null 清除既有 override，見 task-4-brief.md「語意調和」段，本抽屜不承諾此行為）。
  const payload: {
    deduction_disciplinary?: number
    excess_amount?: number
    hire_months_override?: number
    remark?: string
  } = {}
  if (
    editForm.deduction_disciplinary !== null
    && editForm.deduction_disciplinary !== original.deduction_disciplinary
  ) {
    payload.deduction_disciplinary = editForm.deduction_disciplinary
  }
  if (
    editForm.excess_amount !== null
    && editForm.excess_amount !== original.excess_amount
  ) {
    payload.excess_amount = editForm.excess_amount
  }
  if (
    editForm.hire_months_override !== null
    && editForm.hire_months_override !== original.hire_months_override
  ) {
    payload.hire_months_override = editForm.hire_months_override
  }
  if (editForm.remark !== original.remark) {
    payload.remark = editForm.remark ?? ''
  }

  if (Object.keys(payload).length === 0) {
    ElMessage.warning('尚未變更任何欄位')
    return
  }

  saving.value = true
  try {
    await manualPatchSettlement(row.settlement_id, payload)
    ElMessage.success('已更新')
    emit('saved')
    visible.value = false
  } catch (e) {
    ElMessage.error(
      apiError(e, '更新失敗：僅草稿狀態可手動調整；已簽核者請先到「結算明細」將該筆退回草稿')
    )
  } finally {
    saving.value = false
  }
}

defineExpose({
  visible, canEdit, specialBonusItems, specialBonusTotal, statusLabel, statusTagType,
  editForm, original, submit, saving,
  provenanceState, isProvenanceKey, toggleProvenance, goDeepLink,
})
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="row ? `${row.employee_name} — 結算明細` : '結算明細'"
    direction="rtl"
    size="480px"
    data-test="detail-drawer"
  >
    <template v-if="row">
      <section class="breakdown-section" data-test="breakdown-section">
        <div class="breakdown-row" data-test="breakdown-payable">
          <span class="breakdown-label">主結算</span>
          <span class="breakdown-value">{{ moneyInt(row.payable_amount) }}</span>
        </div>

        <div v-for="item in specialBonusItems" :key="item.key" class="breakdown-bonus-block">
          <div class="breakdown-row" :data-test="`breakdown-bonus-${item.key}`">
            <span class="breakdown-label">{{ item.label }}</span>
            <span class="breakdown-value-group">
              <span class="breakdown-value">{{ moneyInt(item.amount) }}</span>
              <el-button
                v-if="isProvenanceKey(item.key)"
                type="primary"
                link
                size="small"
                :data-test="`provenance-toggle-${item.key}`"
                @click="toggleProvenance(item.key)"
              >
                {{ provenanceState[item.key]?.expanded ? '收合' : '怎麼算的' }}
              </el-button>
            </span>
          </div>

          <div
            v-if="isProvenanceKey(item.key) && provenanceState[item.key]?.expanded"
            class="provenance-panel"
            :data-test="`provenance-panel-${item.key}`"
          >
            <el-skeleton
              v-if="provenanceState[item.key]?.loading"
              :rows="2"
              animated
              :data-test="`provenance-loading-${item.key}`"
            />

            <div
              v-else-if="provenanceState[item.key]?.error"
              class="provenance-error"
              :data-test="`provenance-error-${item.key}`"
            >
              {{ provenanceState[item.key]?.error }}
            </div>

            <el-empty
              v-else-if="!provenanceState[item.key]?.data || provenanceState[item.key]?.data?.source_records.length === 0"
              description="無紀錄"
              :image-size="32"
            />

            <div v-else class="provenance-body">
              <div class="provenance-summary" :data-test="`provenance-summary-${item.key}`">
                {{ provenanceState[item.key]?.data?.formula_summary }}
              </div>

              <ul class="provenance-records" :data-test="`provenance-records-${item.key}`">
                <li
                  v-for="(rec, idx) in provenanceState[item.key]?.data?.source_records"
                  :key="idx"
                  class="provenance-record"
                >
                  <span class="rec-date">{{ rec.date }}</span>
                  <span class="rec-label">{{ rec.label }}</span>
                  <span class="rec-amount">{{ moneyInt(rec.amount) }}</span>
                </li>
              </ul>

              <div v-if="provenanceState[item.key]?.data?.deep_link" class="provenance-deep-link">
                <el-button
                  type="primary"
                  link
                  size="small"
                  :data-test="`provenance-link-${item.key}`"
                  @click="goDeepLink(provenanceState[item.key]!.data!.deep_link!)"
                >
                  在來源模組查看 →
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="breakdown-row" data-test="breakdown-bonus-total">
          <span class="breakdown-label">特別獎金合計</span>
          <span class="breakdown-value">{{ moneyInt(specialBonusTotal) }}</span>
        </div>

        <div class="breakdown-row breakdown-row--total" data-test="breakdown-total">
          <span class="breakdown-label">總額</span>
          <strong class="breakdown-value">{{ moneyInt(row.total_amount) }}</strong>
        </div>

        <div class="breakdown-row" data-test="breakdown-status">
          <span class="breakdown-label">狀態</span>
          <el-tag :type="statusTagType" size="small">{{ statusLabel }}</el-tag>
        </div>

        <div class="breakdown-row" data-test="breakdown-remark">
          <span class="breakdown-label">備註</span>
          <span class="breakdown-value">{{ row.remark || '—' }}</span>
        </div>
      </section>

      <!-- 就地編輯：DRAFT + 可寫時顯示，三欄皆已預填目前值（非空白盲改），
           送出只覆寫使用者實際改動的欄位（見上方 submit()）。 -->
      <section v-if="canEdit" class="edit-section" data-test="edit-section">
        <h4 class="section-title">手動調整（已預填目前值，僅送出您變更的欄位）</h4>
        <el-form label-width="130px" label-position="right">
          <el-form-item label="獎懲扣項（≤0）">
            <el-input-number
              v-model="editForm.deduction_disciplinary"
              :max="0"
              :step="100"
              controls-position="right"
              style="width: 200px"
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
              data-test="input-remark"
            />
          </el-form-item>
        </el-form>
        <div class="edit-actions">
          <el-button
            type="primary"
            :loading="saving"
            data-test="save-button"
            @click="submit"
          >
            儲存變更
          </el-button>
        </div>
      </section>

      <p v-else class="readonly-hint" data-test="readonly-hint">
        僅草稿狀態可手動調整；如需調整請先於「結算明細」將該筆退回草稿。
      </p>
    </template>
  </el-drawer>
</template>

<style scoped>
.breakdown-section {
  margin-bottom: var(--space-5);
}
.breakdown-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 14px;
}
.breakdown-row:last-child {
  border-bottom: none;
}
.breakdown-row--total {
  font-weight: 600;
}
.breakdown-label {
  color: var(--el-text-color-secondary);
}
.breakdown-value {
  font-variant-numeric: tabular-nums;
}
.breakdown-bonus-block {
  border-bottom: 1px solid #f5f5f5;
}
.breakdown-bonus-block:last-child {
  border-bottom: none;
}
.breakdown-bonus-block .breakdown-row {
  border-bottom: none;
}
.breakdown-value-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.provenance-panel {
  padding: var(--space-3) 0 var(--space-3) var(--space-3);
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  margin-bottom: 6px;
}
.provenance-error {
  color: var(--el-color-danger);
  font-size: 13px;
  padding: 4px 0;
}
.provenance-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: var(--space-2);
}
.provenance-records {
  list-style: none;
  padding: 0;
  margin: 0;
}
.provenance-record {
  display: flex;
  gap: var(--space-2);
  padding: 4px 0;
  font-size: 12px;
}
.rec-date {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}
.rec-label {
  flex: 1;
  color: var(--el-text-color-primary);
}
.rec-amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.provenance-deep-link {
  margin-top: 6px;
}
.edit-section {
  padding-top: var(--space-4);
  border-top: 1px solid #f0f0f0;
}
.section-title {
  margin: 0 0 var(--space-3);
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
}
.readonly-hint {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid #f0f0f0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
