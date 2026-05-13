<template>
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '編輯費用範本' : '新增費用範本'"
    width="560"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100">
      <el-form-item label="年級" prop="grade_id">
        <el-select v-model="form.grade_id" :disabled="isEdit" placeholder="選擇年級" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :value="g.id" :label="g.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="學年" prop="school_year">
        <el-input-number v-model="form.school_year" :min="100" :max="200" :disabled="isEdit" />
      </el-form-item>
      <el-form-item label="學期" prop="semester">
        <el-radio-group v-model="form.semester" :disabled="isEdit">
          <el-radio :value="1">上學期</el-radio>
          <el-radio :value="2">下學期</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="費用類型" prop="fee_type">
        <el-radio-group v-model="form.fee_type" :disabled="isEdit">
          <el-radio value="registration">註冊費</el-radio>
          <el-radio value="miscellaneous">雜費</el-radio>
          <el-radio value="monthly">月費</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="名稱" prop="name">
        <el-input v-model="form.name" placeholder="例：114 學年度上學期註冊費" />
      </el-form-item>
      <el-form-item label="金額" prop="amount">
        <el-input-number v-model="form.amount" :min="0" :max="999999" :step="1" :precision="0" />
      </el-form-item>
      <el-form-item label="繳費期限">
        <el-input-number v-model="form.due_date_offset_days" :min="0" :max="365" :step="1" :precision="0" />
        <span class="hint">天 (產生日起算)</span>
      </el-form-item>

      <template v-if="form.fee_type === 'monthly'">
        <el-divider>月費組成 (退費依此計算)</el-divider>
        <el-form-item label="學費 (不退)">
          <el-input-number v-model="breakdown.tuition" :min="0" :step="1" :precision="0" />
        </el-form-item>
        <el-form-item label="餐點費">
          <el-input-number v-model="breakdown.meal" :min="0" :step="1" :precision="0" />
        </el-form-item>
        <el-form-item label="交通費">
          <el-input-number v-model="breakdown.transport" :min="0" :step="1" :precision="0" />
        </el-form-item>
        <el-form-item label="總和">
          <el-tag :type="breakdownSum === form.amount ? 'success' : 'danger'">
            {{ formatMoney(breakdownSum) }} / {{ formatMoney(form.amount) }}
          </el-tag>
          <span v-if="breakdownSum !== form.amount" class="error-hint">
            必須等於金額才能儲存
          </span>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!canSave" :loading="saving" @click="onSave">
        儲存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createFeeTemplate, updateFeeTemplate } from '@/api/fees'

const props = defineProps({
  modelValue: Boolean,
  template: { type: Object, default: null },
  grades: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const isEdit = computed(() => !!props.template)
const saving = ref(false)
const formRef = ref(null)

const form = reactive({
  grade_id: null,
  school_year: 114,
  semester: 1,
  fee_type: 'registration',
  name: '',
  amount: 0,
  due_date_offset_days: 14,
})

const breakdown = reactive({ tuition: 0, meal: 0, transport: 0 })

const breakdownSum = computed(
  () => (breakdown.tuition || 0) + (breakdown.meal || 0) + (breakdown.transport || 0),
)
const canSave = computed(() => {
  if (form.fee_type === 'monthly') {
    return breakdownSum.value === form.amount && form.amount > 0
  }
  return form.amount >= 0
})

const rules = {
  grade_id: [{ required: true, message: '請選擇年級', trigger: 'change' }],
  name: [{ required: true, message: '請填名稱', trigger: 'blur' }],
  amount: [{ required: true, message: '請填金額', trigger: 'blur' }],
}

function formatMoney(n) {
  return `NT$ ${Number(n || 0).toLocaleString()}`
}

watch(
  () => props.template,
  (t) => {
    if (t) {
      Object.assign(form, {
        grade_id: t.grade_id,
        school_year: t.school_year,
        semester: t.semester,
        fee_type: t.fee_type,
        name: t.name,
        amount: t.amount,
        due_date_offset_days: t.due_date_offset_days ?? 14,
      })
      if (t.breakdown) {
        breakdown.tuition = t.breakdown.tuition || 0
        breakdown.meal = t.breakdown.meal || 0
        breakdown.transport = t.breakdown.transport || 0
      } else {
        breakdown.tuition = 0
        breakdown.meal = 0
        breakdown.transport = 0
      }
    } else {
      Object.assign(form, {
        grade_id: null,
        school_year: 114,
        semester: 1,
        fee_type: 'registration',
        name: '',
        amount: 0,
        due_date_offset_days: 14,
      })
      breakdown.tuition = 0
      breakdown.meal = 0
      breakdown.transport = 0
    }
  },
  { immediate: true },
)

async function onSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const payload = { ...form }
    if (form.fee_type === 'monthly') {
      payload.breakdown = { ...breakdown }
    }
    if (isEdit.value) {
      // 編輯不可變更 grade_id / school_year / semester / fee_type（後端 unique key）
      // 故只送 mutable 欄位
      const { grade_id, school_year, semester, fee_type, ...editable } = payload
      await updateFeeTemplate(props.template.id, editable)
    } else {
      await createFeeTemplate(payload)
    }
    ElMessage.success(isEdit.value ? '已更新' : '已建立')
    emit('saved')
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || e.displayMessage || '儲存失敗')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.hint {
  color: var(--text-tertiary, #888);
  margin-left: 8px;
  font-size: 12px;
}
.error-hint {
  color: var(--danger, #d33);
  margin-left: 12px;
  font-size: 12px;
}
</style>
