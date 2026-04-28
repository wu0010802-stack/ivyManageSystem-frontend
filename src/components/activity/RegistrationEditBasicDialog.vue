<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="編輯基本資料"
    width="480px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="90px">
      <el-form-item label="學生姓名" required>
        <el-input v-model="form.name" :maxlength="FIELD_RULES.studentNameMax" />
      </el-form-item>
      <el-form-item label="生日" required>
        <el-date-picker
          v-model="form.birthday"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          placeholder="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="班級" required>
        <el-select v-model="form.class_" style="width: 100%">
          <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
        </el-select>
      </el-form-item>
      <el-form-item label="Email">
        <el-input v-model="form.email" :maxlength="FIELD_RULES.emailMax" placeholder="選填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!isValid"
        @click="handleSave"
      >儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateRegistrationBasic } from '@/api/activity'
import { FIELD_RULES } from '@/constants/activity'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  registrationId: { type: [String, Number], default: null },
  initial: { type: Object, default: () => ({}) },
  classroomOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const saving = ref(false)
const form = reactive({
  name: '',
  birthday: '',
  class_: '',
  email: '',
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.name = props.initial.student_name || ''
    form.birthday = props.initial.birthday || ''
    form.class_ = props.initial.class_name || ''
    form.email = props.initial.email || ''
  }
)

const isValid = computed(() => !!form.name && !!form.birthday && !!form.class_)

async function handleSave() {
  if (!props.registrationId || !isValid.value || saving.value) return
  saving.value = true
  try {
    await updateRegistrationBasic(props.registrationId, {
      name: form.name.trim(),
      birthday: form.birthday,
      class: form.class_,
      email: form.email?.trim() || null,
    })
    ElMessage.success('基本資料已更新')
    emit('update:modelValue', false)
    emit('saved')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '更新失敗')
  } finally {
    saving.value = false
  }
}
</script>
