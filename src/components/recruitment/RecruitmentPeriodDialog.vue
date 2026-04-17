<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'add' ? '新增招生期間' : '編輯招生期間'"
    width="560px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" ref="formRef" label-width="110px" size="small">
      <el-row :gutter="12">
        <el-col :span="24">
          <el-form-item label="期間名稱" prop="period_name" :rules="[{ required: true, message: '必填' }]">
            <el-input v-model="form.period_name" placeholder="如 114.09.16~115.03.15" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="參觀人數">
            <el-input-number v-model="form.visit_count" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="預繳人數">
            <el-input-number v-model="form.deposit_count" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="實際註冊">
            <el-input-number v-model="form.enrolled_count" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="轉其他學期">
            <el-input-number v-model="form.transfer_term_count" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="有效預繳">
            <el-input-number v-model="form.effective_deposit_count" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="未就讀退預繳">
            <el-input-number v-model="form.not_enrolled_deposit" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="註冊後退學">
            <el-input-number v-model="form.enrolled_after_school" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="排序">
            <el-input-number v-model="form.sort_order" :min="0" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="備註">
            <el-input v-model="form.notes" type="textarea" :rows="2" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, required: true },
  mode: { type: String, default: 'add' },
  form: { type: Object, required: true },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'save'])
const formRef = ref(null)

const handleSave = async () => {
  await formRef.value.validate()
  emit('save')
}

defineExpose({ formRef })
</script>
