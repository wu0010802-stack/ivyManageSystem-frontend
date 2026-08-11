<template>
  <div class="tracking-panel">
    <div class="tracking-panel__toolbar">
      <div class="tracking-panel__filters">
        <el-select v-model="filters.status" placeholder="狀態" clearable style="width: 140px" @change="load">
          <el-option label="待簽" value="pending" />
          <el-option label="已簽" value="signed" />
          <el-option label="已作廢" value="voided" />
        </el-select>
        <el-select
          v-model="filters.template_id"
          placeholder="文件"
          clearable
          filterable
          style="width: 200px"
          @change="load"
        >
          <el-option
            v-for="t in templates"
            :key="t.id"
            :label="t.title"
            :value="t.id"
          />
        </el-select>
        <el-select
          v-model="filters.classroom_id"
          placeholder="班級"
          clearable
          filterable
          style="width: 160px"
          @change="load"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </div>
      <el-button v-if="canWrite" type="primary" @click="openDispatchDialog">發送文件</el-button>
    </div>

    <el-table v-loading="loading" :data="requests" style="width: 100%" table-layout="auto">
      <el-table-column prop="student_name" label="學生" min-width="120" />
      <el-table-column prop="title" label="文件" min-width="160" />
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="發送時間" width="160">
        <template #default="{ row }">{{ formatDate(row.sent_at) }}</template>
      </el-table-column>
      <el-table-column label="簽署時間" width="160">
        <template #default="{ row }">{{ row.signed_at ? formatDate(row.signed_at) : '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'signed'"
            link
            type="primary"
            @click="viewPdf(row.id)"
          >
            看 PDF
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'pending'"
            link
            type="primary"
            :loading="resendingId === row.id"
            @click="resend(row.id)"
          >
            催簽
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'pending'"
            link
            type="danger"
            @click="voidOne(row.id)"
          >
            作廢
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && requests.length === 0" description="尚無簽署紀錄" />

    <el-dialog v-model="dispatchVisible" title="發送簽署文件" width="700px" @closed="resetDispatch">
      <el-steps :active="dispatchStep" finish-status="success" simple style="margin-bottom: 20px">
        <el-step title="選擇學生" />
        <el-step title="選擇文件" />
        <el-step title="確認送出" />
      </el-steps>

      <div v-if="dispatchStep === 0">
        <el-form-item label="班級">
          <el-select v-model="dispatchClassroomId" placeholder="選擇班級" filterable @change="onDispatchClassroomChange">
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-checkbox
          v-if="classroomStudents.length"
          :model-value="allStudentsSelected"
          @change="toggleSelectAllStudents"
        >
          全選（{{ classroomStudents.length }} 位）
        </el-checkbox>
        <el-checkbox-group v-model="selectedStudentIds" class="tracking-panel__student-list">
          <el-checkbox v-for="s in classroomStudents" :key="s.id" :value="s.id" :label="s.id">
            {{ s.name }}
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <div v-else-if="dispatchStep === 1">
        <el-checkbox-group v-model="selectedTemplateIds">
          <div v-for="t in activeTemplates" :key="t.id" class="tracking-panel__template-option">
            <el-checkbox :value="t.id" :label="t.id">{{ t.title }}（{{ docTypeLabel(t.doc_type) }}）</el-checkbox>
          </div>
        </el-checkbox-group>
      </div>

      <div v-else>
        <p>將對 <strong>{{ selectedStudentIds.length }}</strong> 位學生發送 <strong>{{ selectedTemplateIds.length }}</strong> 份文件。</p>
        <p class="tracking-panel__confirm-hint">共 {{ selectedStudentIds.length * selectedTemplateIds.length }} 筆簽署請求。</p>
      </div>

      <template #footer>
        <el-button @click="dispatchVisible = false">取消</el-button>
        <el-button v-if="dispatchStep > 0" @click="dispatchStep -= 1">上一步</el-button>
        <el-button
          v-if="dispatchStep < 2"
          type="primary"
          :disabled="!canProceedDispatch"
          @click="dispatchStep += 1"
        >
          下一步
        </el-button>
        <el-button v-else type="primary" :loading="dispatching" @click="submitDispatch">
          確認送出
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listSignTemplates,
  listSignRequests,
  createSignBatch,
  voidSignRequest,
  resendSignNotification,
  signRequestPdfUrl,
} from '@/api/signDocuments'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'

defineProps<{ canWrite: boolean }>()

interface RequestRow {
  id: number
  student_id: number
  student_name: string
  title: string
  status: string
  sent_at: string
  signed_at: string | null
}

interface TemplateOption {
  id: number
  title: string
  doc_type: string
  is_active: boolean
}

interface ClassroomOption {
  id: number
  name: string
}

interface StudentOption {
  id: number
  name: string
}

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: '入學契約',
  consent_form: '同意書',
  photo_release: '照片授權書',
  other: '其他',
}
function docTypeLabel(v: string) {
  return DOC_TYPE_LABELS[v] ?? v
}

const STATUS_LABELS: Record<string, string> = { pending: '待簽', signed: '已簽', voided: '已作廢' }
function statusLabel(v: string) {
  return STATUS_LABELS[v] ?? v
}
function statusTagType(v: string): 'warning' | 'success' | 'info' {
  if (v === 'signed') return 'success'
  if (v === 'voided') return 'info'
  return 'warning'
}
function formatDate(iso: string) {
  return iso ? iso.replace('T', ' ').slice(0, 16) : ''
}

const requests = ref<RequestRow[]>([])
const templates = ref<TemplateOption[]>([])
const classrooms = ref<ClassroomOption[]>([])
const loading = ref(false)
const filters = reactive<{ status: string; template_id: number | null; classroom_id: number | null }>({
  status: '',
  template_id: null,
  classroom_id: null,
})

const activeTemplates = computed(() => templates.value.filter((t) => t.is_active))

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filters.status) params.status = filters.status
    if (filters.template_id) params.template_id = filters.template_id
    if (filters.classroom_id) params.classroom_id = filters.classroom_id
    const { data } = await listSignRequests(params)
    requests.value = data as RequestRow[]
  } catch {
    ElMessage.error('追蹤列表載入失敗')
  } finally {
    loading.value = false
  }
}

async function loadTemplates() {
  const { data } = await listSignTemplates({ include_inactive: true })
  templates.value = data as TemplateOption[]
}

async function loadClassrooms() {
  // getClassrooms() 回傳 ClassroomListItemOut[] 純陣列（非分頁包裝）。
  const { data } = await getClassrooms()
  classrooms.value = data as unknown as ClassroomOption[]
}

onMounted(() => {
  load()
  loadTemplates()
  loadClassrooms()
})

async function viewPdf(requestId: number) {
  window.open(signRequestPdfUrl(requestId), '_blank', 'noopener')
}

const resendingId = ref<number | null>(null)
async function resend(requestId: number) {
  resendingId.value = requestId
  try {
    await resendSignNotification(requestId)
    ElMessage.success('已重新推播通知')
  } catch {
    ElMessage.error('催簽失敗')
  } finally {
    resendingId.value = null
  }
}

async function voidOne(requestId: number) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('作廢原因', '作廢文件', {
      confirmButtonText: '確認作廢',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v && v.trim() ? true : '請輸入原因'),
    })
    reason = (result as { value: string }).value.trim()
  } catch {
    return
  }
  try {
    await voidSignRequest(requestId, { reason })
    ElMessage.success('已作廢')
    await load()
  } catch {
    ElMessage.error('作廢失敗')
  }
}

// ── 發送精靈 ──────────────────────────────────────────────────
const dispatchVisible = ref(false)
const dispatchStep = ref(0)
const dispatchClassroomId = ref<number | null>(null)
const classroomStudents = ref<StudentOption[]>([])
const selectedStudentIds = ref<number[]>([])
const selectedTemplateIds = ref<number[]>([])
const dispatching = ref(false)

const allStudentsSelected = computed(
  () =>
    classroomStudents.value.length > 0 &&
    selectedStudentIds.value.length === classroomStudents.value.length,
)

function toggleSelectAllStudents(checked: string | number | boolean) {
  selectedStudentIds.value = checked ? classroomStudents.value.map((s) => s.id) : []
}

async function onDispatchClassroomChange(classroomId: number) {
  // getStudents() 回傳 StudentListOut = {items, limit, skip, total}（分頁包裝）；
  // limit 顯式帶大值避免大班級被預設分頁截斷。
  const { data } = await getStudents({ classroom_id: classroomId, is_active: true, limit: 500 })
  classroomStudents.value = (data.items ?? []) as unknown as StudentOption[]
  selectedStudentIds.value = classroomStudents.value.map((s) => s.id)
}

const canProceedDispatch = computed(() => {
  if (dispatchStep.value === 0) return selectedStudentIds.value.length > 0
  if (dispatchStep.value === 1) return selectedTemplateIds.value.length > 0
  return true
})

function openDispatchDialog() {
  resetDispatch()
  dispatchVisible.value = true
}

function resetDispatch() {
  dispatchStep.value = 0
  dispatchClassroomId.value = null
  classroomStudents.value = []
  selectedStudentIds.value = []
  selectedTemplateIds.value = []
}

async function submitDispatch() {
  dispatching.value = true
  try {
    const { data } = await createSignBatch({
      student_ids: selectedStudentIds.value,
      template_ids: selectedTemplateIds.value,
    })
    let msg = `已建立 ${data.created} 筆簽署請求`
    if (data.unnotifiable_student_ids?.length) {
      msg += `，${data.unnotifiable_student_ids.length} 位學生的家長尚未綁定 LINE，需先發綁定碼`
    }
    if (data.skipped?.length) {
      msg += `，${data.skipped.length} 筆因已存在待簽/已簽文件而跳過`
    }
    ElMessage.success(msg)
    dispatchVisible.value = false
    await load()
  } catch {
    ElMessage.error('發送失敗')
  } finally {
    dispatching.value = false
  }
}

defineExpose({ load })
</script>

<style scoped>
.tracking-panel__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3, 12px);
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}

.tracking-panel__filters {
  display: flex;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.tracking-panel__student-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  margin-top: var(--space-2, 8px);
}

.tracking-panel__template-option {
  padding: var(--space-2, 8px) 0;
}

.tracking-panel__confirm-hint {
  color: var(--el-text-color-secondary, #909399);
}
</style>
