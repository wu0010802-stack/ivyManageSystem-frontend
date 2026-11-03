<template>
  <FormDialog
    :model-value="modelValue"
    :title="`批次調整 ${rows.length} 人`"
    size="standardNarrow"
    :loading="loading"
    :disabled="!canSubmit"
    :submit-text="`套用到 ${rows.length} 人`"
    :dirty="isDirty"
    :enter-submit="false"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @submit="submit"
  >
    <el-alert
      v-if="failures.length > 0"
      type="warning"
      :closable="false"
      class="batch-failures"
      :title="`上次有 ${failures.length} 人沒有套用成功，已重新載入他們的最新資料`"
    >
      <ul class="batch-failures__list">
        <li v-for="f in failures" :key="f.id">{{ f.name }}：{{ f.reason }}</li>
      </ul>
      <p class="batch-failures__hint">確認下方預覽後可再套用一次；成功的人不會重複調整。</p>
    </el-alert>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="form-grid">
      <el-form-item label="調整項目" prop="field" class="fg-6">
        <el-select v-model="form.field" placeholder="選擇項目" style="width: 100%">
          <el-option v-for="f in EDITABLE_SALARY_FIELDS" :key="f.key" :label="f.label" :value="f.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="方式" prop="mode" class="fg-3">
        <el-radio-group v-model="form.mode">
          <el-radio-button value="set">設為</el-radio-button>
          <el-radio-button value="add">加</el-radio-button>
          <el-radio-button value="sub">減</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="金額（元）" prop="amount" class="fg-3">
        <el-input-number v-model="form.amount" :min="0" :step="100" :precision="0" controls-position="right" style="width: 100%" />
      </el-form-item>
      <el-form-item label="調整原因（會寫進每個人的編輯紀錄）" prop="reason" class="fg-12">
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="至少 5 字（例：10/30 臨時園務會議補發）"
        />
      </el-form-item>
    </el-form>

    <section class="batch-preview" aria-label="調整預覽">
      <h3 class="batch-preview__title">
        預覽<span v-if="fieldLabel">：{{ fieldLabel }}</span>
      </h3>
      <p v-if="!form.field" class="batch-preview__empty">選好項目後，這裡會列出每個人的現值與調整後的值。</p>
      <el-table v-else :data="preview" border max-height="320" :row-class-name="previewRowClass">
        <el-table-column prop="name" label="姓名" min-width="96" />
        <el-table-column label="現值 → 調整後" min-width="150" align="right" class-name="num-cell">
          <template #default="{ row }">
            <span class="is-muted">{{ amountText(row.current) }}</span> →
            <strong :class="{ 'is-danger': row.invalid }">{{ amountText(row.next) }}</strong>
          </template>
        </el-table-column>
        <el-table-column :label="netColumnLabel" min-width="170" align="right" class-name="num-cell">
          <template #default="{ row }">
            <template v-if="row.netAffected">
              <span class="is-muted">{{ amountText(row.netBefore) }}</span> →
              <strong :class="{ 'is-danger': row.netInvalid }">{{ amountText(row.netAfter) }}</strong>
            </template>
            <span v-else class="is-muted">{{ affectsSupplementary ? '可能因補充保費變動' : '不影響實領' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="form.field" class="batch-preview__foot">
        <template v-if="invalidCount > 0">
          <strong class="is-danger">{{ invalidCount }} 人調整後會變成負數</strong>，請改金額或改用「設為」。
        </template>
        <template v-else-if="netInvalidCount > 0">
          <strong class="is-danger">{{ netInvalidCount }} 人調整後實領會小於 0</strong>，系統不會接受，請改金額。
        </template>
        <template v-else-if="netAffected">合計實領 {{ signed(netDeltaTotal) }} 元（預估，以重算後為準）。</template>
        <template v-else>{{ separateNote }}</template>
      </p>
      <p v-if="form.field && affectsSupplementary" class="batch-preview__foot">
        這個項目算進二代健保補充保費的年度獎金累計；超過門檻時會多扣補充保費，實領以重算後為準。
      </p>
    </section>
  </FormDialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
import { EDITABLE_SALARY_FIELDS } from '@/constants/salaryFields'
import { formatAmount } from '@/utils/currency'
import { computeBaseTransferAmount } from '@/utils/salaryAmounts'
import type { SettlementRecord } from '@/composables/useSalarySettlement'
import { MONEY_COLUMNS } from './reviewColumns'
import type { BatchMode, BatchItem, BatchFailure } from './batchAdjust'

const props = withDefaults(
    defineProps<{
        modelValue: boolean
        /** 要調整的人（父層每次傳最新資料；失敗重試時只剩失敗者） */
        rows: SettlementRecord[]
        loading?: boolean
        /** 上一次套用失敗的人 */
        failures?: BatchFailure[]
    }>(),
    { loading: false, failures: () => [] },
)
const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    confirm: [payload: { field: string; reason: string; items: BatchItem[] }]
}>()

const formRef = ref<FormInstance>()
const form = reactive({ field: '', mode: 'set' as BatchMode, amount: 0, reason: '' })
const rules: FormRules = {
    field: [{ required: true, message: '請選擇要調整的項目', trigger: 'change' }],
    reason: [
        { required: true, message: '請填寫調整原因', trigger: 'blur' },
        { min: 5, message: '調整原因至少 5 字', trigger: 'blur' },
    ],
}

// 開啟時重置（失敗重試沿用上次填的內容，讓使用者直接再按一次）
watch(
    () => props.modelValue,
    (open) => {
        if (open && props.failures.length === 0) {
            form.field = ''
            form.mode = 'set'
            form.amount = 0
            form.reason = ''
        }
    },
)

const isDirty = () => form.field !== '' || form.amount !== 0 || form.reason.trim() !== ''

const column = computed(() => MONEY_COLUMNS.find((c) => c.key === form.field))
const fieldLabel = computed(() => EDITABLE_SALARY_FIELDS.find((f) => f.key === form.field)?.label ?? '')

/**
 * 這個項目怎麼影響實領：
 * - 加項（進應發）→ 實領同向變動；扣項（進總扣款）→ 實領反向變動
 * - 節慶／超額獎金、節慶獎金扣減 → 獨立轉帳，不影響主薪轉的實領
 */
const netSign = computed(() => {
    if (!column.value) return 0
    if (column.value.group === 'add') return 1
    if (column.value.group === 'ded') return -1
    return 0
})
const netAffected = computed(() => netSign.value !== 0)
/** 後端調整這些欄位會即時重算二代健保補充保費（api/salary/manual_adjust.py BONUS_FIELDS_FOR_YTD） */
const SUPPLEMENTARY_BONUS_FIELDS = new Set(['festival_bonus', 'overtime_bonus', 'performance_bonus', 'special_bonus', 'supervisor_dividend'])
const affectsSupplementary = computed(() => SUPPLEMENTARY_BONUS_FIELDS.has(form.field))
const netColumnLabel = computed(() => (netAffected.value ? '實領（預估）' : '實領'))
const separateNote = computed(() =>
    form.field === 'meeting_absence_deduction'
        ? '節慶獎金扣減只從節慶獎金扣，不影響實領。'
        : '節慶／超額獎金為獨立轉帳，主薪轉照原金額（會反映在含獎金實領）。',
)

const num = (v: unknown) => {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
}
const nextValue = (current: number): number => {
    const amt = num(form.amount)
    if (form.mode === 'add') return current + amt
    if (form.mode === 'sub') return current - amt
    return amt
}

const preview = computed(() =>
    props.rows.map((r) => {
        const current = num(r[form.field])
        const next = nextValue(current)
        const netBefore = computeBaseTransferAmount(r)
        const delta = netSign.value * (next - current)
        return {
            id: r.id,
            version: r.version ?? undefined,
            name: r.employee_name,
            current,
            next,
            invalid: next < 0,
            netAffected: netAffected.value,
            netBefore,
            netAfter: netBefore + delta,
            // 後端以 net_salary（不含未休折現）< 0 拒絕手動調整
            netInvalid: netAffected.value && num(r.net_salary) + delta < 0,
        }
    }),
)
const invalidCount = computed(() => preview.value.filter((p) => p.invalid).length)
const netInvalidCount = computed(() => preview.value.filter((p) => p.netInvalid).length)
const netDeltaTotal = computed(() => preview.value.reduce((s, p) => s + (p.netAfter - p.netBefore), 0))
const canSubmit = computed(
    () =>
        props.rows.length > 0 &&
        form.field !== '' &&
        invalidCount.value === 0 &&
        netInvalidCount.value === 0 &&
        form.reason.trim().length >= 5,
)

const amountText = (v: number) => (v === 0 ? '0' : formatAmount(v))
const signed = (v: number) => (v > 0 ? `+${formatAmount(v)}` : v < 0 ? `−${formatAmount(-v)}` : '0')
const previewRowClass = ({ row }: { row: { invalid: boolean } }) => (row.invalid ? 'is-invalid-row' : '')

const submit = async () => {
    const valid = await formRef.value?.validate().catch(() => false)
    if (valid === false || !canSubmit.value || props.loading) return
    emit('confirm', {
        field: form.field,
        reason: form.reason.trim(),
        items: preview.value.map((p) => ({ id: p.id, version: p.version, value: p.next })),
    })
}

defineExpose({ submit, form, preview, canSubmit })
</script>

<style scoped>
.batch-failures {
  margin-bottom: var(--space-4);
}

.batch-failures__list {
  margin: var(--space-1) 0;
  padding-left: var(--space-5);
}

.batch-failures__hint {
  margin: 0;
}

.batch-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.batch-preview__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-weight-semibold);
}

.batch-preview__empty,
.batch-preview__foot {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}

.is-muted {
  color: var(--el-text-color-secondary);
}

.is-danger {
  color: var(--color-danger-darker);
}

:deep(.is-invalid-row > td) {
  background-color: var(--color-danger-soft);
}
</style>
