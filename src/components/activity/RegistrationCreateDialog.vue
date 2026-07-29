<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="新增報名（後台手動）"
    width="560px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-position="top">
      <el-form-item label="學生姓名" required>
        <el-input v-model="form.name" :maxlength="FIELD_RULES.studentNameMax" placeholder="請輸入學生姓名" />
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
        <el-select v-model="form.class_" placeholder="選擇班級" style="width: 100%">
          <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
        </el-select>
      </el-form-item>
      <el-form-item label="課程">
        <el-select
          v-model="form.courseNames"
          multiple
          filterable
          placeholder="選擇課程（可多選）"
          style="width: 100%"
        >
          <el-option
            v-for="c in courseOptions"
            :key="c.id"
            :label="`${c.name}（$${c.price}，剩 ${c.remaining}/${c.capacity}）`"
            :value="c.name"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="用品">
        <el-select
          v-model="form.supplyNames"
          multiple
          filterable
          placeholder="選擇用品（可多選）"
          style="width: 100%"
          :loading="loadingSupplies"
        >
          <el-option
            v-for="s in supplyOptions"
            :key="s.id"
            :label="`${s.name}（$${s.price}）`"
            :value="s.name"
          />
        </el-select>
      </el-form-item>

      <!-- 補充（選填） -->
      <FormSection data-test="section-extra" title="補充（選填）" collapsible :default-open="false">
        <el-form-item label="Email">
          <el-input v-model="form.email" :maxlength="FIELD_RULES.emailMax" placeholder="選填" />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="form.remark" type="textarea" :rows="2" :maxlength="FIELD_RULES.remarkMax" />
        </el-form-item>
      </FormSection>
    </el-form>
    <div class="create-summary">
      <div data-test="current-estimated-total">
        目前預估應繳：<strong>NT$ {{ totalAmount.toLocaleString() }}</strong>
        <span
          v-if="form.courseNames.length === 0 && form.supplyNames.length === 0"
          class="create-hint"
        >（未選擇課程或用品）</span>
      </div>
      <div class="create-estimate-note">實際依送出時名額與配位結果計費</div>
      <template v-if="waitlistCourses.length > 0">
        <div data-test="estimated-total" class="create-estimate">
          候補全數轉正式後預估：<strong>NT$ {{ estimatedTotalAmount.toLocaleString() }}</strong>
        </div>
        <div data-test="waitlist-unbilled" class="create-waitlist">
          <span class="create-waitlist__label">候補未計費：</span>
          <span
            v-for="(course, index) in waitlistCourses"
            :key="String(course.id ?? course.name)"
          >
            {{ index > 0 ? '、' : '' }}{{ course.name }}
            （NT$ {{ (Number(course.price) || 0).toLocaleString() }}）
          </span>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="creating"
        :disabled="!isValid"
        @click="handleCreate"
      >確認新增</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createRegistration, getSupplies } from '@/api/activity'
import { FIELD_RULES } from '@/constants/activity'
import FormSection from '@/components/common/FormSection.vue'

interface OptionItem {
  id?: number | string
  name: string
  price?: number | string
  remaining?: number
  capacity?: number
  allow_waitlist?: boolean
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  modelValue?: boolean
  schoolYear: number
  semester: number
  classroomOptions?: string[]
  courseOptions?: OptionItem[]
}>(), {
  modelValue: false,
  classroomOptions: () => [],
  courseOptions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'created': []
}>()

const creating = ref<boolean>(false)
const loadingSupplies = ref<boolean>(false)
const supplyOptions = ref<OptionItem[]>([])

const form = reactive<{
  name: string
  birthday: string
  class_: string
  email: string
  courseNames: string[]
  supplyNames: string[]
  remark: string
}>({
  name: '',
  birthday: '',
  class_: '',
  email: '',
  courseNames: [],
  supplyNames: [],
  remark: '',
})

function resetForm() {
  form.name = ''
  form.birthday = ''
  form.class_ = ''
  form.email = ''
  form.courseNames = []
  form.supplyNames = []
  form.remark = ''
}

async function loadSupplies() {
  if (supplyOptions.value.length > 0) return
  loadingSupplies.value = true
  try {
    const res = await getSupplies({ school_year: props.schoolYear, semester: props.semester })
    supplyOptions.value = (res.data as { supplies?: OptionItem[] }).supplies || []
  } catch {
    ElMessage.warning('用品清單載入失敗')
  } finally {
    loadingSupplies.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    resetForm()
    loadSupplies()
  }
)

// 學年/學期變動時讓用品清單重抓
watch(
  () => [props.schoolYear, props.semester],
  () => {
    supplyOptions.value = []
  }
)

// 至少一門課程或一項用品（對齊後端 invariant：公開/家長/後台一致），
// 否則送出會被後端 400 退回。
const isValid = computed(
  () =>
    !!form.name &&
    !!form.birthday &&
    !!form.class_ &&
    (form.courseNames.length > 0 || form.supplyNames.length > 0),
)

const selectedCourses = computed(() =>
  form.courseNames
    .map((name) => props.courseOptions.find((course) => course.name === name))
    .filter((course): course is OptionItem => course !== undefined),
)

const waitlistCourses = computed(() =>
  selectedCourses.value.filter(
    (course) => course.remaining === 0 && course.allow_waitlist === true,
  ),
)

const totalAmount = computed(() => {
  const waitlistNames = new Set(waitlistCourses.value.map((course) => course.name))
  let sum = selectedCourses.value.reduce(
    (total, course) =>
      waitlistNames.has(course.name) ? total : total + (Number(course.price) || 0),
    0,
  )
  for (const n of form.supplyNames) {
    const s = supplyOptions.value.find((x) => x.name === n)
    if (s) sum += Number(s.price) || 0
  }
  return sum
})

const estimatedTotalAmount = computed(() =>
  totalAmount.value
  + waitlistCourses.value.reduce(
    (total, course) => total + (Number(course.price) || 0),
    0,
  ),
)

async function handleCreate() {
  if (!isValid.value || creating.value) return
  creating.value = true
  try {
    const payload = {
      name: form.name.trim(),
      birthday: form.birthday,
      class: form.class_,
      email: form.email?.trim() || null,
      remark: form.remark || '',
      courses: form.courseNames.map((name) => ({ name, price: '' })),
      supplies: form.supplyNames.map((name) => ({ name, price: '' })),
      school_year: props.schoolYear,
      semester: props.semester,
    }
    const res = await createRegistration(payload)
    ElMessage.success((res.data as { message?: string }).message || '新增成功')
    emit('update:modelValue', false)
    // 強制下次開啟時重新載入用品（本次新增可能影響庫存）
    supplyOptions.value = []
    emit('created')
  } catch (e) {
    const axiosErr = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '新增失敗')
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.create-summary {
  text-align: right;
  font-size: 14px;
  margin-top: 8px;
  color: var(--neutral-700);
}
.create-estimate { margin-top: 4px; color: var(--text-secondary); }
.create-estimate-note { margin-top: 2px; color: var(--text-tertiary); font-size: 12px; }
.create-waitlist {
  margin-top: 6px;
  color: var(--el-color-warning-dark-2);
  font-size: 13px;
}
.create-waitlist__label { font-weight: 600; }
.create-hint { color: var(--text-tertiary); margin-left: 8px; font-size: 13px; }
</style>
