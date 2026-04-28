<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="新增報名（後台手動）"
    width="560px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="90px">
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
      <el-form-item label="Email">
        <el-input v-model="form.email" :maxlength="FIELD_RULES.emailMax" placeholder="選填" />
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
      <el-form-item label="備註">
        <el-input v-model="form.remark" type="textarea" :rows="2" :maxlength="FIELD_RULES.remarkMax" />
      </el-form-item>
    </el-form>
    <div class="create-summary">
      總計：<strong>NT$ {{ totalAmount.toLocaleString() }}</strong>
      <span v-if="totalAmount === 0" class="create-hint">（未選擇課程或用品）</span>
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

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createRegistration, getSupplies } from '@/api/activity'
import { FIELD_RULES } from '@/constants/activity'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  schoolYear: { type: Number, required: true },
  semester: { type: Number, required: true },
  classroomOptions: { type: Array, default: () => [] },
  courseOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'created'])

const creating = ref(false)
const loadingSupplies = ref(false)
const supplyOptions = ref([])

const form = reactive({
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
    supplyOptions.value = res.data.supplies || []
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

const isValid = computed(() => !!form.name && !!form.birthday && !!form.class_)

const totalAmount = computed(() => {
  let sum = 0
  for (const n of form.courseNames) {
    const c = props.courseOptions.find((x) => x.name === n)
    if (c) sum += c.price || 0
  }
  for (const n of form.supplyNames) {
    const s = supplyOptions.value.find((x) => x.name === n)
    if (s) sum += s.price || 0
  }
  return sum
})

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
    ElMessage.success(res.data.message || '新增成功')
    emit('update:modelValue', false)
    // 強制下次開啟時重新載入用品（本次新增可能影響庫存）
    supplyOptions.value = []
    emit('created')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '新增失敗')
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
  color: #374151;
}
.create-hint { color: #9ca3af; margin-left: 8px; font-size: 13px; }
</style>
