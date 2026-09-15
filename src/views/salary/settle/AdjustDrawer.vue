<template>
  <el-drawer
    :model-value="modelValue"
    :title="row ? `手動調整｜${row.employee_name}` : '手動調整'"
    size="520px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-alert
      v-if="row?.is_finalized"
      type="warning"
      :closable="false"
      class="adjust-mb"
      title="此筆已封存，不可調整（需先於定案步驟退回）"
    />
    <el-form label-width="120px" :disabled="!!row?.is_finalized">
      <div class="adjust-grid">
        <el-form-item v-for="field in EDITABLE_FIELDS" :key="field.key" :label="field.label">
          <el-input-number
            v-model="form[field.key]"
            :min="0"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </div>
      <el-form-item label="節慶獎金設定">
        <el-checkbox v-model="explicitFestivalBonus">
          明確採用目前填寫的節慶獎金（含 0 元），不隨扣減連動
        </el-checkbox>
      </el-form-item>
      <el-form-item label="額外加給名目">
        <el-input
          v-model="extraAllowanceLabel"
          maxlength="50"
          show-word-limit
          placeholder="額外加給的名目（例：值週、活動加班費、補發）"
        />
      </el-form-item>
      <el-form-item label="調整原因" required>
        <el-input
          v-model="reason"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="至少 5 字（例：員工自請補發、主管核准一次性獎勵、誤算修正）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!!row?.is_finalized" @click="save">
        儲存
      </el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { manualAdjustSalary } from '@/api/salary'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { SettlementRecord } from '@/composables/useSalarySettlement'
import { EDITABLE_SALARY_FIELDS as EDITABLE_FIELDS } from '@/constants/salaryFields'

const props = defineProps<{
    modelValue: boolean
    row: SettlementRecord | null
}>()
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'saved'): void
}>()

type FieldKey = (typeof EDITABLE_FIELDS)[number]['key']

const { notify } = useErrorNotify()
const saving = ref(false)
const reason = ref('')
const extraAllowanceLabel = ref('')
const explicitFestivalBonus = ref(false)
const form = reactive<Record<FieldKey, number>>(
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.key, 0])) as Record<FieldKey, number>,
)

// 開抽屜時帶入該列現值
watch(
    () => [props.modelValue, props.row] as const,
    ([open, row]) => {
        explicitFestivalBonus.value = false
        if (!open || !row) return
        reason.value = ''
        extraAllowanceLabel.value = (row.extra_allowance_label as string) || ''
        for (const f of EDITABLE_FIELDS) {
            form[f.key] = Number(row[f.key] ?? 0)
        }
    },
    { immediate: true },
)

const save = async () => {
    const row = props.row
    if (!row?.id || row.is_finalized || saving.value) return
    const trimmed = reason.value.trim()
    if (trimmed.length < 5) {
        ElMessage.warning('請填寫調整原因（至少 5 字）')
        return
    }
    saving.value = true
    try {
        const payload: Record<string, unknown> = { adjustment_reason: trimmed }
        for (const f of EDITABLE_FIELDS) {
            const value = Number(form[f.key] || 0)
            if (value !== Number(row[f.key] ?? 0)) payload[f.key] = value
        }
        const label = extraAllowanceLabel.value.trim()
        if (label !== String(row.extra_allowance_label ?? '').trim()) payload.extra_allowance_label = label
        if (Object.keys(payload).length === 1) {
            ElMessage.info('尚未修改薪資金額或加給名目')
            return
        }
        const festival = Number(form.festival_bonus || 0)
        const needsExplicitFestival = Number(row.festival_bonus ?? 0) === 0
            && festival === 0
            && Number(form.meeting_absence_deduction || 0) < Number(row.meeting_absence_deduction ?? 0)
        if (needsExplicitFestival && !explicitFestivalBonus.value) {
            ElMessage.warning('原節慶獎金為 0 元，降低扣減時無法自動回推；請填寫正確節慶獎金，若仍為 0 元請勾選明確採用金額')
            return
        }
        if (explicitFestivalBonus.value) payload.festival_bonus = festival
        await manualAdjustSalary(
            row.id,
            payload as Parameters<typeof manualAdjustSalary>[1],
            row.version ?? undefined,
        )
        ElMessage.success('薪資金額已更新')
        emit('saved') // 外層 refresh 整批 records（含新 version 與重算總額）
        emit('update:modelValue', false)
    } catch (error) {
        const e = error as { response?: { status?: number; data?: { detail?: string } } }
        if (e?.response?.status === 409) {
            try {
                await ElMessageBox.alert(
                    e.response?.data?.detail || '此筆薪資已被他人修改，將重新載入最新資料',
                    '版本衝突',
                    { confirmButtonText: '重新載入', type: 'warning' },
                )
            } catch {
                // 關閉 alert 一律重載
            }
            emit('saved')
            emit('update:modelValue', false)
        } else {
            notify(error, 'AdjustDrawer.save', null, { prefix: '儲存調整失敗' })
        }
    } finally {
        saving.value = false
    }
}
</script>

<style scoped>
.adjust-mb {
  margin-bottom: var(--space-4);
}

.adjust-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}
</style>
