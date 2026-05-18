<script setup>
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

// P0-A：建立規則由後端 APPRAISAL_RULE_WRITE 守衛，UI 對齊。
const canEditRules = computed(() => hasPermission('APPRAISAL_RULE_WRITE'))

const props = defineProps({
  visible: { type: Boolean, default: false },
  itemCode: { type: String, default: null },
  existingRule: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'created'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const RULE_TYPE_OPTIONS = [
  { value: 'PER_UNIT', label: '每次扣分（PER_UNIT）' },
  { value: 'TIER', label: '階梯式（TIER）' },
  { value: 'FLAT_THRESHOLD', label: '單一閾值（FLAT_THRESHOLD）' },
  { value: 'DISCIPLINARY_TIERED', label: '懲處分級（REWARD_PUNISH 專用）' },
]

const DEFAULT_FORM = () => ({
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

const form = ref(DEFAULT_FORM())

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    // 開啟時重置 + 預填
    form.value = DEFAULT_FORM()
    const r = props.existingRule
    if (!r) return
    form.value.rule_type = r.rule_type
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

function removeTier(i) {
  form.value.tiers.splice(i, 1)
}

function buildPayload() {
  const base = {
    item_code: props.itemCode,
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
          <el-input
            v-model="form.input_field"
            placeholder="retention_rate / activity_rate"
            data-test="tier-input-field"
          />
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
          <el-input
            v-model="form.input_field"
            data-test="flat-input-field"
          />
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
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.tier-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
</style>
