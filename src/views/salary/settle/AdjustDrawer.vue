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
      <el-form-item label="保費追溯調整">
        <div class="ins-adj">
          <div class="ins-adj__hint">
            正數＝補收（增加扣款，例：7-8月眷屬健保 1032）；負數＝退回（減少扣款，例：退回8月健保 -592）。
            進扣款合計、不進應發，不改當月勞健保欄。
          </div>
          <div v-for="(item, idx) in insItems" :key="idx" class="ins-adj__row">
            <el-input v-model="item.label" maxlength="50" placeholder="名目（例：7-8月眷屬健保）" />
            <el-input-number
              v-model="item.amount"
              :min="-INS_ADJ_ITEM_MAX"
              :max="INS_ADJ_ITEM_MAX"
              :step="100"
              controls-position="right"
              aria-label="金額（負數＝退回）"
            />
            <el-button link type="danger" @click="removeInsItem(idx)">刪除</el-button>
          </div>
          <div class="ins-adj__foot">
            <el-button size="small" @click="addInsItem">新增一筆</el-button>
            <span v-if="insItems.length" class="ins-adj__total">
              合計 {{ insTotal > 0 ? '+' : '' }}{{ insTotal.toLocaleString() }}
              （{{ insTotal >= 0 ? '補收' : '退回' }}）
            </span>
          </div>
        </div>
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
import { ref, reactive, watch, computed } from 'vue'
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
// #37 保費追溯補收（正）／退回（負）明細；上限與後端 _INSURANCE_ADJUSTMENT_ITEM_MAX 一致
const INS_ADJ_ITEM_MAX = 50000
interface InsAdjItem { label: string; amount: number }
const insItems = ref<InsAdjItem[]>([])
const originalInsItems = ref<InsAdjItem[]>([])
const insTotal = computed(() => insItems.value.reduce((sum, it) => sum + Number(it.amount || 0), 0))
const addInsItem = () => { insItems.value.push({ label: '', amount: 0 }) }
const removeInsItem = (idx: number) => { insItems.value.splice(idx, 1) }
const toInsItems = (raw: unknown): InsAdjItem[] =>
    Array.isArray(raw)
        ? raw.map((it) => ({ label: String((it as InsAdjItem)?.label ?? ''), amount: Number((it as InsAdjItem)?.amount ?? 0) }))
        : []

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
        originalInsItems.value = toInsItems(row.insurance_adjustment_items)
        insItems.value = originalInsItems.value.map((it) => ({ ...it }))
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
        const nextInsItems = insItems.value.map((it) => ({ label: it.label.trim(), amount: Math.round(Number(it.amount || 0)) }))
        if (nextInsItems.some((it) => !it.label || it.amount === 0)) {
            ElMessage.warning('保費追溯調整每筆都要填名目，金額不可為 0（負數＝退回）')
            return
        }
        if (JSON.stringify(nextInsItems) !== JSON.stringify(originalInsItems.value)) {
            payload.insurance_adjustment_items = nextInsItems
        }
        if (Object.keys(payload).length === 1) {
            ElMessage.info('尚未修改薪資金額、加給名目或保費追溯調整')
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

.ins-adj {
  width: 100%;
}

.ins-adj__hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.ins-adj__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.ins-adj__foot {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ins-adj__total {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.adjust-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}
</style>
