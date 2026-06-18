<template>
  <el-dialog
    :model-value="modelValue"
    title="批次調整薪資"
    width="460px"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <p class="batch-adjust-hint">將套用到所選的 {{ count }} 筆薪資（設為同一絕對值）。</p>
    <el-form label-width="90px">
      <el-form-item label="調整欄位" required>
        <el-select v-model="field" placeholder="選擇欄位" style="width: 100%">
          <el-option v-for="f in EDITABLE_SALARY_FIELDS" :key="f.key" :label="f.label" :value="f.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="金額" required>
        <el-input-number v-model="value" :min="0" :step="100" style="width: 100%" />
      </el-form-item>
      <el-form-item label="調整原因" required>
        <el-input
          v-model="reason"
          type="textarea"
          :rows="3"
          placeholder="必填，至少 5 字（將套用至所有選取的薪資）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">套用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { EDITABLE_SALARY_FIELDS } from '@/constants/salaryFields'

withDefaults(defineProps<{ modelValue: boolean; count?: number; loading?: boolean }>(), {
  count: 0,
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [payload: { field: string; value: number; reason: string }]
}>()

const field = ref('')
const value = ref(0)
const reason = ref('')

const submit = () => {
  if (!field.value) {
    ElMessage.warning('請選擇要調整的欄位')
    return
  }
  if (reason.value.trim().length < 5) {
    ElMessage.warning('請填寫調整原因（至少 5 字）')
    return
  }
  emit('confirm', { field: field.value, value: Number(value.value || 0), reason: reason.value.trim() })
}
</script>

<style scoped>
.batch-adjust-hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
