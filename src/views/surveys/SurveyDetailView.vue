<template>
  <div class="survey-detail" v-loading="loading">
    <div class="header">
      <h2>{{ survey?.title }}</h2>
      <el-button :icon="Download" @click="onExport">匯出 Excel</el-button>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="統計" name="stats">
        <div class="stat-cards" v-if="stats">
          <el-card class="stat-card"><div class="stat-label">對象</div><div class="stat-value">{{ stats.denominator }}</div></el-card>
          <el-card class="stat-card"><div class="stat-label">已回覆</div><div class="stat-value">{{ stats.replied_count }}</div></el-card>
          <el-card class="stat-card"><div class="stat-label">參加</div><div class="stat-value">{{ stats.attending_count }}</div></el-card>
          <el-card class="stat-card"><div class="stat-label">回覆率</div><div class="stat-value">{{ (stats.reply_rate * 100).toFixed(0) }}%</div></el-card>
        </div>

        <h3>各班回覆進度</h3>
        <div v-if="stats" class="classroom-progress">
          <div v-for="c in stats.by_classroom" :key="c.classroom_id ?? c.classroom_name" class="classroom-progress__row">
            <span class="classroom-progress__name">{{ c.classroom_name }}</span>
            <el-progress :percentage="c.total ? Math.round((c.replied / c.total) * 100) : 0" :format="() => `${c.replied}/${c.total}`" />
            <span class="classroom-progress__attending">參加 {{ c.attending }}</span>
          </div>
        </div>

        <h3>附加題統計</h3>
        <div v-if="stats" class="question-stats">
          <el-card v-for="q in stats.questions" :key="q.question_id" class="question-stat-card" shadow="never">
            <div class="question-stat-title">{{ q.question_text }}</div>
            <ul v-if="q.option_counts">
              <li v-for="(count, opt) in q.option_counts" :key="opt">{{ opt }}：{{ count }}</li>
            </ul>
            <div v-else-if="q.question_type === 'number'">總和 {{ q.sum ?? 0 }}／平均 {{ (q.avg ?? 0).toFixed(1) }}</div>
            <ul v-else-if="q.texts">
              <li v-for="(t, i) in q.texts" :key="i">{{ t }}</li>
            </ul>
          </el-card>
        </div>

        <div class="not-replied-header">
          <h3>未回覆名單</h3>
          <el-button
            :disabled="!canRemind"
            @click="onRemind"
          >一鍵催覆</el-button>
        </div>
        <el-table :data="stats?.not_replied ?? []" border>
          <template #empty><el-empty description="全部已回覆" /></template>
          <el-table-column label="班級" prop="classroom_name" width="140" />
          <el-table-column label="姓名" prop="name" min-width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="回覆明細" name="responses">
        <el-table :data="responses" border>
          <template #empty><el-empty description="尚無回覆" /></template>
          <el-table-column label="班級" prop="classroom_name" width="120" />
          <el-table-column label="姓名" prop="student_name" width="100" />
          <el-table-column label="參加" width="80">
            <template #default="{ row }">{{ row.attending ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column
            v-for="q in survey?.questions ?? []"
            :key="q.id"
            :label="q.question_text"
            min-width="140"
          >
            <template #default="{ row }">{{ formatAnswer(q, row.answers) }}</template>
          </el-table-column>
          <el-table-column label="備註" prop="note" min-width="120">
            <template #default="{ row }">{{ row.note ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="代填" width="70">
            <template #default="{ row }"><el-tag v-if="row.is_proxy" type="warning">代填</el-tag></template>
          </el-table-column>
          <el-table-column label="更新時間" width="160">
            <template #default="{ row }">{{ row.updated_at ?? '-' }}</template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openFillDialog(row)">代填／修改</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="fillDialogVisible" title="代填回覆" width="500px">
      <el-form v-if="fillTarget" label-width="80px">
        <el-form-item label="家長姓名">{{ fillTarget.student_name }}</el-form-item>
        <el-form-item label="是否參加">
          <el-radio-group v-model="fillForm.attending">
            <el-radio :label="true">參加</el-radio>
            <el-radio :label="false">不參加</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="fillForm.attending">
          <el-form-item v-for="q in survey?.questions ?? []" :key="q.id" :label="q.question_text">
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
import { Download } from '@element-plus/icons-vue'
import { adminFillResponse, exportSurvey, getSurvey, getSurveyResponses, getSurveyStats, remindSurvey } from '@/api/surveys'
import { hasPermission } from '@/utils/auth'

interface QuestionOut {
  id: number
  question_text: string
  question_type: 'single_choice' | 'multi_choice' | 'number' | 'text'
  options: string[] | null
  is_required: boolean
  sort_order: number
}
interface SurveyDetail {
  id: number
  title: string
  status: string
  reply_deadline: string
  questions: QuestionOut[]
}
interface StatsClassroom { classroom_id: number | null; classroom_name: string; replied: number; total: number; attending: number }
interface StatsNotReplied { classroom_id: number | null; classroom_name: string; name: string; student_id: number }
interface StatsQuestion {
  question_id: number
  question_text: string
  question_type: string
  option_counts?: Record<string, number> | null
  sum?: number | null
  avg?: number | null
  texts?: string[] | null
}
interface Stats {
  denominator: number
  replied_count: number
  attending_count: number
  reply_rate: number
  attend_rate: number
  by_classroom: StatsClassroom[]
  not_replied: StatsNotReplied[]
  questions: StatsQuestion[]
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

const route = useRoute()
const canWrite = hasPermission('SURVEYS_WRITE')
const surveyId = Number(route.params.id)

const activeTab = ref('stats')
const loading = ref(false)
const survey = ref<SurveyDetail | null>(null)
const stats = ref<Stats | null>(null)
const responses = ref<ResponseRow[]>([])

const canRemind = computed(() => {
  if (!survey.value) return false
  if (survey.value.status !== 'published') return false
  return new Date(survey.value.reply_deadline) >= new Date(new Date().toDateString())
})

async function fetchAll() {
  loading.value = true
  try {
    const [surveyRes, statsRes, responsesRes] = await Promise.all([
      getSurvey(surveyId),
      getSurveyStats(surveyId),
      getSurveyResponses(surveyId),
    ])
    survey.value = surveyRes.data as unknown as SurveyDetail
    stats.value = statsRes.data as unknown as Stats
    responses.value = ((responsesRes.data as unknown as { items?: ResponseRow[] })?.items) ?? []
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
  await ElMessageBox.confirm('對尚未回覆的家長推播提醒？', '一鍵催覆')
  const res = await remindSurvey(surveyId)
  const data = res.data as unknown as { sent: number }
  ElMessage.success(`已推播 ${data.sent} 位家長`)
}

async function onExport() {
  const res = await exportSurvey(surveyId)
  const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `survey_${surveyId}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  ElMessage.success('匯出成功')
}

const fillDialogVisible = ref(false)
const fillTarget = ref<ResponseRow | null>(null)
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

function openFillDialog(row: ResponseRow) {
  fillTarget.value = row
  fillForm.attending = row.attending
  fillForm.answers = { ...row.answers }
  fillForm.note = row.note ?? ''
  fillDialogVisible.value = true
}

async function onFillSubmit() {
  if (!fillTarget.value) return
  fillSubmitting.value = true
  try {
    const answers = fillForm.attending ? fillForm.answers : {}
    await adminFillResponse(surveyId, fillTarget.value.student_id, {
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
  justify-content: space-between;
}
.stat-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  flex: 1;
  text-align: center;
}
.stat-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
}
.classroom-progress__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.classroom-progress__name {
  width: 100px;
}
.classroom-progress__row :deep(.el-progress) {
  flex: 1;
}
.question-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.question-stat-card {
  width: 260px;
}
.not-replied-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
