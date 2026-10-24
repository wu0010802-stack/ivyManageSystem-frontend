<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { updateYearEndCycleRules } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { buildCycleRulesPatch, deductionPeriodLabel, type CycleRulesState } from '../yearEnd0315'

// 義華第二批 yearend2（Q19／扣款期間）：per-cycle 規則。值為各租戶各週期資料，
// 前端不寫死任何園所的設定值；改完需重新試算（build）才生效，已簽核／已核定的結算單不受影響。

const props = defineProps<{
  cycleId: number
  /** 由父頁 listYearEndCycles 帶入；null＝尚未載入或查無週期。 */
  rules: CycleRulesState | null
  canWrite: boolean
}>()
const emit = defineEmits<{ (e: 'saved', rules: CycleRulesState): void }>()

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)

const form = reactive<CycleRulesState>({ deduction_period_start_month: 1, employment_cutoff_date: null })
const original = ref<CycleRulesState>({ deduction_period_start_month: 1, employment_cutoff_date: null })
const saving = ref(false)

watch(
  () => props.rules,
  (r) => {
    if (!r) return
    original.value = { ...r }
    form.deduction_period_start_month = r.deduction_period_start_month
    form.employment_cutoff_date = r.employment_cutoff_date
  },
  { immediate: true },
)

const patch = computed(() => buildCycleRulesPatch(original.value, form))

async function save() {
  const body = patch.value
  if (!body) return
  saving.value = true
  try {
    const res = await updateYearEndCycleRules(props.cycleId, body)
    const saved: CycleRulesState = {
      deduction_period_start_month: res.data.deduction_period_start_month,
      employment_cutoff_date: res.data.employment_cutoff_date ?? null,
    }
    original.value = { ...saved }
    form.deduction_period_start_month = saved.deduction_period_start_month
    form.employment_cutoff_date = saved.employment_cutoff_date
    emit('saved', saved)
    ElMessage.success('已更新年終規則，請到「試算 · 調整」重新試算後生效')
  } catch (e) {
    ElMessage.error(apiError(e, '更新年終規則失敗'))
  } finally {
    saving.value = false
  }
}

function reset() {
  form.deduction_period_start_month = original.value.deduction_period_start_month
  form.employment_cutoff_date = original.value.employment_cutoff_date
}
</script>

<template>
  <el-card class="section-card" data-test="cycle-rules-card">
    <template #header>
      <span class="section-title">年終規則（本週期）</span>
    </template>
    <p class="rules-hint">
      改完需到「試算 · 調整」重新試算才會生效；已簽核、已核定的結算單不會被重算。週期鎖定後不可修改。
    </p>
    <el-form label-width="140px" class="rules-form">
      <el-form-item label="扣款期間起始月">
        <el-select
          v-model="form.deduction_period_start_month"
          :disabled="!canWrite || !rules"
          style="width: 160px"
          data-test="deduction-start-month"
        >
          <el-option v-for="m in MONTH_OPTIONS" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
        <span class="rules-inline">目前：{{ deductionPeriodLabel(form.deduction_period_start_month) }}</span>
        <div class="rules-hint">
          考勤、會議、獎懲扣款的計算期間。1＝曆年 1–12 月；2＝2 月～隔年 1 月。到職月數比例不受影響。
        </div>
      </el-form-item>
      <el-form-item label="在職基準日">
        <el-date-picker
          v-model="form.employment_cutoff_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="未設定（以試算當下在職為準）"
          :disabled="!canWrite || !rules"
          clearable
          style="width: 220px"
          data-test="employment-cutoff-date"
        />
        <div class="rules-hint">
          此日（含）仍在職者納入年終；基準日當天離職者照領全額。清空＝以試算當下是否在職判定。
        </div>
      </el-form-item>
    </el-form>
    <div v-if="canWrite" class="rules-actions">
      <el-button v-if="patch" size="small" @click="reset">還原</el-button>
      <el-button
        type="primary"
        size="small"
        :disabled="!patch"
        :loading="saving"
        data-test="cycle-rules-save"
        @click="save"
      >儲存規則</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.section-title {
  font-weight: 600;
}
.rules-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin: 4px 0 0;
  width: 100%;
}
.rules-inline {
  margin-left: var(--space-3, 12px);
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.rules-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
}
</style>
