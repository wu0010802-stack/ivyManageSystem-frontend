<template>
  <el-dialog
    v-model="visible"
    title="轉為正式學生"
    width="560px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-alert
      v-if="visit"
      :title="`訪視紀錄：${visit.child_name}（${visit.grade || '未指定年級'}，${visit.phone || '未留電話'}）`"
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
    />
    <el-alert
      v-if="visit?.enrolled"
      type="warning"
      title="此訪視已標記為已報到，若重複轉化將被後端拒絕"
      :closable="false"
      style="margin-bottom: 12px"
    />

    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
      <el-form-item label="學號" prop="student_id_code">
        <el-input v-model="form.student_id_code" placeholder="例：S2026001" maxlength="20" show-word-limit />
      </el-form-item>
      <el-form-item label="性別" prop="gender">
        <el-select v-model="form.gender" placeholder="選填" clearable style="width: 100%">
          <el-option label="男" value="男" />
          <el-option label="女" value="女" />
          <el-option label="其他" value="其他" />
        </el-select>
      </el-form-item>
      <el-form-item label="入學日期" prop="enrollment_date">
        <el-date-picker
          v-model="form.enrollment_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="留空為今日"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="分班" prop="classroom_id">
        <el-select
          v-model="form.classroom_id"
          placeholder="可留空"
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="c in classroomOptions"
            :key="c.id"
            :label="`${c.name}（${c.school_year}-${c.semester}）`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="初始狀態" prop="initial_lifecycle_status">
        <el-radio-group v-model="form.initial_lifecycle_status">
          <el-radio value="enrolled">已報到（未開學）</el-radio>
          <el-radio value="active">在學（已開學）</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">確認轉化</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { convertRecruitmentRecord } from '@/api/recruitment'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  visit: { type: Object, default: null },
  classroomOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'converted'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const emptyForm = () => ({
  student_id_code: '',
  gender: null,
  enrollment_date: '',
  classroom_id: null,
  initial_lifecycle_status: 'enrolled',
})
const form = reactive(emptyForm())
const formRef = ref(null)
const submitting = ref(false)

const rules = {
  student_id_code: [
    { required: true, message: '請輸入學號', trigger: 'blur' },
    { max: 20, message: '學號不超過 20 字元', trigger: 'blur' },
  ],
  initial_lifecycle_status: [
    { required: true, message: '請選擇初始狀態', trigger: 'change' },
  ],
}

function resetForm() {
  Object.assign(form, emptyForm())
  formRef.value?.clearValidate()
}

watch(
  () => props.visit,
  (v) => {
    // 每次開啟時重置
    resetForm()
    if (v?.gender) form.gender = v.gender
  },
)

async function handleSubmit() {
  if (!props.visit) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = {
      student_id_code: form.student_id_code.trim(),
      gender: form.gender || null,
      enrollment_date: form.enrollment_date || null,
      classroom_id: form.classroom_id || null,
      initial_lifecycle_status: form.initial_lifecycle_status,
    }
    const { data } = await convertRecruitmentRecord(props.visit.id, payload)
    ElMessage.success(data.message || '已成功轉為正式學生')
    emit('converted', data)
    visible.value = false
  } catch (err) {
    ElMessage.error(err.displayMessage || '轉化失敗')
  } finally {
    submitting.value = false
  }
}
</script>
