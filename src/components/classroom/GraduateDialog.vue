<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { graduateStudent } from '@/api/students'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: Boolean,
  student: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'graduated'])

const graduateFormRef = ref(null)
const graduateForm = reactive({ graduation_date: '', status: '已畢業' })
const graduateRules = {
  graduation_date: [{ required: true, message: '請選擇離園日期', trigger: 'change' }],
  status: [{ required: true, message: '請選擇類型', trigger: 'change' }],
}

watch(() => props.visible, (val) => {
  if (val) {
    graduateForm.graduation_date = ''
    graduateForm.status = '已畢業'
    graduateFormRef.value?.clearValidate()
  }
})

const handleClose = () => {
  emit('update:visible', false)
}

const handleSubmit = async () => {
  if (!graduateFormRef.value) return
  await graduateFormRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      await graduateStudent(props.student.id, graduateForm)
      ElMessage.success(`已將「${props.student.name}」設為${graduateForm.status}`)
      emit('update:visible', false)
      emit('graduated')
    } catch (error) {
      ElMessage.error(apiError(error, '操作失敗'))
    }
  })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="設定離園"
    width="400px"
    @update:model-value="handleClose"
  >
    <el-form :model="graduateForm" :rules="graduateRules" ref="graduateFormRef" label-width="90px">
      <el-form-item label="學生姓名">
        <span>{{ student?.name }}</span>
      </el-form-item>
      <el-form-item label="離園類型" prop="status">
        <el-radio-group v-model="graduateForm.status">
          <el-radio value="已畢業">畢業</el-radio>
          <el-radio value="已轉出">轉出</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="離園日期" prop="graduation_date">
        <el-date-picker
          v-model="graduateForm.graduation_date"
          type="date"
          placeholder="選擇日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="warning" @click="handleSubmit">確認離園</el-button>
    </template>
  </el-dialog>
</template>
