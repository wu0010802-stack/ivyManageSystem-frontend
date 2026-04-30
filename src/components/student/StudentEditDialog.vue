<script setup>
import { reactive, ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useStudentStore } from '@/stores/student'
import { STUDENT_STATUS_TAG_OPTIONS } from '@/utils/student'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'create' }, // 'create' | 'edit'
  initial: { type: Object, default: null },
  defaultClassroomId: { type: Number, default: null },
  lockClassroom: { type: Boolean, default: false },
  classroomOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:visible', 'saved'])

const isEdit = computed(() => props.mode === 'edit')

const formatClassroomLabel = (c) => {
  if (!c) return ''
  const parts = [c.name]
  if (c.semester_label) parts.push(c.semester_label)
  if (c.grade_name) parts.push(c.grade_name)
  return parts.join('｜')
}

const formRef = ref(null)
const submitting = ref(false)

const emptyForm = () => ({
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

const form = reactive(emptyForm())

const rules = {
  student_id: [{ required: true, message: '請輸入學生編號', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
}

watch(
  () => props.visible,
  (val) => {
    if (!val) return
    Object.assign(form, emptyForm())
    if (props.initial) {
      Object.assign(form, props.initial)
    } else if (props.defaultClassroomId) {
      form.classroom_id = props.defaultClassroomId
    }
    formRef.value?.clearValidate()
  },
)

const close = () => emit('update:visible', false)

const submit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      const studentStore = useStudentStore()
      if (isEdit.value) {
        await studentStore.updateStudent(form.id, form)
      } else {
        await studentStore.createStudent(form)
      }
      ElMessage.success(isEdit.value ? '更新成功' : '新增成功')
      emit('saved', { ...form })
      close()
    } catch (error) {
      const detail = error.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((e) => e.msg).join('；')
        : (detail ?? apiError(error, '操作失敗'))
      ElMessage.error(msg)
    } finally {
      submitting.value = false
    }
  })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '編輯學生' : '新增學生'"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item label="學生編號" prop="student_id">
        <el-input v-model="form.student_id" placeholder="例: S001" />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="性別">
        <el-radio-group v-model="form.gender">
          <el-radio value="男">男</el-radio>
          <el-radio value="女">女</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="生日">
        <el-date-picker
          v-model="form.birthday"
          type="date"
          placeholder="選擇日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="班級" v-if="classroomOptions.length || form.classroom_id">
        <el-select
          v-model="form.classroom_id"
          placeholder="選擇班級"
          :disabled="lockClassroom"
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="c in classroomOptions"
            :key="c.id"
            :label="formatClassroomLabel(c)"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="入學日">
        <el-date-picker
          v-model="form.enrollment_date"
          type="date"
          placeholder="選擇日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>

      <el-divider content-position="left" style="margin: 12px 0 8px">家長資訊</el-divider>
      <el-form-item label="家長姓名">
        <el-input v-model="form.parent_name" />
      </el-form-item>
      <el-form-item label="電話">
        <el-input v-model="form.parent_phone" />
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="form.address" type="textarea" :rows="2" />
      </el-form-item>

      <el-divider content-position="left" style="margin: 12px 0 8px">緊急聯絡人</el-divider>
      <el-form-item label="姓名">
        <el-input v-model="form.emergency_contact_name" placeholder="例: 王奶奶" />
      </el-form-item>
      <el-form-item label="電話">
        <el-input v-model="form.emergency_contact_phone" />
      </el-form-item>
      <el-form-item label="關係">
        <el-input v-model="form.emergency_contact_relation" placeholder="例: 祖母、舅舅" />
      </el-form-item>

      <el-form-item label="狀態標籤">
        <el-select
          v-model="form.status_tag"
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="選擇或輸入標籤"
          style="width: 100%"
        >
          <el-option
            v-for="tag in STUDENT_STATUS_TAG_OPTIONS"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
      </el-form-item>

      <el-divider content-position="left" style="margin: 12px 0 8px">健康資訊</el-divider>
      <el-form-item label="過敏原">
        <el-input
          v-model="form.allergy"
          type="textarea"
          :rows="2"
          placeholder="例: 花生、塵蟎"
        />
      </el-form-item>
      <el-form-item label="用藥說明">
        <el-input v-model="form.medication" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="特殊需求">
        <el-input v-model="form.special_needs" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>

    <slot
      name="extra"
      :mode="mode"
      :is-edit="isEdit"
      :classroom-id="form.classroom_id"
    />

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">確認</el-button>
    </template>
  </el-dialog>
</template>
