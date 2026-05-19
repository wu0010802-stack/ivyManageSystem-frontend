<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createAnnouncement } from '@/api/announcements'
import { useQuickAddSubmit } from './useQuickAddSubmit'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  title: '',
  content: '',
  priority: 'normal',
  is_pinned: false,
})

const rules: FormRules = {
  title: [{ required: true, message: '請輸入標題', trigger: 'blur' }],
  content: [{ required: true, message: '請輸入內容', trigger: 'blur' }],
}

const { submitting, run } = useQuickAddSubmit()

const resetForm = () => {
  form.title = ''
  form.content = ''
  form.priority = 'normal'
  form.is_pinned = false
  formRef.value?.clearValidate()
}

watch(
  () => props.visible,
  (v) => {
    if (v) resetForm()
  },
)

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const result = await run({
    label: '公告',
    listPath: '/announcements',
    listLabel: '公告管理',
    context: 'QuickAnnouncementDialog:submit',
    submit: () => createAnnouncement({ ...form }),
  })
  if (result) emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="快速新增公告"
    width="520px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="標題" prop="title">
        <el-input v-model="form.title" maxlength="100" show-word-limit placeholder="公告標題" />
      </el-form-item>
      <el-form-item label="內容" prop="content">
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="5"
          maxlength="2000"
          show-word-limit
          placeholder="公告內容"
        />
      </el-form-item>
      <el-form-item label="優先級">
        <el-radio-group v-model="form.priority">
          <el-radio value="normal">一般</el-radio>
          <el-radio value="high">重要</el-radio>
          <el-radio value="urgent">緊急</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="置頂">
        <el-switch v-model="form.is_pinned" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">送出</el-button>
    </template>
  </el-dialog>
</template>
