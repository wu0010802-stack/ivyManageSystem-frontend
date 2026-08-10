<template>
  <div class="portal-survey-detail" v-loading="loading">
    <div class="header">
      <h2>{{ classStatus?.survey.title }}</h2>
      <el-tag :type="classStatus?.survey.status === 'published' ? 'success' : 'warning'">
        {{ classStatus?.survey.status === 'published' ? '進行中' : '已結束' }}
      </el-tag>
    </div>

    <div class="summary" v-if="classStatus">
      <span class="summary__text">已回覆 {{ classStatus.replied.length }} / 未回覆 {{ classStatus.not_replied.length }}</span>
      <el-progress :percentage="progressPercentage" :format="() => `${classStatus?.replied.length}/${totalCount}`" />
    </div>

    <div class="not-replied-header">
      <h3>未回覆名單</h3>
      <el-tooltip content="截止後請改用代填" :disabled="canRemind">
        <span>
          <el-button :disabled="!canRemind" @click="onRemind">一鍵提醒</el-button>
        </span>
      </el-tooltip>
    </div>
    <el-table :data="classStatus?.not_replied ?? []" border>
      <template #empty><el-empty description="全部已回覆" /></template>
      <el-table-column label="班級" prop="classroom_name" width="140" />
      <el-table-column label="姓名" prop="name" min-width="120" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openFillDialog(row.student_id, row.name)">代填</el-button>
        </template>
      </el-table-column>
    </el-table>

    <h3>已回覆列表</h3>
    <el-table :data="classStatus?.replied ?? []" border>
      <template #empty><el-empty description="尚無回覆" /></template>
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="answers">
            <div v-for="q in classStatus?.questions ?? []" :key="q.id" class="answers__row">
              <span class="answers__label">{{ q.question_text }}：</span>
              <span>{{ formatAnswer(q, row.answers) }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="班級" prop="classroom_name" width="120" />
      <el-table-column label="姓名" prop="student_name" width="100" />
      <el-table-column label="參加" width="80">
        <template #default="{ row }">{{ row.attending ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="備註" min-width="120">
        <template #default="{ row }">{{ row.note ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="代填" width="70">
        <template #default="{ row }"><el-tag v-if="row.is_proxy" type="warning">代填</el-tag></template>
      </el-table-column>
      <el-table-column label="更新時間" width="160">
        <template #default="{ row }">{{ row.updated_at ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openFillDialog(row.student_id, row.student_name, row)">修改</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="fillDialogVisible" title="代填回覆" width="500px">
      <el-form v-if="fillTarget" label-width="80px">
        <el-form-item label="姓名">{{ fillTarget.name }}</el-form-item>
        <el-form-item label="是否參加">
          <el-radio-group v-model="fillForm.attending">
            <el-radio :label="true">參加</el-radio>
            <el-radio :label="false">不參加</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="fillForm.attending">
          <el-form-item v-for="q in classStatus?.questions ?? []" :key="q.id" :label="q.question_text">
            <el-radio-group
              v-if="q.question_type === 'single_choice'"
              :model-value="answerAsString(q.id)"
              @update:model-value="v => setAnswer(q.id, v)"
            >
              <el-radio v-for="opt in q.options ?? []" :key="opt" :label="opt">{{ opt }}</el-radio>
            </el-radio-group>
            <el-checkbox-group
              v-else-if="q.question_type === 'multi_choice'"
              :model-value="answerAsArray(q.id)"
              @update:model-value="v => setAnswer(q.id, v)"
            >
              <el-checkbox v-for="opt in q.options ?? []" :key="opt" :label="opt">{{ opt }}</el-checkbox>
            </el-checkbox-group>
            <el-input-number
              v-else-if="q.question_type === 'number'"
              :model-value="answerAsNumber(q.id)"
              :min="0"
              @update:model-value="v => setAnswer(q.id, v)"
            />
            <el-input
              v-else
              :model-value="answerAsString(q.id)"
              type="textarea"
              :rows="2"
              @update:model-value="v => setAnswer(q.id, v)"
            />
          </el-form-item>
        </template>
        <el-form-item label="備註">
          <el-input v-model="fillForm.note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fillDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="fillSubmitting" @click="onFillSubmit">送出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPortalSurveyClassStatus, portalFillResponse, portalRemindSurvey } from '@/api/surveys'

interface QuestionOut {
  id: number
  question_text: string
  question_type: 'single_choice' | 'multi_choice' | 'number' | 'text'
  options: string[] | null
  is_required: boolean
  sort_order: number
}
interface NotRepliedRow {
  student_id: number
  name: string
  classroom_name: string
}
interface ResponseRow {
  student_id: number
  student_name: string
  classroom_name: string
  attending: boolean
  answers: Record<string, unknown>
  note: string | null
  is_proxy: boolean
  submitted_by_user_id: number | null
  updated_at: string | null
}
interface ClassStatus {
  survey: { id: number; title: string; status: string; reply_deadline: string; event_date: string | null; fee_note: string | null }
  questions: QuestionOut[]
  replied: ResponseRow[]
  not_replied: NotRepliedRow[]
}

const route = useRoute()
const surveyId = Number(route.params.id)

const loading = ref(false)
const classStatus = ref<ClassStatus | null>(null)

const totalCount = computed(() => (classStatus.value ? classStatus.value.replied.length + classStatus.value.not_replied.length : 0))
const progressPercentage = computed(() => {
  if (!classStatus.value || totalCount.value === 0) return 0
  return Math.round((classStatus.value.replied.length / totalCount.value) * 100)
})

const canRemind = computed(() => {
  if (!classStatus.value) return false
  if (classStatus.value.survey.status !== 'published') return false
  return new Date(classStatus.value.survey.reply_deadline) >= new Date(new Date().toDateString())
})

async function fetchAll() {
  loading.value = true
  try {
    const res = await getPortalSurveyClassStatus(surveyId)
    classStatus.value = res.data as unknown as ClassStatus
  } finally {
    loading.value = false
  }
}

function formatAnswer(q: QuestionOut, answers: Record<string, unknown>): string {
  const v = answers?.[String(q.id)]
  if (v === undefined || v === null || v === '') return '-'
  if (Array.isArray(v)) return v.join('、')
  return String(v)
}

async function onRemind() {
  await ElMessageBox.confirm('對尚未回覆的家長推播提醒？', '一鍵提醒')
  const res = await portalRemindSurvey(surveyId)
  const data = res.data as unknown as { sent: number }
  ElMessage.success(`已推播 ${data.sent} 位家長`)
}

const fillDialogVisible = ref(false)
const fillTarget = ref<{ student_id: number; name: string } | null>(null)
const fillSubmitting = ref(false)
const fillForm = reactive<{ attending: boolean; answers: Record<string, unknown>; note: string }>({
  attending: true,
  answers: {},
  note: '',
})

function setAnswer(qid: number, v: unknown) {
  fillForm.answers[String(qid)] = v
}
function answerAsString(qid: number): string {
  const v = fillForm.answers[String(qid)]
  return typeof v === 'string' ? v : ''
}
function answerAsArray(qid: number): (string | number)[] {
  const v = fillForm.answers[String(qid)]
  return Array.isArray(v) ? v : []
}
function answerAsNumber(qid: number): number | undefined {
  const v = fillForm.answers[String(qid)]
  return typeof v === 'number' ? v : undefined
}

function openFillDialog(studentId: number, name: string, existing?: ResponseRow) {
  fillTarget.value = { student_id: studentId, name }
  fillForm.attending = existing?.attending ?? true
  fillForm.answers = existing ? { ...existing.answers } : {}
  fillForm.note = existing?.note ?? ''
  fillDialogVisible.value = true
}

async function onFillSubmit() {
  if (!fillTarget.value) return
  fillSubmitting.value = true
  try {
    const answers = fillForm.attending ? fillForm.answers : {}
    await portalFillResponse(surveyId, fillTarget.value.student_id, {
      attending: fillForm.attending,
      answers,
      note: fillForm.note || null,
    })
    ElMessage.success('已送出')
    fillDialogVisible.value = false
    await fetchAll()
  } finally {
    fillSubmitting.value = false
  }
}

onMounted(fetchAll)
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}
.summary__text {
  white-space: nowrap;
}
.summary :deep(.el-progress) {
  flex: 1;
}
.not-replied-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.answers {
  padding: 8px 16px;
}
.answers__row {
  margin-bottom: 4px;
}
.answers__label {
  color: var(--el-text-color-secondary);
}
</style>
