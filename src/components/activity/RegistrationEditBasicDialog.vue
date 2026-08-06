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
      <el-form-item label="生日">
        <el-date-picker
          v-model="form.birthday"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          placeholder="YYYY-MM-DD（選填）"
          style="width: 100%"
        />
        <div class="birthday-hint" data-test="birthday-hint">
          2026-08-03 起公開報名不再收生日，此欄可留空；留空送出不會變更既有生日。
        </div>
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

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateRegistrationBasic } from '@/api/activity'
import type { ApiBody } from '@/api/_generated/typed'
import { FIELD_RULES } from '@/constants/activity'

interface Initial {
  student_name?: string
  birthday?: string
  class_name?: string
  email?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  modelValue?: boolean
  registrationId?: string | number | null
  initial?: Initial
  classroomOptions?: string[]
}>(), {
  modelValue: false,
  registrationId: null,
  initial: () => ({}),
  classroomOptions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': []
}>()

const saving = ref<boolean>(false)
const form = reactive<{
  name: string
  birthday: string
  class_: string
  email: string
}>({
  name: '',
  birthday: '',
  class_: '',
  email: '',
})

// 開窗當下載入到的生日值，用來判斷使用者有沒有主動改過生日欄（見 handleSave 的 partial-update 契約）。
const initialBirthday = ref<string>('')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.name = props.initial.student_name || ''
    form.birthday = props.initial.birthday || ''
    form.class_ = props.initial.class_name || ''
    form.email = props.initial.email || ''
    initialBirthday.value = form.birthday
  },
  // 父層以 `v-if` 懶掛載，元件建立時 modelValue 已是 true；不帶 immediate 則四欄不預填，
  // 送出時會把既有 email 一併清成 null。
  { immediate: true }
)

// 生日不再是必填：2026-08-03 業主決策移除公開報名的生日欄後，新報名的 birthday 恆為 NULL，
// 再把它當必填會讓儲存鈕永遠 disabled，承辦連姓名／班級／Email 都改不了（也廢掉「改班級觸發重新比對」的救援路徑）。
const isValid = computed(() => !!form.name && !!form.class_)

async function handleSave() {
  if (!props.registrationId || !isValid.value || saving.value) return
  saving.value = true
  try {
    const payload: ApiBody<'/activity/registrations/{registration_id}', 'put'> = {
      name: form.name.trim(),
      class: form.class_,
      email: form.email?.trim() || null,
    }
    // partial-update 契約：payload 沒有 birthday key ＝ 不變更；有 key 但為 null ＝ 明確清空。
    // 缺 STUDENTS_READ 的員工看到的生日空白是後端遮罩（回 None）而非真的沒資料，
    // 所以「載入時為空且使用者沒動過」一律不帶 key，否則儲存會把真實生日靜默清成 NULL。
    if (form.birthday !== initialBirthday.value || initialBirthday.value !== '') {
      payload.birthday = form.birthday || null
    }
    await updateRegistrationBasic(props.registrationId as number, payload)
    ElMessage.success('基本資料已更新')
    emit('update:modelValue', false)
    emit('saved')
  } catch (e) {
    const axiosErr = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '更新失敗')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.birthday-hint {
  width: 100%;
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
