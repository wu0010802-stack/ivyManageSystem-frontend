<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="mode === 'create' ? '新增家長溝通紀錄' : '編輯家長溝通紀錄'"
    width="560px"
    @closed="onClosed"
  >
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <el-form-item label="溝通日期" prop="communication_date">
        <el-date-picker
          v-model="form.communication_date"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="溝通方式" prop="communication_type">
        <el-select v-model="form.communication_type" style="width: 100%">
          <el-option v-for="t in COMMUNICATION_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>
      <el-form-item label="主題">
        <el-input v-model="form.topic" maxlength="100" show-word-limit placeholder="一句話摘要（選填）" />
      </el-form-item>
      <el-form-item label="溝通內容" prop="content">
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="4"
          placeholder="詳細記錄與家長溝通的內容"
        />
      </el-form-item>
      <el-form-item label="後續追蹤">
        <el-input
          v-model="form.follow_up"
          type="textarea"
          :rows="2"
          placeholder="需要後續處理的事項（選填）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ mode === 'create' ? '新增' : '儲存' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createCommunication, updateCommunication } from '@/api/studentCommunications'
import { apiError } from '@/utils/error'

const COMMUNICATION_TYPES = ['電話', 'LINE', '面談', 'Email', '家聯簿', '簡訊', '其他']

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  defaultStudentId: { type: Number, default: null },
})

const emit = defineEmits(['update:visible', 'submitted'])

const todayStr = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const empty = () => ({
  communication_date: todayStr(),
  communication_type: '電話',
  topic: '',
  content: '',
  follow_up: '',
})

const form = reactive(empty())
const formRef = ref(null)
const submitting = ref(false)

const formRules = {
  communication_date: [{ required: true, message: '請選擇溝通日期', trigger: 'change' }],
  communication_type: [{ required: true, message: '請選擇溝通方式', trigger: 'change' }],
  content: [{ required: true, message: '請輸入溝通內容', trigger: 'blur' }],
}

const hydrate = () => {
  if (props.mode === 'edit' && props.initial) {
    Object.assign(form, {
      communication_date: props.initial.communication_date || todayStr(),
      communication_type: props.initial.communication_type || '電話',
      topic: props.initial.topic || '',
      content: props.initial.content || '',
      follow_up: props.initial.follow_up || '',
    })
  } else {
    Object.assign(form, empty())
  }
}

watch(() => props.visible, (v) => { if (v) hydrate() })

const onClosed = () => {
  formRef.value?.resetFields()
  Object.assign(form, empty())
}

const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (props.mode === 'create') {
      if (!props.defaultStudentId) {
        ElMessage.error('缺少學生資訊')
        return
      }
      await createCommunication({
        student_id: props.defaultStudentId,
        communication_date: form.communication_date,
        communication_type: form.communication_type,
        topic: form.topic || undefined,
        content: form.content,
        follow_up: form.follow_up || undefined,
      })
      ElMessage.success('已新增家長溝通紀錄')
    } else {
      await updateCommunication(props.initial.id, {
        communication_date: form.communication_date,
        communication_type: form.communication_type,
        topic: form.topic || null,
        content: form.content,
        follow_up: form.follow_up || null,
      })
      ElMessage.success('已更新家長溝通紀錄')
    }
    emit('submitted')
    emit('update:visible', false)
  } catch (e) {
    ElMessage.error(apiError(e, props.mode === 'create' ? '新增失敗' : '更新失敗'))
  } finally {
    submitting.value = false
  }
}
</script>
