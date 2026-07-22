<script setup lang="ts">
/**
 * RuleEditorDialog — 建立新版規則（4 rule_type 子表單）
 *
 * Props:
 *  - visible: dialog 開關（v-model:visible）
 *  - itemCode: 規則項目碼（ScoreItemCode）
 *  - existingRule: 當前生效規則（用於預填表單）；null = 新建
 *
 * Emits:
 *  - update:visible
 *  - created: 建立成功後通知 parent reload
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'

import { createScoringRule } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'

interface ExistingRule {
  rule_type?: string
  notes?: string
  rule_config?: {
    per_unit_delta?: number
    tiers?: { min: number; delta: number }[]
    input_field?: string
    threshold?: number
    above_delta?: number
    below_delta?: number
    warning_delta?: number
    minor_delta?: number
    major_delta?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface TierRow { min: number; delta: number }

// P0-A：建立規則由後端 APPRAISAL_RULE_WRITE 守衛，UI 對齊。
const canEditRules = computed(() => hasPermission('APPRAISAL_RULE_WRITE'))

const props = defineProps<{
  visible?: boolean
  itemCode?: string | null
  existingRule?: ExistingRule | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'created': []
}>()

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const RULE_TYPE_OPTIONS = [
  { value: 'PER_UNIT', label: '每次扣分' },
  { value: 'TIER', label: '階梯式' },
  { value: 'FLAT_THRESHOLD', label: '單一閾值' },
  { value: 'DISCIPLINARY_TIERED', label: '懲處分級' },
]

// P2-FE-5：input_field 限定枚舉，避免 free text 與後端 rule_applier 取值不同步。
// 後端 services/appraisal/rule_applier.py 雖以 item_code 分流取值（input_field
// 目前是 informational），但已知的合法值僅這 4 個；改為下拉避免錯字。
//
// ⚠ B3（考核年終規則設定百分比統一，2026-07-22）核實後**刻意不**對
// retention_rate/activity_rate 做 0–1 fraction 換算：這兩個 input_field
// 對應的後端數值（ClassRetentionAggregate.retention_rate、
// ActivityRateAggregate.activity_rate，見 services/appraisal/
// status_aggregator.py:100/111 註解「0-100，2 位小數」）**本就是 0–100
// 百分比尺度**，與 apply_tier()/apply_flat_threshold() 直接比較
// （rule_applier.py:85/112）；既有回歸測試
// RuleEditorDialog.spec.js「submit 帶出 TIER 正確 payload」與
// tests/test_appraisal_score_preview.py 的 seed 資料（tiers min:
// 100/95/90/80/0、threshold: 80）皆證實 tier min/threshold 送出即為
// 0–100 原值。這與 YearEndRulesPanel.vue 的
// dividend_activity_threshold/dividend_returning_threshold（後端存
// fraction 0–1，見 ivy-backend models/config.py + services/year_end/
// auto_derive/returning_rate.py「小數 3 位」）是完全不同的兩套尺度慣例
// ——若對本檔 tier min 加 percentToFraction 換算會把 80 存成 0.8，
// 直接壞掉考核評分比對。批次 3 SDD brief 原假設此處也需換算，已核實
// 為誤判，故不比照 YearEndRulesPanel 做邊界換算。
const INPUT_FIELD_OPTIONS = [
  { value: 'retention_rate', label: '留校率 retention_rate' },
  { value: 'activity_rate', label: '才藝報名率 activity_rate' },
  { value: 'late_count', label: '遲到次數 late_count' },
  { value: 'leave_days', label: '請假天數 leave_days' },
]

interface RuleForm {
  rule_type: string
  effective_from: string
  per_unit_delta: number
  tiers: TierRow[]
  input_field: string
  threshold: number
  above_delta: number
  below_delta: number
  warning_delta: number
  minor_delta: number
  major_delta: number
  notes: string
}

const DEFAULT_FORM = (): RuleForm => ({
  rule_type: 'PER_UNIT',
  effective_from: '',
  per_unit_delta: 0,
  tiers: [{ min: 0, delta: 0 }],
  input_field: '',
  threshold: 0,
  above_delta: 0,
  below_delta: 0,
  warning_delta: 0,
  minor_delta: 0,
  major_delta: 0,
  notes: '',
})

const form = ref<RuleForm>(DEFAULT_FORM())

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    // 開啟時重置 + 預填
    form.value = DEFAULT_FORM()
    const r = props.existingRule
    if (!r) return
    form.value.rule_type = r.rule_type || 'PER_UNIT'
    form.value.notes = r.notes || ''
    if (r.rule_type === 'PER_UNIT') {
      form.value.per_unit_delta = Number(r.rule_config?.per_unit_delta ?? 0)
    } else if (r.rule_type === 'TIER') {
      const tiers = Array.isArray(r.rule_config?.tiers) ? r.rule_config.tiers : []
      form.value.tiers = tiers.length
        ? tiers.map((t) => ({ min: Number(t.min), delta: Number(t.delta) }))
        : [{ min: 0, delta: 0 }]
      form.value.input_field = r.rule_config?.input_field || ''
    } else if (r.rule_type === 'FLAT_THRESHOLD') {
      form.value.input_field = r.rule_config?.input_field || ''
      form.value.threshold = Number(r.rule_config?.threshold ?? 0)
      form.value.above_delta = Number(r.rule_config?.above_delta ?? 0)
      form.value.below_delta = Number(r.rule_config?.below_delta ?? 0)
    } else if (r.rule_type === 'DISCIPLINARY_TIERED') {
      form.value.warning_delta = Number(r.rule_config?.warning_delta ?? 0)
      form.value.minor_delta = Number(r.rule_config?.minor_delta ?? 0)
      form.value.major_delta = Number(r.rule_config?.major_delta ?? 0)
    }
  },
)

function addTier() {
  form.value.tiers.push({ min: 0, delta: 0 })
}

function removeTier(i: number) {
  form.value.tiers.splice(i, 1)
}

function buildPayload() {
  const base: Record<string, unknown> = {
    item_code: props.itemCode ?? null,
    effective_from: form.value.effective_from,
    rule_type: form.value.rule_type,
    notes: form.value.notes || null,
  }
  if (form.value.rule_type === 'PER_UNIT') {
    base.rule_config = { per_unit_delta: form.value.per_unit_delta }
  } else if (form.value.rule_type === 'TIER') {
    base.rule_config = {
      input_field: form.value.input_field,
      tiers: form.value.tiers.map((t) => ({
        min: Number(t.min),
        delta: Number(t.delta),
      })),
    }
  } else if (form.value.rule_type === 'FLAT_THRESHOLD') {
    base.rule_config = {
      input_field: form.value.input_field,
      threshold: form.value.threshold,
      above_delta: form.value.above_delta,
      below_delta: form.value.below_delta,
    }
  } else if (form.value.rule_type === 'DISCIPLINARY_TIERED') {
    base.rule_config = {
      warning_delta: form.value.warning_delta,
      minor_delta: form.value.minor_delta,
      major_delta: form.value.major_delta,
    }
  }
  return base
}

const submitting = ref(false)

// P1-12：effective_from 不可早於今天（規則只能往前生效）。
function disablePastDates(d: Date | null) {
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

// P2-FE-5：tier min 嚴格單調遞增（不可重複也不可下降）。
// 後端 services/appraisal/rule_applier.apply_tier 雖會 sort 後取最高匹配，
// 但人工輸入時若 min 亂序代表設定者意圖不清，應在送出前阻擋。
function validateTiersMonotonic(tiers: TierRow[]) {
  const mins = tiers.map((t) => Number(t.min))
  for (let i = 1; i < mins.length; i++) {
    if (!(mins[i] > mins[i - 1])) return false
  }
  return true
}

async function submit() {
  if (!form.value.effective_from) {
    ElMessage.warning('請選擇生效日期')
    return
  }
  if (form.value.rule_type === 'TIER') {
    if (!form.value.tiers.some((t) => Number(t.min) === 0)) {
      ElMessage.warning('階梯式必須有一條 min=0 兜底')
      return
    }
    if (!validateTiersMonotonic(form.value.tiers)) {
      ElMessage.warning('階梯 min 必須由小到大嚴格遞增（不可重複或下降）')
      return
    }
  }
  submitting.value = true
  try {
    await createScoringRule(buildPayload())
    ElMessage.success('已建立新版規則')
    emit('created')
  } catch (e) {
    ElMessage.error(apiError(e, '建立失敗'))
  } finally {
    submitting.value = false
  }
}

defineExpose({ disablePastDates, validateTiersMonotonic })
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="`編輯規則：${itemCode || ''}`"
    width="640px"
    data-test="rule-editor-dialog"
  >
    <el-form :model="form" label-width="120px">
      <el-form-item label="生效日">
        <el-date-picker
          v-model="form.effective_from"
          value-format="YYYY-MM-DD"
          :disabled-date="disablePastDates"
          data-test="effective-from-input"
        />
        <span class="hint">不可早於今天</span>
      </el-form-item>

      <el-form-item label="規則類型">
        <el-select v-model="form.rule_type" data-test="rule-type-select">
          <el-option
            v-for="o in RULE_TYPE_OPTIONS"
            :key="o.value"
            :value="o.value"
            :label="o.label"
          />
        </el-select>
        <div class="rule-type-hint">
          <template v-if="form.rule_type === 'PER_UNIT'">每發生 1 次扣固定分。例：遲到 1 次扣 0.5 分。</template>
          <template v-else-if="form.rule_type === 'TIER'">依數值落在哪個區間給對應分數。例：留校率 90–95% 扣 1 分、低於 90% 扣 2 分。</template>
          <template v-else-if="form.rule_type === 'FLAT_THRESHOLD'">超過（或低於）單一門檻時一次性加減分。</template>
          <template v-else-if="form.rule_type === 'DISCIPLINARY_TIERED'">依懲處（嘉獎/申誡/記過…）分級對應分值，功過相抵。</template>
        </div>
      </el-form-item>

      <template v-if="form.rule_type === 'PER_UNIT'">
        <el-form-item label="每次分數" data-test="per-unit-section">
          <el-input-number
            v-model="form.per_unit_delta"
            :step="0.25"
            :precision="2"
            data-test="per-unit-delta-input"
          />
        </el-form-item>
      </template>

      <template v-if="form.rule_type === 'TIER'">
        <el-form-item label="輸入欄位" data-test="tier-section">
          <el-select
            v-model="form.input_field"
            placeholder="請選擇輸入欄位"
            data-test="tier-input-field"
          >
            <el-option
              v-for="o in INPUT_FIELD_OPTIONS"
              :key="o.value"
              :value="o.value"
              :label="o.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="階梯">
          <div
            v-for="(t, i) in form.tiers"
            :key="i"
            class="tier-row"
            :data-test="`tier-row-${i}`"
          >
            <span>≥</span>
            <el-input-number
              v-model="t.min"
              :step="1"
              :precision="2"
              :data-test="`tier-min-${i}`"
            />
            <span>→</span>
            <el-input-number
              v-model="t.delta"
              :step="0.5"
              :precision="2"
              :data-test="`tier-delta-${i}`"
            />
            <el-button
              :icon="Delete"
              link
              :data-test="`remove-tier-${i}`"
              @click="removeTier(i)"
            />
          </div>
          <el-button
            :icon="Plus"
            link
            data-test="add-tier-btn"
            @click="addTier"
          >
            加階梯
          </el-button>
        </el-form-item>
      </template>

      <template v-if="form.rule_type === 'FLAT_THRESHOLD'">
        <el-form-item label="輸入欄位" data-test="flat-section">
          <el-select
            v-model="form.input_field"
            placeholder="請選擇輸入欄位"
            data-test="flat-input-field"
          >
            <el-option
              v-for="o in INPUT_FIELD_OPTIONS"
              :key="o.value"
              :value="o.value"
              :label="o.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="閾值">
          <el-input-number
            v-model="form.threshold"
            :step="1"
            :precision="2"
            data-test="threshold-input"
          />
        </el-form-item>
        <el-form-item label="閾值以上">
          <el-input-number
            v-model="form.above_delta"
            :step="0.5"
            :precision="2"
            data-test="above-delta-input"
          />
        </el-form-item>
        <el-form-item label="閾值以下">
          <el-input-number
            v-model="form.below_delta"
            :step="0.5"
            :precision="2"
            data-test="below-delta-input"
          />
        </el-form-item>
      </template>

      <template v-if="form.rule_type === 'DISCIPLINARY_TIERED'">
        <el-form-item label="警告" data-test="disciplinary-section">
          <el-input-number
            v-model="form.warning_delta"
            :step="0.5"
            :precision="2"
            data-test="warning-delta-input"
          />
        </el-form-item>
        <el-form-item label="小過">
          <el-input-number
            v-model="form.minor_delta"
            :step="0.5"
            :precision="2"
            data-test="minor-delta-input"
          />
        </el-form-item>
        <el-form-item label="大過">
          <el-input-number
            v-model="form.major_delta"
            :step="0.5"
            :precision="2"
            data-test="major-delta-input"
          />
        </el-form-item>
      </template>

      <el-form-item label="備註">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="2"
          data-test="notes-input"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button data-test="cancel-btn" @click="dialogVisible = false">
        取消
      </el-button>
      <el-button
        v-if="canEditRules"
        type="primary"
        :loading="submitting"
        data-test="submit-btn"
        @click="submit"
      >
        建立新版
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  margin-left: var(--space-2);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.tier-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: 6px;
}
.rule-type-hint { font-size: var(--text-sm); color: var(--text-secondary); margin: 4px 0 8px; }
</style>
