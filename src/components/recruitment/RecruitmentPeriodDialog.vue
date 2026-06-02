<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'add' ? '新增招生期間' : '編輯招生期間'"
    width="560px"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" ref="formRef" label-position="top" size="small">
      <p class="required-legend"><span class="req">*</span> 為必填，其餘可日後補</p>

      <el-form-item label="期間名稱" prop="period_name" :rules="[{ required: true, message: '必填', trigger: 'blur' }]">
        <el-input v-model="form.period_name" placeholder="如 114.09.16~115.03.15" />
      </el-form-item>

      <!-- 統計數據（常駐；數字矩陣維持 2 欄緊湊） -->
      <FormSection title="統計數據" :collapsible="false">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="參觀人數"><el-input-number v-model="form.visit_count" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="預繳人數"><el-input-number v-model="form.deposit_count" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="實際註冊"><el-input-number v-model="form.enrolled_count" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="轉其他學期"><el-input-number v-model="form.transfer_term_count" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="有效預繳"><el-input-number v-model="form.effective_deposit_count" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="未就讀退預繳"><el-input-number v-model="form.not_enrolled_deposit" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="註冊後退學"><el-input-number v-model="form.enrolled_after_school" :min="0" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </FormSection>

      <!-- 其他（收合） -->
      <FormSection data-test="section-other" title="其他" collapsible :default-open="false">
        <el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="備註"><el-input v-model="form.notes" type="textarea" :rows="2" /></el-form-item>
      </FormSection>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormInstance } from 'element-plus'
import FormSection from '@/components/common/FormSection.vue'

interface PeriodForm {
  period_name?: string | number | null
  visit_count?: number | null
  deposit_count?: number | null
  enrolled_count?: number | null
  transfer_term_count?: number | null
  effective_deposit_count?: number | null
  not_enrolled_deposit?: number | null
  enrolled_after_school?: number | null
  sort_order?: number | null
  notes?: string | number | null
  [key: string]: unknown
}

withDefaults(defineProps<{
  visible: boolean
  mode?: string
  form: PeriodForm
  saving?: boolean
}>(), {
  mode: 'add',
  saving: false,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'save': []
}>()

const formRef = ref<FormInstance | null>(null)

const handleSave = () => {
  formRef.value?.validate((valid) => {
    if (valid) emit('save')
  })
}

defineExpose({ formRef })
</script>

<style scoped>
.required-legend { font-size: 12px; color: var(--el-text-color-secondary); margin: 0 0 14px; }
.required-legend .req { color: var(--el-color-danger); }
</style>
