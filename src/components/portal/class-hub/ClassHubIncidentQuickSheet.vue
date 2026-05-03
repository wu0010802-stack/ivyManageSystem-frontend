<template>
  <el-drawer
    :model-value="show"
    direction="btt"
    size="80%"
    title="快速登記事件"
    @update:model-value="$emit('update:show', $event)"
    @open="onOpen"
  >
    <div v-loading="submitting" class="inc-sheet">
      <el-form :model="form" label-position="top">
        <el-form-item label="學生" required>
          <el-select
            v-model="form.student_id"
            filterable
            placeholder="選擇學生"
            style="width: 100%"
          >
            <el-option
              v-for="s in students"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="類型" required>
          <el-radio-group v-model="form.incident_type">
            <el-radio-button label="意外受傷" />
            <el-radio-button label="行為觀察" />
            <el-radio-button label="身體健康" />
            <el-radio-button label="其他" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="嚴重程度">
          <el-radio-group v-model="form.severity">
            <el-radio-button label="輕微" />
            <el-radio-button label="中度" />
            <el-radio-button label="嚴重" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="簡述" required>
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="一兩句話描述（可從詳細頁面補充更多細節）"
          />
        </el-form-item>
      </el-form>

      <div class="inc-actions">
        <el-button @click="onCancel">取消</el-button>
        <el-button type="primary" @click="onSaveBrief" :disabled="!isValid">
          儲存簡略
        </el-button>
        <el-button type="primary" plain @click="onSaveAndDetail" :disabled="!isValid">
          儲存並進詳細
        </el-button>
      </div>
      <p v-if="error" class="inc-error">{{ error }}</p>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMyStudents } from '@/api/portal'
import { createPortalIncident } from '@/api/studentIncidents'

const props = defineProps({
  show: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show', 'done'])
const router = useRouter()

const students = ref([])
const submitting = ref(false)
const error = ref('')

const form = reactive({
  student_id: null,
  incident_type: '行為觀察',
  severity: '輕微',
  description: '',
})

const isValid = computed(
  () => !!form.student_id && !!form.incident_type && !!form.description?.trim(),
)

async function loadStudents() {
  try {
    const res = await getMyStudents()
    const data = res.data ?? res
    if (Array.isArray(data.students)) {
      students.value = data.students
    } else if (Array.isArray(data.groups)) {
      students.value = data.groups.flatMap((g) => g.students || [])
    } else {
      students.value = []
    }
  } catch (e) {
    error.value = '載入學生清單失敗'
    students.value = []
  }
}

function buildPayload() {
  return {
    student_id: form.student_id,
    incident_type: form.incident_type,
    severity: form.severity || null,
    occurred_at: new Date().toISOString(),
    description: form.description.trim(),
    parent_notified: false,
  }
}

async function onSaveBrief() {
  if (!isValid.value) return
  submitting.value = true
  error.value = ''
  try {
    await createPortalIncident(buildPayload())
    ElMessage.success('事件已登記')
    emit('done')
    emit('update:show', false)
    resetForm()
  } catch (e) {
    error.value = '儲存失敗'
  } finally {
    submitting.value = false
  }
}

async function onSaveAndDetail() {
  if (!isValid.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await createPortalIncident(buildPayload())
    const created = res.data ?? res
    emit('done')
    emit('update:show', false)
    resetForm()
    // Jump to detail page; pass id as query so the page can scroll to / select it.
    const id = created?.id
    router.push(`/portal/incidents?from=hub${id ? '&id=' + id : ''}`)
  } catch (e) {
    error.value = '儲存失敗'
  } finally {
    submitting.value = false
  }
}

function onCancel() {
  emit('update:show', false)
  resetForm()
}

function resetForm() {
  form.student_id = null
  form.incident_type = '行為觀察'
  form.severity = '輕微'
  form.description = ''
  error.value = ''
}

function onOpen() {
  loadStudents()
}
</script>

<style scoped>
.inc-sheet {
  padding: 16px;
}
.inc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.inc-error {
  color: var(--el-color-danger);
  text-align: center;
  margin-top: 8px;
}
</style>
