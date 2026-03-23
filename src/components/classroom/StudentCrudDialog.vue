<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createStudent, updateStudent } from '@/api/students'
import { STUDENT_STATUS_TAG_OPTIONS } from '@/utils/student'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: Boolean,
  isEdit: Boolean,
  classroomId: { type: Number, default: null },
  initialData: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'saved'])

const studentFormRef = ref(null)
const studentForm = reactive({
  id: null,
  student_id: '',
  name: '',
  gender: null,
  birthday: '',
  classroom_id: null,
  enrollment_date: '',
  parent_name: '',
  parent_phone: '',
  address: '',
  status_tag: '',
  allergy: '',
  medication: '',
  special_needs: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relation: '',
})
const studentRules = {
  student_id: [{ required: true, message: '請輸入學生編號', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
}

watch(() => props.visible, (val) => {
  if (val) {
    if (props.initialData) {
      Object.assign(studentForm, props.initialData)
    } else {
      Object.assign(studentForm, {
        id: null, student_id: '', name: '', gender: null, birthday: '',
        classroom_id: props.classroomId, enrollment_date: '',
        parent_name: '', parent_phone: '', address: '', status_tag: '',
        allergy: '', medication: '', special_needs: '',
        emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '',
      })
    }
    studentFormRef.value?.clearValidate()
  }
})

const handleClose = () => {
  emit('update:visible', false)
}

const handleSubmit = async () => {
  if (!studentFormRef.value) return
  await studentFormRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      if (props.isEdit) {
        await updateStudent(studentForm.id, studentForm)
      } else {
        await createStudent(studentForm)
      }
      ElMessage.success(props.isEdit ? '更新成功' : '新增成功')
      emit('update:visible', false)
      emit('saved')
    } catch (error) {
      ElMessage.error(apiError(error, '操作失敗'))
    }
  })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '編輯學生' : '新增學生'"
    width="500px"
    @update:model-value="handleClose"
  >
    <el-form :model="studentForm" :rules="studentRules" ref="studentFormRef" label-width="100px">
      <el-form-item label="學生編號" prop="student_id">
        <el-input v-model="studentForm.student_id" placeholder="例: S001" />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="studentForm.name" />
      </el-form-item>
      <el-form-item label="性別">
        <el-radio-group v-model="studentForm.gender">
          <el-radio value="男">男</el-radio>
          <el-radio value="女">女</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="生日">
        <el-date-picker v-model="studentForm.birthday" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
      </el-form-item>
      <el-form-item label="入學日">
        <el-date-picker v-model="studentForm.enrollment_date" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
      </el-form-item>
      <el-form-item label="家長姓名">
        <el-input v-model="studentForm.parent_name" />
      </el-form-item>
      <el-form-item label="電話">
        <el-input v-model="studentForm.parent_phone" />
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="studentForm.address" type="textarea" :rows="2" />
      </el-form-item>
      <el-divider content-position="left" style="margin: 8px 0 4px">緊急聯絡人</el-divider>
      <el-form-item label="姓名">
        <el-input v-model="studentForm.emergency_contact_name" placeholder="例: 王奶奶" />
      </el-form-item>
      <el-form-item label="電話">
        <el-input v-model="studentForm.emergency_contact_phone" />
      </el-form-item>
      <el-form-item label="關係">
        <el-input v-model="studentForm.emergency_contact_relation" placeholder="例: 祖母、舅舅" />
      </el-form-item>
      <el-form-item label="狀態標籤">
        <el-select
          v-model="studentForm.status_tag"
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="選擇或輸入標籤"
          style="width: 100%"
        >
          <el-option v-for="tag in STUDENT_STATUS_TAG_OPTIONS" :key="tag" :label="tag" :value="tag" />
        </el-select>
      </el-form-item>
      <el-divider content-position="left" style="margin: 8px 0 4px">健康資訊</el-divider>
      <el-form-item label="過敏原">
        <el-input v-model="studentForm.allergy" type="textarea" :rows="2" placeholder="例: 花生、塵蟎" />
      </el-form-item>
      <el-form-item label="用藥說明">
        <el-input v-model="studentForm.medication" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="特殊需求">
        <el-input v-model="studentForm.special_needs" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSubmit">確認</el-button>
    </template>
  </el-dialog>
</template>
