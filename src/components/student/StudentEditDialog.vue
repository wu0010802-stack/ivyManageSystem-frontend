<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useStudentStore } from '@/stores/student'
import { STUDENT_STATUS_TAG_OPTIONS } from '@/utils/student'
import { apiError } from '@/utils/error'

const props = withDefaults(defineProps<{
  visible?: boolean
  mode?: string
  initial?: Record<string, unknown> | null
  defaultClassroomId?: number | null
  lockClassroom?: boolean
  classroomOptions?: Record<string, unknown>[]
}>(), {
  visible: false,
  mode: 'create',
  initial: null,
  defaultClassroomId: null,
  lockClassroom: false,
  classroomOptions: () => [],
})
const emit = defineEmits<{
  'update:visible': [v: boolean]
  'saved': [data: Record<string, unknown>]
}>()

const isEdit = computed(() => props.mode === 'edit')

const formatClassroomLabel = (c: Record<string, unknown> | null) => {
  if (!c) return ''
  const parts = [c.name as string]
  if (c.semester_label) parts.push(c.semester_label as string)
  if (c.grade_name) parts.push(c.grade_name as string)
  return parts.join('｜')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formRef = ref<any>(null)
const submitting = ref(false)
const govActive = ref<string[]>([])  // 政府申報資料折疊區，預設關閉

interface StudentForm {
  id: number | null
  student_id: string
  name: string
  gender: string | null
  birthday: string
  classroom_id: number | null
  enrollment_date: string
  parent_name: string
  parent_phone: string
  address: string
  status_tag: string
  allergy: string
  medication: string
  special_needs: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relation: string
  id_number: string
  nationality: string
  household_address: string
  is_disadvantaged: boolean
  low_income_status: string
  indigenous_status: string
  disability_type: string
  disability_level: string
  disability_cert_no: string
  disability_cert_expiry: string | null
  [key: string]: unknown
}

const emptyForm = (): StudentForm => ({
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
  id_number: '',
  nationality: '本國',
  household_address: '',
  is_disadvantaged: false,
  low_income_status: '',
  indigenous_status: '',
  disability_type: '',
  disability_level: '',
  disability_cert_no: '',
  disability_cert_expiry: null,
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
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    submitting.value = true
    try {
      const studentStore = useStudentStore()
      if (isEdit.value) {
        await studentStore.updateStudent(form.id as number, form)
      } else {
        await studentStore.createStudent(form)
      }
      ElMessage.success(isEdit.value ? '更新成功' : '新增成功')
      emit('saved', { ...form })
      close()
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (error as any)?.response?.data?.detail
      const msg = Array.isArray(detail)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? detail.map((e: any) => e.msg).join('；')
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
        <el-radio-group :model-value="form.gender ?? undefined" @update:model-value="(v: string | number | boolean | undefined) => (form.gender = (v as string) ?? null)">
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
            :key="c.id as PropertyKey"
            :label="formatClassroomLabel(c)"
            :value="(c.id as number)"
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

      <!-- 政府申報資料（折疊區） -->
      <el-collapse class="gov-section" v-model="govActive">
        <el-collapse-item title="政府申報資料" name="gov">
          <el-form-item label="身分證字號">
            <el-input v-model="form.id_number" maxlength="20" />
          </el-form-item>
          <el-form-item label="國籍">
            <el-input v-model="form.nationality" maxlength="20" placeholder="本國" />
          </el-form-item>
          <el-form-item label="戶籍地址">
            <el-input v-model="form.household_address" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="弱勢標記">
            <el-switch v-model="form.is_disadvantaged" />
          </el-form-item>
          <el-form-item label="低收/中低收">
            <el-select v-model="form.low_income_status" clearable placeholder="(無)">
              <el-option label="低收入戶" value="low" />
              <el-option label="中低收入戶" value="mid_low" />
            </el-select>
          </el-form-item>
          <el-form-item label="原住民族">
            <el-input v-model="form.indigenous_status" placeholder="阿美/泰雅/..." />
          </el-form-item>
          <el-form-item label="身障類型">
            <el-select v-model="form.disability_type" clearable>
              <el-option label="智能障礙" value="智能障礙" />
              <el-option label="聽覺障礙" value="聽覺障礙" />
              <el-option label="視覺障礙" value="視覺障礙" />
              <el-option label="肢體障礙" value="肢體障礙" />
              <el-option label="語言障礙" value="語言障礙" />
              <el-option label="情緒行為障礙" value="情緒行為障礙" />
              <el-option label="學習障礙" value="學習障礙" />
              <el-option label="自閉症" value="自閉症" />
              <el-option label="多重障礙" value="多重障礙" />
            </el-select>
          </el-form-item>
          <el-form-item label="身障等級">
            <el-select v-model="form.disability_level" clearable>
              <el-option label="輕度" value="輕度" />
              <el-option label="中度" value="中度" />
              <el-option label="重度" value="重度" />
              <el-option label="極重度" value="極重度" />
            </el-select>
          </el-form-item>
          <el-form-item label="鑑定文號">
            <el-input v-model="form.disability_cert_no" maxlength="50" />
          </el-form-item>
          <el-form-item label="鑑定到期日">
            <el-date-picker
              v-model="form.disability_cert_expiry"
              type="date"
              placeholder="(無則永久)"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
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
